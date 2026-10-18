// Reading a runtime's hook payload from stdin.
//
// Replaces the Python hook module `extract_prompt` (25 lines) and the four
// inline interpreter one-liners the Claude and Gemini CLI hooks used to parse
// the same JSON (the Gemini CLI hooks retired with CV21.DS8.US1). None of them was a command, so none was in
// DS7's denominator of 29 -- which is why TS5's inventory had to find them by
// reading the hooks rather than by counting commands.
//
// Python's `extract_prompt` returns "" for malformed JSON rather than raising,
// because a hook that throws on a payload it did not recognize would break the
// user's turn. That posture is preserved exactly.

import { readFileSync } from "node:fs";
import {
  type HookPayloadObject,
  parseHookPayloadObject,
  promptOf,
  sessionIdOf,
} from "#conversation/hookPayload.ts";

export interface HookPayload {
  /** The user's prompt text, or "" when the payload has none. */
  readonly prompt: string;
  /** The runtime's session id (`session_id`, or Grok's `sessionId`), or "". */
  readonly sessionId: string;
  /** Everything else, for hooks that need a field these two do not cover. */
  readonly raw: HookPayloadObject;
}

const EMPTY: HookPayload = { prompt: "", sessionId: "", raw: {} };

/**
 * Parse a hook payload. Never throws: an unparseable payload is empty.
 *
 * The field spellings live in `#conversation/hookPayload.ts`, one reader for
 * the entries and the logger (CV21.DS2.US8).
 */
export function parseHookPayload(input: string): HookPayload {
  const raw = parseHookPayloadObject(input);
  if (raw === null) return EMPTY;
  return {
    prompt: promptOf(raw),
    sessionId: sessionIdOf(raw),
    // A `response` field read Gemini CLI's `prompt_response` here until
    // CV21.DS8.US1; no living runtime hands the reply to a hook payload by
    // name (Claude-family hooks read the transcript, agy's Stop reads its
    // JSONL), so the field went with its only reader.
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
