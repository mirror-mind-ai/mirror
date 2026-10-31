// CV24.DS6: Mirror's context for a host's turn -- the one doorman as a call.
//
// The terminal reaches the doorman through `mirror doorman` (CV9.DS8.US5): the
// Pi extension runs the bin before every turn and hands the printed block to
// the model as a hidden message. Mirror Desktop hosts this core in its own
// process, with no `mirror` bin, no environment and no skills, so it asks here
// instead, with the same decision, the same rendering and the same write.
//
// Three things differ from the command, each on purpose:
//
//   1. The key is an argument. The command's providers read
//      `OPENROUTER_API_KEY` from the environment, which the bins fill from
//      `~/.config/mirror/env`; a host keeps its key itself (Desktop: the
//      Keychain) and passes it per call. This module reads no environment
//      variable, and the extension context it collects runs with none.
//   2. A host's Conversation is in Mirror Mode from its first turn. On the
//      terminal the skill starts Mirror Mode and the doorman takes over from
//      the next turn; a host loads no skills, so an ordinary first turn would
//      get nothing, and so would every turn after it. Here a session not yet
//      in Mirror Mode gets the full folder, routed from the prompt, with the
//      Conversation's Journey; after that, the doorman decides as it always
//      does. A command turn still gets nothing (CR160's rule).
//   3. A delivering turn without a key is refused, not degraded: the host
//      says the turn went without Mirror's context instead of sending half of
//      it. A turn that delivers nothing needs no key.
//   4. The turn waits on this call, so each provider call is tried once,
//      within its own bound (`hostProviderEnv`). The command retries twice
//      with backoff; on a hanging network that is over a minute before the
//      person's turn starts. A failed call degrades, as on the terminal.
//
// The write goes through the front door's sanctioned live-write seam, behind
// its pre-write snapshot in the home's own `backups/`, exactly as
// `mirror doorman` writes; and only for a `current` database, as every other
// host call.

import { basename, dirname } from "node:path";
import { isCommandTurn } from "#conversation/commandTurn.ts";
import { DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import { openDatabaseReadOnly } from "#db/database.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import type { ProviderConfig } from "#providers/config.ts";
import { type EmbeddingProvider, LiveEmbeddingProvider } from "#providers/embedding.ts";
import { LiveLlmProvider, type LlmProvider } from "#providers/llm.ts";
import type { OpenRouterClient } from "#providers/openrouter.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import {
  type DoormanDecision,
  type DoormanSessionState,
  decideDoorman,
  doormanPersonas,
  forgetDoormanDelivery,
  readDoormanSessionState,
  runDoorman,
} from "./doorman.ts";

export type MirrorContextRejection = "invalid_request" | "no_key";

/** A call's own refusal; nothing was written. */
export class MirrorContextRejectedError extends Error {
  readonly reason: MirrorContextRejection;

  constructor(reason: MirrorContextRejection) {
    super(reason);
    this.reason = reason;
  }
}

export interface DeliverMirrorContextRequest {
  /** The host's session for the Conversation, as `ensureConversation` was given it. */
  sessionId: string;
  /** What the person typed. */
  prompt: string;
  /** The Conversation's Journey: the full folder is loaded with it. */
  journeyId?: string | null;
}

export interface DeliverMirrorContextOptions {
  /** The OpenRouter key for this call; never read from anywhere else. */
  apiKey?: string | null;
  /** Reception's classifier for the full folder; on unless turned off. */
  receptionEnabled?: boolean;
  /** Tests only: providers in place of the live ones the key would build. */
  providers?: { llm?: LlmProvider; embedding?: EmbeddingProvider };
}

export interface DeliveredMirrorContext {
  kind: DoormanDecision["kind"];
  /** The hidden message's text; empty when the turn gets nothing. */
  block: string;
  /** The session's persona and Journey after the delivery. */
  persona: string | null;
  journey: string | null;
}

/** The doorman's decision for a host's turn (rule 2 above); pure. */
export function decideHostTurn(input: {
  prompt: string;
  state: DoormanSessionState | null;
  personas: Parameters<typeof decideDoorman>[0]["personas"];
}): DoormanDecision {
  const decided = decideDoorman(input);
  // In Mirror Mode the doorman answers nothing only for a command turn, which
  // gets nothing here too; so its nothing stands for a command alone.
  if (decided.kind !== "nothing" || isCommandTurn(input.prompt)) return decided;
  return { kind: "full", query: input.prompt };
}

function requiredText(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > limit) {
    throw new MirrorContextRejectedError("invalid_request");
  }
  return value;
}

function assertCurrent(dbPath: string): void {
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
}

/**
 * The providers' environment for a host call: the key, one attempt per call,
 * and the embedding bounded like reception (10 s). A full turn makes one
 * reception call and, with attachments, one embedding; a delta, one embedding.
 * So a turn waits at most about 20 s on its providers.
 */
export function hostProviderEnv(apiKey: string): Record<string, string> {
  return {
    OPENROUTER_API_KEY: apiKey,
    MEMORY_LLM_MAX_RETRIES: "0",
    MEMORY_LLM_TIMEOUT_RECEPTION: "10",
    MEMORY_LLM_TIMEOUT_EMBEDDING: "10",
  };
}

/** The live providers a key builds for a host call; `createClient` is the tests' seam. */
export function hostProviders(
  apiKey: string,
  createClient?: (config: ProviderConfig) => OpenRouterClient,
): { llm: LlmProvider; embedding: EmbeddingProvider } {
  const env = hostProviderEnv(apiKey);
  return {
    llm: new LiveLlmProvider({ env, ...(createClient ? { createClient } : {}) }),
    embedding: new LiveEmbeddingProvider({ env, ...(createClient ? { createClient } : {}) }),
  };
}

const MAX_PROMPT_CHARS = 200_000;
const MAX_ID_CHARS = 4_096;

/**
 * Mirror's context for one turn of the Conversation `request.sessionId` names:
 * nothing, the full folder, or a delta, rendered as the hidden message's text
 * and recorded as `mirror doorman` records it.
 */
export async function deliverMirrorContext(
  dbPath: string,
  request: DeliverMirrorContextRequest,
  options: DeliverMirrorContextOptions = {},
): Promise<DeliveredMirrorContext> {
  const sessionId = requiredText(request?.sessionId, MAX_ID_CHARS);
  const prompt = requiredText(request?.prompt, MAX_PROMPT_CHARS);
  const journeyId = request?.journeyId ?? null;
  if (journeyId !== null && typeof journeyId !== "string") {
    throw new MirrorContextRejectedError("invalid_request");
  }
  assertCurrent(dbPath);

  const read = openDatabaseReadOnly(dbPath);
  let decision: DoormanDecision;
  try {
    decision = decideHostTurn({
      prompt,
      state: readDoormanSessionState(read, sessionId),
      personas: doormanPersonas(read),
    });
  } finally {
    read.close();
  }
  if (decision.kind === "nothing")
    return { kind: "nothing", block: "", persona: null, journey: null };

  const apiKey = typeof options.apiKey === "string" ? options.apiKey.trim() : "";
  if (!apiKey && !options.providers) throw new MirrorContextRejectedError("no_key");
  const receptionEnabled = options.receptionEnabled !== false;
  const { llm, embedding } = options.providers ?? hostProviders(apiKey);

  const db = openLiveWriteDatabase(dbPath);
  try {
    const mirrorHome = dirname(dbPath);
    const rendered = await runDoorman(db, decision, {
      identity: basename(mirrorHome),
      databasePath: dbPath,
      mirrorHome,
      user: basename(mirrorHome),
      sessionId,
      journey: decision.kind === "full" ? journeyId : undefined,
      receptionEnabled,
      llmProvider: receptionEnabled ? llm : undefined,
      embeddingProvider: embedding,
      extensionRuntime: { environment: {} },
      newId,
      nowIso,
    });
    const state = readDoormanSessionState(db, sessionId);
    return {
      kind: decision.kind,
      block: rendered.stdout,
      persona: state?.persona ?? null,
      journey: state?.journey ?? null,
    };
  } finally {
    db.close();
  }
}

/**
 * The host compacted the Conversation's transcript: the folder left it, so the
 * next turn delivers it whole again. An unknown session is nothing to mark.
 */
export function forgetMirrorContext(dbPath: string, request: { sessionId: string }): void {
  const sessionId = requiredText(request?.sessionId, MAX_ID_CHARS);
  assertCurrent(dbPath);
  const read = openDatabaseReadOnly(dbPath);
  let known: boolean;
  try {
    known = readDoormanSessionState(read, sessionId) !== null;
  } finally {
    read.close();
  }
  // Nothing to mark, so no snapshot is paid for it.
  if (!known) return;
  const db = openLiveWriteDatabase(dbPath);
  try {
    forgetDoormanDelivery(db, sessionId, nowIso());
  } finally {
    db.close();
  }
}
