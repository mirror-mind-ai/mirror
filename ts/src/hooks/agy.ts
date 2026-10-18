// Antigravity hook entries (CV21.DS7.TS2).
//
// agy runs the plugin's `hooks.json` handlers with camelCase protojson on
// stdin and reads JSON from stdout (`injectSteps`; a `systemMessage` step
// nests its text, an `ephemeralMessage` is a plain string). The contracts
// are committed bytes in CV21.DS7.US1's `evidence/` (agy 1.4.2).
//
// Two handlers:
//
//   * `agy:session-start` — turn conversation logging on, the posture every
//     runtime's session-start shares, and answer `{}`. The Operating
//     Instructions are NOT delivered here: `rules/AGENTS.md` carries them
//     (US1), unless TS2's live route shows otherwise — the measured
//     fallback would add an `injectSteps` `systemMessage` in this handler.
//
//   * `agy:pre-invocation` — inject Mirror Mode context once per user turn.
//     `PreInvocation` fires before EVERY model call (32 times over two
//     turns, DS12.TS3 L2), with `invocationNum` resetting to 0 at each user
//     turn; protojson omits zero-valued fields, so an ABSENT invocationNum
//     is 0. The generated wrapper already gates on this before Node is
//     spawned; the gate here is defense in depth. The injection is an
//     `ephemeralMessage` — dropped after the turn — for two reasons: the
//     adapter re-injects per turn, so a persistent step would accumulate;
//     and the content is identity and memory, so ephemeral is the
//     data-minimizing choice against agy's stored trajectory.
//
// agy payloads carry no prompt or reply text (L7): there is no `--query`,
// and the explicit Mirror form reaches the model through the skill (L4),
// never through these hooks. The quiet session — a `conversationId` no
// runtime session binds (every session until TS3 lands), or one bound with
// Mirror Mode off — answers `{}`: Mirror on agy is invisible until invoked.
//
// Payload fields stay inert: `conversationId` flows only through array
// argv, never a shell, and failures recorded in hooks.log are facts, never
// payload text.

import { readAgyTurns } from "#conversation/agyTranscript.ts";
import { isCommandTurn } from "#conversation/commandTurn.ts";
import { logAssistantMessage, logUserMessage } from "#conversation/logger.ts";
import { resolveDbPath } from "#frontDoor/dbPath.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import { decodeMetadata, getRuntimeSession, upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { readMirrorState } from "./mirrorState.ts";
import { noteHookFailure, runFrontDoor, runFrontDoorQuietly } from "./runtime.ts";

/** agy's empty answer, which every path that injects nothing must print. */
const EMPTY = "{}\n";

interface AgyPayload {
  readonly conversationId: string;
  readonly invocationNum: number;
  readonly transcriptPath: string;
}

/** The key under which the Stop handler stores its high-water step_index. */
const HIGH_WATER_KEY = "agy_last_step_index";

/**
 * Parse agy's camelCase protojson payload. Anything malformed reads as the
 * empty payload: a hook never fails the turn over stdin it did not write.
 */
export function parseAgyPayload(stdin: string): AgyPayload {
  try {
    const raw: unknown = JSON.parse(stdin);
    if (typeof raw !== "object" || raw === null) return { conversationId: "", invocationNum: 0 };
    const record = raw as Record<string, unknown>;
    return {
      conversationId: typeof record.conversationId === "string" ? record.conversationId : "",
      // protojson omits zero-valued fields: absent IS 0.
      invocationNum: typeof record.invocationNum === "number" ? record.invocationNum : 0,
      transcriptPath: typeof record.transcriptPath === "string" ? record.transcriptPath : "",
    };
  } catch {
    return { conversationId: "", invocationNum: 0, transcriptPath: "" };
  }
}

/** `SessionStart`: logging on, answer the contract. */
export async function agySessionStart(): Promise<number> {
  await runFrontDoorQuietly("agy:session-start", ["conversation-logger", "session-start"]);
  process.stdout.write(EMPTY);
  return 0;
}

/**
 * `Stop`: fires at the end of each user turn (agy has no SessionEnd hook).
 * Read the transcript, append the turns past the stored high-water
 * `step_index` as `antigravity`, and leave the conversation open — session
 * maintenance closes it as a stale orphan, the path Codex uses (Shape A).
 *
 * A re-fired Stop, or a grown transcript whose turns are all logged, adds
 * nothing: the high-water mark is the idempotency key. A skill turn is
 * skipped, the one-home rule. Any failure is recorded in hooks.log, never
 * fails the turn, and the handler always answers agy's contract.
 */
export async function agyStop(stdin: string): Promise<number> {
  const payload = parseAgyPayload(stdin);
  if (!payload.conversationId || !payload.transcriptPath) {
    process.stdout.write(EMPTY);
    return 0;
  }

  const turns = readAgyTurns(payload.transcriptPath);
  if (turns.length === 0) {
    process.stdout.write(EMPTY);
    return 0;
  }

  let dbPath: string;
  try {
    dbPath = resolveDbPath([], process.env);
  } catch {
    process.stdout.write(EMPTY);
    return 0;
  }

  try {
    const db = openLiveWriteDatabase(dbPath);
    try {
      const sessionId = payload.conversationId;
      const existing = getRuntimeSession(db, sessionId);
      const stored = decodeMetadata(existing?.metadata ?? null);
      const highWater =
        typeof stored[HIGH_WATER_KEY] === "number" ? (stored[HIGH_WATER_KEY] as number) : -1;
      const deps = { newId, nowIso };
      const options = { interface: "antigravity" };

      let newHighWater = highWater;
      for (const turn of turns) {
        if (turn.lastStepIndex <= highWater) continue;
        if (!isCommandTurn(turn.userText)) {
          logUserMessage(db, sessionId, turn.userText, options, deps);
          logAssistantMessage(db, sessionId, turn.replyText, options, deps);
        }
        if (turn.lastStepIndex > newHighWater) newHighWater = turn.lastStepIndex;
      }

      if (newHighWater !== highWater) {
        const current = getRuntimeSession(db, sessionId);
        const metadata = decodeMetadata(current?.metadata ?? null);
        metadata[HIGH_WATER_KEY] = newHighWater;
        upsertRuntimeSession(db, sessionId, { metadata: JSON.stringify(metadata) }, nowIso());
      }
    } finally {
      db.close();
    }
  } catch (error) {
    noteHookFailure("agy:stop", error instanceof Error ? error.message : String(error));
  }

  process.stdout.write(EMPTY);
  return 0;
}

/** `PreInvocation`: one ephemeral context step per user turn, when owed. */
export async function agyPreInvocation(stdin: string): Promise<number> {
  const payload = parseAgyPayload(stdin);

  // Defense in depth behind the wrapper's shell gate: only the turn's first
  // invocation injects; the other ~30 answer instantly.
  if (payload.invocationNum !== 0 || !payload.conversationId) {
    process.stdout.write(EMPTY);
    return 0;
  }

  let dbPath: string;
  try {
    dbPath = resolveDbPath([], process.env);
  } catch {
    process.stdout.write(EMPTY);
    return 0;
  }

  // The quiet session: unbound, or bound with Mirror Mode off.
  const state = readMirrorState(dbPath, payload.conversationId);
  if (!state.active) {
    process.stdout.write(EMPTY);
    return 0;
  }

  const argv = ["mirror", "load", "--context-only", "--session-id", payload.conversationId];
  if (state.persona) argv.push("--persona", state.persona);
  if (state.journey) argv.push("--journey", state.journey);

  const result = await runFrontDoor(argv);
  const context = result.stdout.trim() ? result.stdout : "";
  process.stdout.write(
    context ? `${JSON.stringify({ injectSteps: [{ ephemeralMessage: context }] })}\n` : EMPTY,
  );
  return 0;
}
