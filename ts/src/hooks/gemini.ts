// Gemini CLI hook entries (CV22.DS10.TS5 plateau 1, decision D4).
//
// These hooks already entered the TypeScript front door for every Mirror
// command -- the Python they carried was only inline interpreter one-liners
// importing `sys` and `json`, to read a field out of the payload and to print
// one back. Four spawns of an interpreter to parse JSON, in a Node process's
// hook.
//
// The Gemini contract, preserved exactly:
//   stdin  -- JSON: { session_id, prompt, ... }
//   stdout -- JSON: { hookSpecificOutput: { additionalContext } } or {}
//   stderr -- logs only; never parsed
//
// `GEMINI_SESSION_ID` still wins over the payload's `session_id`, because the
// runtime sets it and the payload is the fallback.

import { parseHookPayload } from "./payload.ts";
import { runFrontDoor, runFrontDoorQuietly } from "./runtime.ts";

function sessionIdFrom(payloadSessionId: string, env = process.env): string {
  return env.GEMINI_SESSION_ID || payloadSessionId;
}

/**
 * BeforeAgent: log the user's turn, and inject context when Mirror Mode is on.
 *
 * A prompt starting with `/` is a skill invocation -- a command, not a
 * conversational message -- and is not logged. That rule is Gemini-specific
 * and stays; Claude's hook has no equivalent because its logger decides.
 */
export async function geminiLogUser(stdin: string): Promise<number> {
  const payload = parseHookPayload(stdin);
  const sessionId = sessionIdFrom(payload.sessionId);

  if (payload.prompt.startsWith("/")) {
    process.stdout.write("{}\n");
    return 0;
  }

  if (payload.prompt && sessionId) {
    await runFrontDoorQuietly("gemini:log-user", [
      "conversation-logger",
      "log-user",
      sessionId,
      payload.prompt,
      "--interface",
      "gemini_cli",
    ]);
  }

  const context = await runFrontDoor([
    "mirror",
    "load",
    "--context-only",
    "--query",
    payload.prompt,
    "--session-id",
    sessionId,
  ]);

  process.stdout.write(
    context.stdout.trim()
      ? `${JSON.stringify({ hookSpecificOutput: { additionalContext: context.stdout } })}\n`
      : "{}\n",
  );
  return 0;
}

/** AfterAgent: record the assistant's turn. */
export async function geminiLogAssistant(stdin: string): Promise<number> {
  const payload = parseHookPayload(stdin);
  const sessionId = sessionIdFrom(payload.sessionId);
  if (payload.response && sessionId) {
    await runFrontDoorQuietly("gemini:log-assistant", [
      "conversation-logger",
      "log-assistant",
      sessionId,
      payload.response,
      "--interface",
      "gemini_cli",
    ]);
  }
  process.stdout.write("{}\n");
  return 0;
}

/** SessionEnd: close the conversation for this session. */
export async function geminiSessionEnd(stdin: string): Promise<number> {
  const payload = parseHookPayload(stdin);
  const sessionId = sessionIdFrom(payload.sessionId);
  if (sessionId) {
    await runFrontDoorQuietly("gemini:session-end", [
      "conversation-logger",
      "session-end-pi",
      sessionId,
    ]);
  }
  process.stdout.write("{}\n");
  return 0;
}

/**
 * SessionStart: unmute logging for the new session.
 *
 * Fires on startup, resume, and `/clear`. This wrapper was already free of
 * Python -- it entered the front door directly -- but it is generated from the
 * same template as the other eleven so it cannot drift away from them, which
 * is the failure CR071 recorded for the skill copies.
 */
export async function geminiSessionStart(): Promise<number> {
  await runFrontDoorQuietly("gemini:session-start", ["conversation-logger", "session-start"]);
  process.stdout.write("{}\n");
  return 0;
}
