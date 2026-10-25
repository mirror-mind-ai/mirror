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

import { runtimeReadsPromptContext } from "#conversation/runtimePolicy.ts";
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
 * `mirror-inject.sh`: put Mirror's context before the model, by the one
 * doorman (CV9.DS8.US4).
 *
 * Until US4 this hook carried a policy of its own -- the explicit Mirror form
 * loaded the folder; a session in Mirror Mode was loaded once more and marked
 * `hook_injected` -- and neither block carried the line the `mm-mirror` skill
 * reads (TS3), so every explicit turn loaded twice, and once the one injection
 * was spent a follow-up in another domain re-routed nothing (CR165).
 *
 * Now the hook decides nothing. It hands the prompt and the session to
 * `mirror doorman` (TS2), in-process through the front door, and writes back
 * what it delivers: the full folder on the explicit form, opened by the
 * delivered line; a delta -- the newly routed persona, the memories and
 * attachments for this prompt -- on an ordinary turn while the session is in
 * Mirror Mode; nothing otherwise. The session writes, the one embedding per
 * delta turn, the memory-score log, and the handle discipline (a quiet turn
 * opens no writable handle) are the doorman's. The Pi extension reaches the
 * same route (US5).
 *
 * Two things from before are kept on purpose. CR143: on a runtime that
 * discards what this hook returns (Grok), return before any load. CR100: a
 * payload with no session id is reported on stderr rather than passed over in
 * silence -- it is the difference between "Mirror Mode is off" and "this hook
 * is misconfigured" -- and the doorman still runs, so an explicit turn delivers
 * its folder unnamed, as `mirror doorman` does without `--session-id`.
 */
export async function claudeInject(stdin: string): Promise<number> {
  const payload = parseHookPayload(stdin);
  if (!runtimeReadsPromptContext(detectHookRuntime(payload.raw))) return 0;

  const sessionId = payload.sessionId;
  if (!sessionId) {
    process.stderr.write("warning: mirror inject hook received no session_id; no state read.\n");
  }

  const argv = ["mirror", "doorman", "--prompt", payload.prompt];
  if (sessionId) argv.push("--session-id", sessionId);
  try {
    const result = await runFrontDoor(argv);
    if (result.code !== 0)
      noteHookFailure("claude:inject", `\`mirror doorman\` exited ${result.code}`);
    if (result.stdout) process.stdout.write(result.stdout);
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
