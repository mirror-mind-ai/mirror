// The one doorman (CV9.DS8.TS2).
//
// Mirror Mode is the product: the folder `mirror mirror load` builds from the
// database, open before the model answers. What is at stake is always whether
// the folder reaches the model, and when. Until DS8 there were three doormen
// with three policies (the Claude-family inject hook, Antigravity's
// PreInvocation, and none on Pi), and wherever one existed the skill's own
// hard constraint made an explicit turn load twice (CR165, measured on Pi
// 1.4.0, 2026-10-24).
//
// This module is the one decision. Given a turn's prompt and the session's
// state it answers NOTHING, THE FULL FOLDER, or A DELTA:
//
//   1. the explicit Mirror form in the prompt -> the full folder, routed from
//      the query, before the first token; the session marked active by its id;
//   2. Mirror Mode active, an ordinary turn -> the turn's persona is routed
//      by its subject (CR203, `personaRouter.ts`): the router's answer, else
//      the Journey's own default, else none -- never the session's by
//      inheritance; a persona the conversation has not read yet has its
//      section delivered; the memories and attachments relevant to the prompt
//      follow; the identity layers are not repeated -- they already sit in
//      the transcript;
//      a skill invocation other than the Mirror form is not a question and
//      gets nothing (CR160's command-turn rule);
//   3. Mirror Mode not active -> nothing. The model's own routing may invoke
//      the skill; the session learns that load from the harness (TS1), and the
//      doorman takes over from the next turn.
//
// `decideDoorman` is pure: no database, no clock, no provider. `runDoorman`
// renders and writes, at the edge. The hooks (US4, TS6) call both in-process;
// the Pi extension (US5) reaches them through `mirror doorman`. Neither is
// rewired here.
//
// Every block the doorman delivers opens with one line the model reads
// (`deliveredLine`), on every active turn, even with nothing under it: it is
// what carries the persona across the conversation. On an ordinary turn the
// skill is never invoked, so this line is the only Mirror text that reaches
// the model -- the signature rule (`AGENTS.md`: `◇ persona-name`) rides in it.
//
// What a turn costs: nothing when Mirror Mode is off; on an ordinary active
// turn, ONE embedding, shared by the memory and attachment searches and
// counted once in `llm_calls` (DS8 decision 1), and ONE persona-routing call,
// made beside the embedding, not after it (CR203); on the explicit turn, what
// `mirror load --query` costs today (reception's LLM call when enabled, the
// attachment embedding), plus the skill's own load until TS3 teaches it to
// trust this line.

import { isCommandTurn } from "#conversation/commandTurn.ts";
import type { Database, WritableDatabase } from "#db/database.ts";
import { memoriesById } from "#frontDoor/searchRoute.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { getActiveOperatingMode } from "#mode/operatingMode.ts";
import { embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { type EmbeddingProvider, generateEmbeddingSafely } from "#providers/embedding.ts";
import { searchMemoriesWithStatus } from "#search/memorySearch.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";
import { relevantAttachments } from "./context.ts";
import { mirrorForm } from "./mirrorForm.ts";
import { type MirrorLoadInput, runMirrorLoad } from "./orchestration.ts";
import { personaRoutingLedger, routeTurnPersona } from "./personaRouter.ts";
import {
  decodeMetadata,
  getRuntimeSession,
  updateRuntimeSessionColumns,
} from "./runtimeSession.ts";

/** The session's Mirror fields as the decision reads them; null when unnamed or unknown. */
export interface DoormanSessionState {
  readonly active: boolean;
  readonly persona: string | null;
  readonly journey: string | null;
  /**
   * The folder left the transcript (the runtime compacted it, and said so
   * through `forgetDoormanDelivery`): the next ordinary turn is full again.
   */
  readonly refresh?: boolean;
}

export type DoormanDecision =
  | { readonly kind: "nothing" }
  | { readonly kind: "full"; readonly query: string }
  | {
      readonly kind: "delta";
      readonly query: string;
    };

/** The stable prefix TS3's skill reads; everything after the colon varies. */
export const DELIVERED_LINE_PREFIX = "=== mirror context delivered by the runtime for this turn";

/** How many memories a delta carries at most. */
export const DOORMAN_MEMORY_LIMIT = 5;

/**
 * The threshold DS8's policy names ("injected when any score above the
 * threshold"), on the SEMANTIC score the ranker reports -- the cosine of the
 * prompt and the memory -- not the hybrid one (CV9.DS8.US5). The hybrid is
 * half recency, reinforcement, relevance, and lexical: a fresh, reinforced,
 * relevance-1 memory floors at 0.35 with no semantic match and would pass a
 * composite 0.40 at cosine 0.10, which unrelated texts reach routinely; the 27
 * composite rows TS2 and US4 logged (off-topic deltas topping at 0.331-0.377,
 * 3 of 5 memories repeating; on-topic at 0.444-0.448 and 0.587-0.591) show the
 * gap in one home, not a property. 0.4 is the rule `relevantAttachments`
 * already applies to attachments: one rule for both. Inclusive. A degraded
 * search (no embedding) reports no semantic score and keeps TS2's FTS
 * behavior: a lexical hit is relevance by another signal, not a miss.
 */
export const DOORMAN_MEMORY_SEMANTIC_THRESHOLD = 0.4;

/**
 * Where the session remembers the memories the doorman has delivered
 * (`runtime_sessions.metadata`, beside `operating_mode`). Every delta is a
 * message that stays in the transcript, and US4 measured 3 of 5 memories
 * repeating on a follow-up: a delta skips what the conversation already holds
 * and fills from the next ones above the threshold. A full load starts the
 * list over -- the folder is fresh, and so is what the model has read.
 */
export const DOORMAN_DELIVERED_METADATA_KEY = "doorman_delivered";

/**
 * The personas whose section the conversation already holds (CR203). A turn
 * may now have none, so "the session's persona" no longer says which sections
 * the transcript carries: a writer turn, a turn with none, and a writer turn
 * again must deliver the writer's section once. A full load starts the list
 * over with its own persona.
 */
export const DOORMAN_PERSONAS_METADATA_KEY = "doorman_personas";

/**
 * Set on the session when the runtime compacted the transcript (the Pi
 * extension's `session_compact`, CV9.DS8.US5): a delta's premise -- the
 * identity layers already sit in the transcript -- no longer holds, so the
 * next ordinary turn in Mirror Mode delivers the full folder, routed from that
 * prompt, and the full load clears the flag.
 */
export const DOORMAN_REFRESH_METADATA_KEY = "doorman_refresh";

/**
 * The runtime says the folder left the transcript: the next ordinary turn is
 * full, and the delivered list is forgotten with it. Unknown session: no-op.
 */
export function forgetDoormanDelivery(
  db: WritableDatabase,
  sessionId: string,
  nowIso: string,
): void {
  const session = getRuntimeSession(db, sessionId);
  if (!session) return;
  const metadata = decodeMetadata(session.metadata);
  metadata[DOORMAN_REFRESH_METADATA_KEY] = true;
  metadata[DOORMAN_DELIVERED_METADATA_KEY] = [];
  metadata[DOORMAN_PERSONAS_METADATA_KEY] = [];
  updateRuntimeSessionColumns(db, sessionId, { metadata: pythonJsonDumps(metadata) }, nowIso);
}

/** How many ranked memories a delta may read through to fill its five. */
const DOORMAN_SEARCH_CEILING = 25;

function deliveredList(db: Database, sessionId: string | null, key: string): Set<string> {
  if (!sessionId) return new Set();
  const raw = decodeMetadata(getRuntimeSession(db, sessionId)?.metadata ?? null)[key];
  return new Set(
    Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [],
  );
}

function deliveredMemoryIds(db: Database, sessionId: string | null): Set<string> {
  return deliveredList(db, sessionId, DOORMAN_DELIVERED_METADATA_KEY);
}

function rememberDelivered(
  db: WritableDatabase,
  sessionId: string | null,
  ids: readonly string[],
  nowIso: string,
  options: { clearRefresh?: boolean; personas?: readonly string[] } = {},
): void {
  if (!sessionId) return;
  const session = getRuntimeSession(db, sessionId);
  if (!session) return;
  const metadata = decodeMetadata(session.metadata);
  metadata[DOORMAN_DELIVERED_METADATA_KEY] = [...ids];
  if (options.personas) metadata[DOORMAN_PERSONAS_METADATA_KEY] = [...options.personas];
  if (options.clearRefresh) delete metadata[DOORMAN_REFRESH_METADATA_KEY];
  updateRuntimeSessionColumns(db, sessionId, { metadata: pythonJsonDumps(metadata) }, nowIso);
}

function rememberPersonas(
  db: WritableDatabase,
  sessionId: string | null,
  personas: readonly string[],
  nowIso: string,
): void {
  if (!sessionId) return;
  const session = getRuntimeSession(db, sessionId);
  if (!session) return;
  const metadata = decodeMetadata(session.metadata);
  metadata[DOORMAN_PERSONAS_METADATA_KEY] = [...personas];
  updateRuntimeSessionColumns(db, sessionId, { metadata: pythonJsonDumps(metadata) }, nowIso);
}

/** One ranked memory's scores, content-free, for the front-door log. */
export interface MemoryScore {
  readonly score: number;
  readonly semantic: number;
}

/**
 * The session's state as the decision reads it. "Mirror Mode on" is
 * `mirror_active` -- which only `mirror deactivate` clears -- AND the active
 * operating mode (the session's own row, else the global one) still being
 * Mirror Mode (CV9.DS8.US4). `build load`, `explore`, and `soul load` switch the
 * mode and leave the column set; read alone, it would put "answer as the
 * mirror" on every Builder turn of a session that was once in Mirror Mode. A
 * home with no mode record at all leaves the column to decide.
 */
export function readDoormanSessionState(
  db: Database,
  sessionId: string | null,
): DoormanSessionState | null {
  if (!sessionId) return null;
  const session = getRuntimeSession(db, sessionId);
  if (!session) return null;
  const mode = getActiveOperatingMode(db, sessionId);
  const inMirrorMode = mode === null || mode.mode === "Mirror Mode";
  return {
    active: session.mirrorActive && inMirrorMode,
    persona: session.persona,
    journey: session.journey,
    refresh: decodeMetadata(session.metadata)[DOORMAN_REFRESH_METADATA_KEY] === true,
  };
}

export function decideDoorman(input: {
  prompt: string;
  state: DoormanSessionState | null;
}): DoormanDecision {
  const explicit = mirrorForm(input.prompt);
  if (explicit) return { kind: "full", query: explicit.query };
  if (!input.state?.active) return { kind: "nothing" };
  // A skill invocation is not a question to the mirror (CR160's rule for the
  // logger, held here since CV9.DS8.US5's walk): `/mm-build`, `/mm-journeys`,
  // `/mm-explore` paid an embedding and got a delta, and one Builder card was
  // signed. The Mirror form, the one skill whose argument IS the question,
  // was answered above.
  if (isCommandTurn(input.prompt)) return { kind: "nothing" };
  // The runtime compacted the transcript: the folder is a summary now, so this
  // turn delivers it whole, routed from the prompt, and the deltas resume after.
  if (input.state.refresh) return { kind: "full", query: input.prompt };
  // The persona is not decided here: routing it is a model call (CR203), and
  // this function stays pure. `runDoorman` routes it, beside the embedding.
  return { kind: "delta", query: input.prompt };
}

/**
 * What the line says when a turn has no persona (CR203). Draft wording, for the
 * prompt engineer to settle in review: no signature, and no earlier persona
 * carried over.
 */
export const NO_PERSONA_CLAUSE =
  "no persona this turn: do not sign, and do not answer as an earlier persona";

export function deliveredLine(input: {
  kind: "full" | "delta";
  persona: string | null;
  journey: string | null;
}): string {
  // CR203: a turn may have no persona, and the model must hear that as this
  // turn's answer, not as silence it may fill with the last persona it signed.
  const clause = input.persona
    ? `answer as the mirror; sign ◇ ${input.persona}`
    : `answer as the mirror; ${NO_PERSONA_CLAUSE}`;
  const what =
    input.kind === "full"
      ? "full"
      : `delta (persona: ${input.persona ?? "none"} · journey: ${input.journey ?? "none"})`;
  return `${DELIVERED_LINE_PREFIX}: ${what} — ${clause} ===`;
}

export interface RunDoormanInput
  extends Omit<MirrorLoadInput, "query" | "contextOnly" | "sessionId" | "environmentSessionId"> {
  /** The named session, or null: an unnamed explicit turn loads without marking one. */
  sessionId: string | null;
  embeddingProvider?: EmbeddingProvider;
  /**
   * Where a delta turn's memory scores go -- every ranked memory's, the ones
   * under the threshold included -- so the threshold is read against
   * measurement (US5's live walk), not invented. Content-free: numbers only.
   */
  onMemoryScores?: (scores: readonly MemoryScore[]) => void;
}

export interface RenderedDoorman {
  stdout: string;
  stderr: string;
}

/**
 * Render and write for a decision already taken. The caller opened `db` for
 * writing only because the decision is `full` or `delta`: a `nothing` turn must
 * never reach a writable handle (the live-write path snapshots the database
 * first, 95 ms measured), which is why decide and run are two steps.
 */
export async function runDoorman(
  db: WritableDatabase,
  decision: DoormanDecision,
  input: RunDoormanInput,
): Promise<RenderedDoorman> {
  if (decision.kind === "nothing") return { stdout: "", stderr: "" };
  if (decision.kind === "full") return runFull(db, decision.query, input);
  return runDelta(db, decision, input);
}

async function runFull(
  db: WritableDatabase,
  query: string,
  input: RunDoormanInput,
): Promise<RenderedDoorman> {
  const loaded = await runMirrorLoad(db, {
    ...input,
    query: query || null,
    contextOnly: true,
    sessionId: input.sessionId,
  });
  if (input.sessionId) {
    // The conversation's context starts over with the folder: so does the
    // list of memories the deltas have put in it, and a compaction's refresh
    // is answered.
    rememberDelivered(db, input.sessionId, [], input.nowIso(), {
      clearRefresh: true,
      personas: loaded.resolved.persona ? [loaded.resolved.persona] : [],
    });
  }
  const line = deliveredLine({
    kind: "full",
    persona: loaded.resolved.persona,
    journey: loaded.resolved.journey,
  });
  return { stdout: `${line}\n${loaded.stdout}`, stderr: loaded.stderr };
}

async function runDelta(
  db: WritableDatabase,
  decision: Extract<DoormanDecision, { kind: "delta" }>,
  input: RunDoormanInput,
): Promise<RenderedDoorman> {
  const state = readDoormanSessionState(db, input.sessionId);
  const journey = state?.journey ?? null;
  // The turn's persona and its embedding, side by side: neither waits on the
  // other. One embedding for the turn, in the ledger once; both searches share
  // it. Without a provider, or when it fails, the memory search degrades to FTS
  // and the attachments are skipped: the delta still carries the line and the
  // persona.
  const [turn, queryEmbedding] = await Promise.all([
    routeTurnPersona(db, {
      prompt: decision.query,
      journey,
      router: input.personaRouter,
      onRouting: personaRoutingLedger(db, { sessionId: input.sessionId, now: input.nowIso }),
    }),
    embedOnce(db, decision.query, input),
  ]);
  const persona = turn.persona;
  const parts: string[] = [deliveredLine({ kind: "delta", persona, journey })];

  const deliveredPersonas = deliveredList(db, input.sessionId, DOORMAN_PERSONAS_METADATA_KEY);
  if (persona && !deliveredPersonas.has(persona)) {
    const content = getIdentityContent(db, "persona", persona);
    if (content) {
      parts.push(`=== persona/${persona} ===\n${content}`);
      rememberPersonas(db, input.sessionId, [...deliveredPersonas, persona], input.nowIso());
    }
  }
  // The session records the turn's answer, none included: a session's persona
  // is the last turn's, not a default the next turn inherits.
  if (input.sessionId && persona !== (state?.persona ?? null)) {
    updateRuntimeSessionColumns(db, input.sessionId, { persona }, input.nowIso());
  }

  const delivered = deliveredMemoryIds(db, input.sessionId);
  const memories = await searchMemoriesWithStatus(db, {
    query: decision.query,
    // Read past what the transcript already holds, so a delta still fills.
    limit: Math.min(DOORMAN_MEMORY_LIMIT + delivered.size, DOORMAN_SEARCH_CEILING),
    provider: input.embeddingProvider,
    ...(queryEmbedding ? { queryEmbedding } : {}),
    // The doorman searches on the system's behalf N times a session: a turn's
    // injection must not raise a memory's reinforcement for the next turn
    // (AI-12). Reinforcement stays with the explicit load.
    logAccess: false,
    recordEmbeddingLedger: false,
    now: input.nowIso(),
  });
  input.onMemoryScores?.(
    memories.results.map((result) => ({ score: result.score, semantic: result.semantic })),
  );
  const relevant = (
    memories.degraded
      ? memories.results
      : memories.results.filter((result) => result.semantic >= DOORMAN_MEMORY_SEMANTIC_THRESHOLD)
  )
    .filter((result) => !delivered.has(result.id))
    .slice(0, DOORMAN_MEMORY_LIMIT);
  if (relevant.length > 0) {
    rememberDelivered(
      db,
      input.sessionId,
      [...delivered, ...relevant.map((result) => result.id)],
      input.nowIso(),
    );
    const rows = memoriesById(
      db,
      relevant.map((result) => result.id),
    );
    const block = ["=== relevant memories ==="];
    for (const result of relevant) {
      const memory = rows.get(result.id);
      if (!memory) continue;
      block.push(`\n[${memory.layer}] ${memory.title}\n${memory.content}`);
    }
    parts.push(block.join("\n"));
  }

  if (queryEmbedding) {
    const attachments = await relevantAttachments(
      db,
      decision.query,
      journey,
      undefined,
      undefined,
      queryEmbedding,
    );
    if (attachments.length > 0) {
      const block = ["=== relevant attachments ==="];
      for (const { row, score } of attachments) {
        const source = journey ? "" : ` [${row.journeyId}]`;
        block.push(`--- ${row.name}${source} (score: ${score.toFixed(3)}) ---`);
        if (row.description) block.push(`Description: ${row.description}`);
        block.push(row.content);
      }
      parts.push(block.join("\n"));
    }
  }

  return { stdout: `${parts.join("\n\n")}\n`, stderr: "" };
}

async function embedOnce(
  db: WritableDatabase,
  query: string,
  input: RunDoormanInput,
): Promise<readonly number[] | null> {
  if (!input.embeddingProvider) return null;
  try {
    return await generateEmbeddingSafely(input.embeddingProvider, query, {
      onAttempt: embeddingLedgerHook(db, {
        sessionId: input.sessionId,
        now: input.nowIso,
      }),
    });
  } catch {
    return null;
  }
}
