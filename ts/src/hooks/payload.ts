// Reading a runtime's hook payload from stdin.
//
// Replaces `memory.hooks.extract_prompt` (25 lines) and the four inline
// `python3 -c "import json,sys; ..."` one-liners the Claude and Gemini hooks
// used to parse the same JSON. None of them was a command, so none was in
// DS7's denominator of 29 -- which is why TS5's inventory had to find them by
// reading the hooks rather than by counting commands.
//
// Python's `extract_prompt` returns "" for malformed JSON rather than raising,
// because a hook that throws on a payload it did not recognize would break the
// user's turn. That posture is preserved exactly.

import { readFileSync } from "node:fs";

export interface HookPayload {
  /** The user's prompt text, or "" when the payload has none. */
  readonly prompt: string;
  /** The runtime's session id, or "" when the payload has none. */
  readonly sessionId: string;
  /** The assistant's response text, when the event carries one. */
  readonly response: string;
  /** Everything else, for hooks that need a field these three do not cover. */
  readonly raw: Record<string, unknown>;
}

const EMPTY: HookPayload = { prompt: "", sessionId: "", response: "", raw: {} };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Parse a hook payload. Never throws: an unparseable payload is empty. */
export function parseHookPayload(input: string): HookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return EMPTY;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY;
  const raw = parsed as Record<string, unknown>;
  return {
    prompt: text(raw.prompt),
    sessionId: text(raw.session_id),
    // Gemini's BeforeModel/AfterAgent payloads name it differently depending on
    // the event; both shapes are accepted rather than one being guessed.
    response: text(raw.response) || text(raw.assistant_message) || text(raw.content),
    raw,
  };
}

/**
 * Read stdin to the end, synchronously.
 *
 * Hooks are short-lived processes whose whole job is one payload, and the
 * runtimes close the pipe. Reading fd 0 directly avoids an async entry point
 * for every hook, and returns "" when there is no stdin at all -- which is the
 * case for `session-start`, invoked with no payload.
 */
export function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}
