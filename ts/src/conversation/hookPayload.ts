// The fields a Claude-schema hook payload carries, in both spellings
// (CV21.DS2.US8).
//
// Three runtimes hand the shared hooks a payload: Claude Code and Codex in
// snake_case, Grok in camelCase with a snake_case alias on some fields but
// not all (DS12.TS4 L8). The turn is correlated under three names: Claude
// Code's `prompt_id`, Codex's `turn_id`, Grok's `promptId`. One reader, so
// the logger and the hook entries cannot disagree about where a field lives.
//
// Every reader returns "" for a missing or non-string field, and the parser
// returns null rather than throwing: a hook that threw on a payload it did
// not recognize would break the user's turn (the `extract_prompt` posture).

export type HookPayloadObject = Record<string, unknown>;

/** Parse a hook payload. Null for anything but a JSON object. */
export function parseHookPayloadObject(raw: string): HookPayloadObject | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as HookPayloadObject;
  } catch {
    return null;
  }
}

/** The first of the named fields that holds a string, else "". */
export function payloadText(payload: HookPayloadObject, ...names: string[]): string {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === "string") return value;
  }
  return "";
}

export const sessionIdOf = (payload: HookPayloadObject): string =>
  payloadText(payload, "session_id", "sessionId");

export const promptOf = (payload: HookPayloadObject): string => payloadText(payload, "prompt");

/** The runtime's correlation id for the turn, whatever it calls it. */
export const turnIdOf = (payload: HookPayloadObject): string =>
  payloadText(payload, "prompt_id", "turn_id", "promptId");

/** The turn's final answer, as the Stop hook receives it. */
export const lastAssistantMessageOf = (payload: HookPayloadObject): string =>
  payloadText(payload, "last_assistant_message", "lastAssistantMessage");

/** Set only inside a subagent (Grok names it; Claude Code and Codex fire SubagentStop instead). */
export const subagentTypeOf = (payload: HookPayloadObject): string =>
  payloadText(payload, "subagentType", "subagent_type");
