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
//   2. Mirror Mode active, an ordinary turn -> the prompt is routed with
//      `detectPersona` (a keyword score, no model call); a persona that newly
//      scores has its section delivered and becomes the session's; the
//      memories and attachments relevant to the prompt follow; the identity
//      layers are not repeated -- they already sit in the transcript;
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
// counted once in `llm_calls` (DS8 decision 1); on the explicit turn, what
// `mirror load --query` costs today (reception's LLM call when enabled, the
// attachment embedding), plus the skill's own load until TS3 teaches it to
// trust this line.

import type { Database, WritableDatabase } from "#db/database.ts";
import { memoriesById } from "#frontDoor/searchRoute.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { detectPersona, type PersonaRoutingRow } from "#persona/detectPersona.ts";
import { type EmbeddingProvider, generateEmbeddingSafely } from "#providers/embedding.ts";
import { searchMemoriesWithStatus } from "#search/memorySearch.ts";
import { relevantAttachments } from "./context.ts";
import { personaRoutingRows } from "./defaultResolution.ts";
import { mirrorForm } from "./mirrorForm.ts";
import { type MirrorLoadInput, runMirrorLoad } from "./orchestration.ts";
import { getRuntimeSession, updateRuntimeSessionColumns } from "./runtimeSession.ts";

/** The session's Mirror fields as the decision reads them; null when unnamed or unknown. */
export interface DoormanSessionState {
  readonly active: boolean;
  readonly persona: string | null;
  readonly journey: string | null;
}

export type DoormanDecision =
  | { readonly kind: "nothing" }
  | { readonly kind: "full"; readonly query: string }
  | {
      readonly kind: "delta";
      readonly query: string;
      /** The persona that newly scored, or null when the session's stands. */
      readonly persona: string | null;
    };

/** The stable prefix TS3's skill reads; everything after the colon varies. */
export const DELIVERED_LINE_PREFIX = "=== mirror context delivered by the runtime for this turn";

/** How many memories a delta carries. The threshold DS8 names is set from US5's measurement, not here. */
export const DOORMAN_MEMORY_LIMIT = 5;

export function readDoormanSessionState(
  db: Database,
  sessionId: string | null,
): DoormanSessionState | null {
  if (!sessionId) return null;
  const session = getRuntimeSession(db, sessionId);
  if (!session) return null;
  return { active: session.mirrorActive, persona: session.persona, journey: session.journey };
}

export function decideDoorman(input: {
  prompt: string;
  state: DoormanSessionState | null;
  personas: readonly PersonaRoutingRow[];
}): DoormanDecision {
  const explicit = mirrorForm(input.prompt);
  if (explicit) return { kind: "full", query: explicit.query };
  if (!input.state?.active) return { kind: "nothing" };
  const match = detectPersona(input.prompt, input.personas)[0]?.key ?? null;
  const persona = match !== null && match !== input.state.persona ? match : null;
  return { kind: "delta", query: input.prompt, persona };
}

export function deliveredLine(input: {
  kind: "full" | "delta";
  persona: string | null;
  journey: string | null;
}): string {
  const clause = input.persona
    ? `answer as the mirror; sign ◇ ${input.persona}`
    : "answer as the mirror";
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
   * Where a delta turn's memory scores go, so the threshold DS8 names can be set
   * from measurement (US5's live walk) rather than invented here. Content-free:
   * numbers only.
   */
  onMemoryScores?: (scores: readonly number[]) => void;
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
    // The folder reached the model, so the legacy once-injection (the inject
    // hook's case 2, until US4) owes nothing. The doorman itself never reads
    // this column; US4 retires its last reader and this write with it.
    updateRuntimeSessionColumns(db, input.sessionId, { hookInjected: true }, input.nowIso());
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
  const persona = decision.persona ?? state?.persona ?? null;
  const journey = state?.journey ?? null;
  const parts: string[] = [deliveredLine({ kind: "delta", persona, journey })];

  if (decision.persona) {
    const content = getIdentityContent(db, "persona", decision.persona);
    if (content) parts.push(`=== persona/${decision.persona} ===\n${content}`);
    if (input.sessionId) {
      updateRuntimeSessionColumns(
        db,
        input.sessionId,
        { persona: decision.persona },
        input.nowIso(),
      );
    }
  }

  // One embedding for the turn, in the ledger once; both searches share it.
  // Without a provider, or when it fails, the memory search degrades to FTS
  // and the attachments are skipped: the delta still carries the line and the
  // persona.
  const queryEmbedding = await embedOnce(db, decision.query, input);

  const memories = await searchMemoriesWithStatus(db, {
    query: decision.query,
    limit: DOORMAN_MEMORY_LIMIT,
    provider: input.embeddingProvider,
    ...(queryEmbedding ? { queryEmbedding } : {}),
    // The doorman searches on the system's behalf N times a session: a turn's
    // injection must not raise a memory's reinforcement for the next turn
    // (AI-12). Reinforcement stays with the explicit load.
    logAccess: false,
    recordEmbeddingLedger: false,
    now: input.nowIso(),
  });
  input.onMemoryScores?.(memories.results.map((result) => result.score));
  if (memories.results.length > 0) {
    const rows = memoriesById(
      db,
      memories.results.map((result) => result.id),
    );
    const block = ["=== relevant memories ==="];
    for (const result of memories.results) {
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

/** The persona routing table the decision scores against; read once per turn. */
export function doormanPersonas(db: Database): PersonaRoutingRow[] {
  return personaRoutingRows(db);
}
