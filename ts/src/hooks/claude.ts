// Claude Code hook entries (CV22.DS10.TS5 plateau 1, decision D4).
//
// Replaces `.claude/hooks/*.sh` and the identical set under
// `plugins/mirror-mind/hooks/`, which invoked `python3 -m memory`,
// `python3 -m memory.hooks.*`, and `python3 -c "from memory.cli... import
// hook_user_prompt"` -- the last reaching into a module that was never a
// command, and so never in DS7's denominator.
//
// Behavior is preserved case for case, including the cases that look like
// bugs and are not: a skill invocation is still logged (Claude's hook fires
// for every prompt and the logger decides), a missing session id still fails
// loud, and every failure is still non-fatal to the user's turn.

import { openDatabaseForWrite } from "#db/database.ts";
import { resolveDbPath } from "#frontDoor/dbPath.ts";
import { ensureBackup } from "#frontDoor/liveBackup.ts";
import { markInjected, needsInject, readMirrorState } from "./mirrorState.ts";
import { parseHookPayload, readStdin } from "./payload.ts";
import { noteHookFailure, runFrontDoor, runFrontDoorQuietly } from "./runtime.ts";

/** `session-start.sh`: make sure logging is on for this session. */
export async function claudeSessionStart(): Promise<number> {
  await runFrontDoorQuietly("claude:session-start", ["conversation-logger", "session-start"]);
  return 0;
}

/**
 * `log-user-prompt.sh`: record the user's turn.
 *
 * The shell piped stdin into `hook_user_prompt()`. The front door already owns
 * that surface -- `conversation-logger user-prompt` is one of its two
 * stdin-reading subcommands -- so the payload is handed straight to it rather
 * than re-parsed here.
 */
export async function claudeUserPrompt(): Promise<number> {
  // stdin is deliberately NOT consumed here: the route reads it itself, so
  // handing it the payload means not reading it first.
  await runFrontDoorQuietly("claude:user-prompt", ["conversation-logger", "user-prompt"]);
  return 0;
}

/** `log-session-end.sh`: close the session, then take the silent backup. */
export async function claudeSessionEnd(): Promise<number> {
  await runFrontDoorQuietly("claude:session-end", ["conversation-logger", "session-end"]);
  await runFrontDoorQuietly("claude:session-end", ["backup", "--silent"]);
  return 0;
}

/**
 * `mirror-inject.sh`: inject identity context before the model answers.
 *
 * Two cases, exactly as the shell had them:
 *
 *   1. an explicit `/mm:mirror [query]` -- load context for that query;
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
  if (/^\/mm:mirror/.test(payload.prompt)) {
    const query = payload.prompt.replace(/^\/mm:mirror\s*/, "");
    const argv = ["mirror", "load", "--context-only", "--query", query];
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
    const db = openDatabaseForWrite(dbPath, ensureBackup(dbPath));
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
      return claudeUserPrompt();
    case "session-end":
      return claudeSessionEnd();
    case "inject":
      return claudeInject(readStdin());
    default:
      noteHookFailure("claude", `unknown hook: ${name}`);
      return 0;
  }
}
