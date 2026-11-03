// Antigravity hook entries (CV21.DS7.TS2; through the one doorman since
// CV9.DS8.TS6).
//
// agy runs the plugin's `hooks.json` handlers with camelCase protojson on
// stdin and reads JSON from stdout (`injectSteps`; a `systemMessage` step
// nests its text, an `ephemeralMessage` is a plain string). The contracts
// are committed bytes in CV21.DS7.US1's `evidence/` (agy 1.4.2) and in
// TS6's `evidence/probe-20261025.md` (agy 1.4.7).
//
// Three handlers:
//
//   * `agy:session-start` — turn conversation logging on, turn Mirror Mode
//     on for the conversation, and answer `{}`. The Operating Instructions
//     are NOT delivered here: `rules/AGENTS.md` carries them (US1).
//
//   * `agy:pre-invocation` — put Mirror's context before the model once per
//     user turn. `PreInvocation` fires before EVERY model call, with
//     `invocationNum` resetting to 0 at each user turn; protojson omits
//     zero-valued fields, so an ABSENT invocationNum is 0. The generated
//     wrapper already gates on this before Node is spawned; the gate here is
//     defense in depth. At invocation 0 the hook hands the turn to the one
//     doorman and answers its block as ONE persistent `systemMessage` step.
//
//   * `agy:stop` — log the turns from the transcript (agy has no SessionEnd).
//
// Where the prompt comes from. On agy 1.4.2 no payload carried the user's
// text (DS12.TS3 L7), so this hook could only re-inject the whole folder on
// every turn, routed from nothing. agy 1.4.7 carries it in every payload, as
// `lastUserInput`, verbatim -- a skill turn in its slash form (TS6's probe) --
// so the hook reads the prompt from the payload and never from a transcript.
// A payload without it (agy before 1.4.7) keeps the pre-TS6 injection,
// unchanged: Navigator decision (b), 2026-10-25, removable when the runtime
// matrix's floor for agy reaches 1.4.7.
//
// Payload fields stay inert: `conversationId` and the prompt flow only
// through array argv, never a shell, and failures recorded in hooks.log are
// facts, never payload text.

import { readAgyTurns } from "#conversation/agyTranscript.ts";
import { isCommandTurn } from "#conversation/commandTurn.ts";
import { logAssistantMessage, logUserMessage } from "#conversation/logger.ts";
import { resolveDbPath } from "#frontDoor/dbPath.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import { forgetDoormanDelivery } from "#mirror/doorman.ts";
import { decodeMetadata, getRuntimeSession, upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { readMirrorState } from "./mirrorState.ts";
import { noteHookFailure, runFrontDoor, runFrontDoorQuietly } from "./runtime.ts";

/** agy's empty answer, which every path that injects nothing must print. */
const EMPTY = "{}\n";

interface AgyPayload {
  readonly conversationId: string;
  readonly invocationNum: number;
  readonly transcriptPath: string;
  /**
   * The turn's prompt, verbatim (agy 1.4.7, every payload), or null: absent
   * before 1.4.7, and protojson omits an empty string, so absent and empty
   * are one case.
   */
  readonly lastUserInput: string | null;
}

const EMPTY_PAYLOAD: AgyPayload = {
  conversationId: "",
  invocationNum: 0,
  transcriptPath: "",
  lastUserInput: null,
};

/** The key under which the Stop handler stores its high-water step_index. */
const HIGH_WATER_KEY = "agy_last_step_index";

/**
 * Parse agy's camelCase protojson payload. Anything malformed reads as the
 * empty payload: a hook never fails the turn over stdin it did not write.
 */
export function parseAgyPayload(stdin: string): AgyPayload {
  try {
    const raw: unknown = JSON.parse(stdin);
    if (typeof raw !== "object" || raw === null) return EMPTY_PAYLOAD;
    const record = raw as Record<string, unknown>;
    return {
      conversationId: typeof record.conversationId === "string" ? record.conversationId : "",
      // protojson omits zero-valued fields: absent IS 0.
      invocationNum: typeof record.invocationNum === "number" ? record.invocationNum : 0,
      transcriptPath: typeof record.transcriptPath === "string" ? record.transcriptPath : "",
      lastUserInput:
        typeof record.lastUserInput === "string" && record.lastUserInput.trim()
          ? record.lastUserInput
          : null,
    };
  } catch {
    return EMPTY_PAYLOAD;
  }
}

/**
 * `SessionStart`: logging on, turn Mirror Mode on for the conversation,
 * answer the contract.
 *
 * Mirror Mode activation (CV21.DS7.US4 scope change). The `/mirror-mind:mm:*`
 * skill runs `mirror load` as an agent command that cannot name the agy
 * session, and on agy 1.4.2 no hook carried the prompt to detect the Mirror
 * form by. So SessionStart — the one hook that carries the `conversationId`
 * at the start of a conversation — turns Mirror Mode on, always: Gemini CLI's
 * always-on per-turn injection, the runtime Antigravity replaces.
 *
 * Three writes since CV9.DS8.TS6, because the doorman reads more than the
 * flag. `mirror_active`, as before. The session's OWN operating-mode stamp,
 * Mirror Mode: the doorman treats a session as in Mirror Mode only while its
 * mode says so -- its own stamp, else the global one -- so without it a new
 * conversation would answer to whatever mode was last stamped globally, and a
 * home last switched to Builder would leave agy silent. And the doorman's
 * refresh (`forgetDoormanDelivery`): nothing is in this conversation's
 * transcript yet, so its first ordinary turn is the full folder, routed from
 * that turn's prompt, and the deltas follow. agy fires SessionStart for a new
 * conversation, not a resumed one (TS6's probe): a resumed conversation keeps
 * the folder its persistent steps already hold.
 */
export async function agySessionStart(stdin: string): Promise<number> {
  await runFrontDoorQuietly("agy:session-start", ["conversation-logger", "session-start"]);

  const conversationId = parseAgyPayload(stdin).conversationId;
  if (conversationId) {
    try {
      const dbPath = resolveDbPath([], process.env);
      const db = openLiveWriteDatabase(dbPath);
      try {
        const now = nowIso();
        upsertRuntimeSession(
          db,
          conversationId,
          { interface: "antigravity", mirrorActive: true },
          now,
        );
        activateOperatingMode(db, { mode: "Mirror Mode", sessionId: conversationId }, now);
        forgetDoormanDelivery(db, conversationId, now);
      } finally {
        db.close();
      }
    } catch (error) {
      noteHookFailure("agy:session-start", error instanceof Error ? error.message : String(error));
    }
  }

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

/** One step of agy's `injectSteps`: the persistent kind, or the ephemeral one. */
type AgyStep = { systemMessage: { systemMessage: string } } | { ephemeralMessage: string };

const PRE_INVOCATION = "agy:pre-invocation";

/**
 * `PreInvocation`: at a user turn's first model call, Mirror's context as ONE
 * step, when one is owed.
 */
export async function agyPreInvocation(stdin: string): Promise<number> {
  const payload = parseAgyPayload(stdin);

  // Defense in depth behind the wrapper's shell gate: only the turn's first
  // invocation injects; the others answer instantly and touch nothing.
  if (payload.invocationNum !== 0 || !payload.conversationId) {
    process.stdout.write(EMPTY);
    return 0;
  }

  const step =
    payload.lastUserInput === null
      ? await contextWithoutPrompt(payload.conversationId)
      : await doormanStep(payload.conversationId, payload.lastUserInput);
  process.stdout.write(step ? `${JSON.stringify({ injectSteps: [step] })}\n` : EMPTY);
  return 0;
}

/**
 * The turn through the one doorman (CV9.DS8.TS6), handed over as
 * `claudeInject` hands Claude's: in-process, through the front door, the hook
 * deciding nothing. `mirror doorman` answers the full folder on the explicit
 * form -- even in a conversation no SessionStart activated -- a delta on an
 * ordinary turn in Mirror Mode, and nothing on a skill turn or outside it; the
 * session writes, the one embedding per delta turn, and the handle discipline
 * are its own. The hook reads no transcript: the prompt goes to the doorman
 * and nowhere else.
 *
 * The block rides in a `systemMessage` step, which agy keeps before the model
 * on later turns; the pre-TS6 `ephemeralMessage` would drop the folder after
 * this one, and every delta stands on the folder still being there. Ephemeral
 * never kept identity off disk either: agy writes the step into the stored
 * transcript all the same (TS6's probe, TS2's observation).
 */
async function doormanStep(conversationId: string, prompt: string): Promise<AgyStep | null> {
  // `--session-id` before `--prompt`: the route reads a flag's FIRST
  // occurrence, so a prompt that is exactly `--session-id` stays the prompt.
  const argv = ["mirror", "doorman", "--session-id", conversationId, "--prompt", prompt];
  try {
    const result = await runFrontDoor(argv);
    if (result.code !== 0)
      noteHookFailure(PRE_INVOCATION, `\`mirror doorman\` exited ${result.code}`);
    return result.stdout.trim() ? { systemMessage: { systemMessage: result.stdout } } : null;
  } catch (error) {
    noteHookFailure(PRE_INVOCATION, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * agy before 1.4.7, whose payload carries no prompt: the injection this hook
 * made before TS6, unchanged (Navigator decision (b)). The quiet session --
 * unbound, or bound with Mirror Mode off -- gets nothing; an active one gets
 * the whole folder with its session's persona and journey, re-injected each
 * turn as an `ephemeralMessage`. Removable when the runtime matrix's floor
 * for agy reaches 1.4.7.
 */
async function contextWithoutPrompt(conversationId: string): Promise<AgyStep | null> {
  let dbPath: string;
  try {
    dbPath = resolveDbPath([], process.env);
  } catch {
    return null;
  }

  const state = readMirrorState(dbPath, conversationId);
  if (!state.active) return null;

  const argv = ["mirror", "load", "--context-only", "--session-id", conversationId];
  if (state.persona) argv.push("--persona", state.persona);
  if (state.journey) argv.push("--journey", state.journey);

  const result = await runFrontDoor(argv);
  return result.stdout.trim() ? { ephemeralMessage: result.stdout } : null;
}
