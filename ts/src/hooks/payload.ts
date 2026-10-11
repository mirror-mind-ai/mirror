// Reading a runtime's hook payload from stdin.
//
// Replaces the Python hook module `extract_prompt` (25 lines) and the four
// inline interpreter one-liners the Claude and Gemini hooks used to parse the
// same JSON. None of them was a command, so none was in
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
  /** The assistant's response text (Gemini's `prompt_response`), or "". */
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
    // Gemini's AfterAgent payload names it `prompt_response`, and that is the
    // field the Python hook read. The first port read three guessed names
    // instead and dropped every Gemini assistant turn in silence until
    // `smoke_gemini_cli.sh` caught it (CV22.DS10.TS5 plateau 3).
    response: text(raw.prompt_response),
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
