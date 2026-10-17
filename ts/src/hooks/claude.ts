// Claude Code hook entries (CV22.DS10.TS5 plateau 1, decision D4).
//
// Replaces the bodies of `.claude/hooks/*.sh` and the identical set under
// `plugins/mirror-mind/hooks/`, which spawned the Python interpreter for the
// core's CLI, for two hook modules, and for an inline import of the
// conversation logger's `hook_user_prompt` -- the last two reaching into
// modules that were never commands, and so never in DS7's denominator.
//
// Behavior is preserved case for case, including the cases that look like
// bugs and are not: a skill invocation is still logged (Claude's hook fires
// for every prompt and the logger decides), a missing session id still fails
// loud, and every failure is still non-fatal to the user's turn.

import { resolveDbPath } from "#frontDoor/dbPath.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import { mirrorForm } from "#mirror/mirrorForm.ts";
import { markInjected, needsInject, readMirrorState } from "./mirrorState.ts";
import { parseHookPayload, readStdin } from "./payload.ts";
import {
  noteHookFailure,
  operatingInstructionsFor,
  runFrontDoor,
  runFrontDoorQuietly,
  sessionStartOutput,
} from "./runtime.ts";
import { detectHookRuntime } from "./runtimeDetection.ts";

/**
 * `session-start.sh`: make sure logging is on for this session, and hand
 * Claude Code the Operating Instructions unless the project it opened in is
 * this same tree (US3, D13 -- `operatingInstructionsFor`). The plugin in
 * Claude Code's cache delivers them this way; the checkout's own wrappers
 * find the project already carrying the file and stay quiet, as before.
 */
export async function claudeSessionStart(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  await runFrontDoorQuietly("claude:session-start", ["conversation-logger", "session-start"]);
  process.stdout.write(
    sessionStartOutput(operatingInstructionsFor("claude:session-start", env.CLAUDE_PROJECT_DIR)),
  );
  return 0;
}

/**
 * `log-user-prompt.sh`: record the user's turn, under the runtime's own label.
 *
 * The shell piped stdin into `hook_user_prompt()`, and the front door owns
 * that surface: `conversation-logger user-prompt` reads the payload itself.
 * Since CV21.DS2.US8 the entry reads it first, to tell which runtime it is in
 * (`runtimeDetection.ts`), and hands it to the route through the one-shot
 * stdin seam, so fd 0 is read once.
 */
export async function claudeUserPrompt(stdin: string): Promise<number> {
  const runtime = detectHookRuntime(parseHookPayload(stdin).raw);
  await runFrontDoorQuietly(
    "claude:user-prompt",
    ["conversation-logger", "user-prompt", "--interface", runtime],
    { stdin },
  );
  return 0;
}

/**
 * `log-assistant-reply.sh`, on Stop: record the turn's final answer beside
 * its prompt (CV21.DS2.US8). Every Claude-schema runtime hands its Stop hook
 * `last_assistant_message` (DS12.TS2 L11, TS4 L8; Claude Code 2.1.296's
 * binary), so the reply needs no transcript.
 *
 * This hook prints NOTHING and exits 0, whatever happens: a Stop hook that
 * printed JSON or exited 2 would keep the agent working instead of logging.
 * The route's outcome line is captured in-process and never forwarded. Only a
 * reply lost for no known reason -- its turn's prompt neither logged nor
 * skipped as a command, the race the plan names -- is recorded in `hooks.log`,
 * the fact and never the text: `runtime diagnose` reads that file as failures,
 * and a command turn's reply or a session-scoped Stop is not one.
 */
export async function claudeStop(stdin: string): Promise<number> {
  const runtime = detectHookRuntime(parseHookPayload(stdin).raw);
  const outcome = await runFrontDoorQuietly(
    "claude:stop",
    ["conversation-logger", "stop", "--interface", runtime],
    { stdin },
  );
  const line = outcome.trim();
  if (line.startsWith("reply skipped: nothing_waiting") || line.startsWith("reply failed")) {
    noteHookFailure("claude:stop", line);
  }
  return 0;
}

/**
 * `log-session-end.sh`: close the session, then take the silent backup.
 *
 * The runtime goes along as `--interface`, as Stop's does, for a session row
 * with no label. On a runtime that bounds this hook (Codex 1 s, Grok 1.5 s)
 * the close runs no LLM work and the next session start finishes the tail
 * (CV21.DS4.TS2); both calls then fit inside the bound.
 */
export async function claudeSessionEnd(stdin: string): Promise<number> {
  const runtime = detectHookRuntime(parseHookPayload(stdin).raw);
  await runFrontDoorQuietly(
    "claude:session-end",
    ["conversation-logger", "session-end", "--interface", runtime],
    { stdin },
  );
  await runFrontDoorQuietly("claude:session-end", ["backup", "--silent"]);
  return 0;
}

/**
 * `mirror-inject.sh`: inject identity context before the model answers.
 *
 * Two cases, exactly as the shell had them:
 *
 *   1. an explicit Mirror form -- `/mm:mirror [query]`, or the same skill in
 *      any runtime's spelling (`#mirror/mirrorForm.ts`; CV21.DS2.US7) -- load context
 *      for that query;
 *   2. Mirror Mode already active for this session with context not yet
 *      injected -- load it with the session's persona and journey, then mark
 *      it injected so it happens once.
 *
 * `--context-only` matters in both: it loads context WITHOUT starting a
 * conversation session, because the model does that. A hook that silently
 * opened conversations would fork every session in two.
 */
export async function claudeInject(stdin: string): Promise<number> {
  const payload = parseHookPayload(stdin);
  const sessionId = payload.sessionId;

  // Case 1: the explicit invocation.
  const explicit = mirrorForm(payload.prompt);
  if (explicit) {
    const argv = ["mirror", "load", "--context-only", "--query", explicit.query];
    if (sessionId) argv.push("--session-id", sessionId);
    const result = await runFrontDoor(argv);
    if (result.stdout.trim()) process.stdout.write(result.stdout);
    return 0;
  }

  // Case 2: active Mirror Mode owed an injection.
  if (!sessionId) {
    // Python's `mirror_state` warned on stderr rather than no-op'ing silently,
    // so a hook wired without a session id is visible. Kept: it is the
    // difference between "Mirror Mode is off" and "this hook is misconfigured".
    process.stderr.write("warning: mirror inject hook received no session_id; no state read.\n");
    return 0;
  }

  let dbPath: string;
  try {
    dbPath = resolveDbPath([], process.env);
  } catch (error) {
    noteHookFailure("claude:inject", error instanceof Error ? error.message : String(error));
    return 0;
  }

  const state = readMirrorState(dbPath, sessionId);
  if (!needsInject(state)) return 0;

  const argv = [
    "mirror",
    "load",
    "--context-only",
    "--query",
    payload.prompt,
    "--session-id",
    sessionId,
  ];
  if (state.persona) argv.push("--persona", state.persona);
  if (state.journey) argv.push("--journey", state.journey);

  const result = await runFrontDoor(argv);
  if (!result.stdout.trim()) return 0;

  process.stdout.write(result.stdout);
  // Only after the context actually reached the model: the shell marked it
  // inside `if [ -n "$CONTEXT" ]` for the same reason. Marking first would
  // lose the injection whenever the load produced nothing.
  try {
    // The sanctioned live-write path: a verified pre-write snapshot, same as
    // every other routed write.
    //
    // Python's `mark_injected` wrote UNGATED, so this adds a `VACUUM INTO`
    // that the old hook did not pay. Measured on a real 53 MB database:
    // **95 ms**, once per Mirror Mode session -- only the single prompt that
    // owes an injection reaches this line, and that turn is already loading
    // identity and memories. The ordinary turn returns above without opening
    // a writable handle at all (114 ms end to end, nothing written).
    //
    // Paying the front door's own safety contract for a real write to a real
    // user database beat inventing a second narrowed write handle inside a
    // deletion story. Recorded with the number so the trade is visible.
    //
    // This hook runs AT THE SAME TIME as `log-user-prompt`, which writes too.
    // Until finding F21 the two snapshots collided on one fixed file and one
    // write was lost -- in the Navigator walk, two injections in three
    // prompts. `openLiveWriteDatabase` gives each writer its own staging
    // snapshot, so concurrent hooks no longer race.
    const db = openLiveWriteDatabase(dbPath);
    try {
      markInjected(db, sessionId, new Date().toISOString());
    } finally {
      db.close();
    }
  } catch (error) {
    noteHookFailure("claude:inject", error instanceof Error ? error.message : String(error));
  }
  return 0;
}

export async function claudeHook(name: string): Promise<number> {
  switch (name) {
    case "session-start":
      return claudeSessionStart();
    case "user-prompt":
      return claudeUserPrompt(readStdin());
    case "stop":
      return claudeStop(readStdin());
    case "session-end":
      return claudeSessionEnd(readStdin());
    case "inject":
      return claudeInject(readStdin());
    default:
      noteHookFailure("claude", `unknown hook: ${name}`);
      return 0;
  }
}
