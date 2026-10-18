// The agy transcript reader (CV21.DS7.TS3).
//
// Antigravity's hook payloads carry no prompt or reply text (DS12.TS3 L7),
// so logging reads the JSONL transcript agy writes. The step shapes are
// probed from real agy 1.4.2 transcripts (the US1/TS2/TS3 probe discipline;
// evidence/transcript-shape-20261018.md):
//
//   * a user turn is a `USER_INPUT` step (`source: USER_EXPLICIT`) whose
//     content string wraps the request in `<USER_REQUEST>…</USER_REQUEST>`,
//     followed by `<ADDITIONAL_METADATA>…`;
//   * the model's answer is the `PLANNER_RESPONSE` step(s) (`source: MODEL`).
//     MOST of these are EMPTY — intermediate tool steps — so the reply is
//     the non-empty response text in the turn, not every PLANNER_RESPONSE.
//     (The plan guessed `AGENT_MESSAGE`; the probe corrected both the type
//     and the emptiness.)
//
// A turn runs from one `USER_INPUT` to just before the next. `step_index` is
// a monotonic per-conversation ordinal; `lastStepIndex` is the turn's
// high-water mark, which the Stop handler stores so a re-fired Stop logs
// nothing new.

import { parseJsonl } from "#conversation/transcriptBackfill.ts";

export interface AgyTurn {
  readonly userText: string;
  readonly replyText: string;
  /** The highest step_index this turn logged: the idempotency high-water mark. */
  readonly lastStepIndex: number;
}

function stringField(entry: unknown, key: string): string {
  if (typeof entry !== "object" || entry === null) return "";
  const value = (entry as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function numberField(entry: unknown, key: string): number {
  if (typeof entry !== "object" || entry === null) return -1;
  const value = (entry as Record<string, unknown>)[key];
  return typeof value === "number" ? value : -1;
}

const USER_REQUEST = /<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/;

/** The request body agy wraps the user's words in, or the whole string. */
export function extractUserRequest(content: string): string {
  const match = USER_REQUEST.exec(content);
  return (match ? match[1] : content).trim();
}

/**
 * Join the turn's non-empty reply parts into one string, the same rule the
 * Claude reader's `assistantText` uses (trimmed, blank-line separated).
 * Shared so "how parts become one reply" lives in one place.
 */
export function joinReplyParts(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n");
}

/**
 * The transcript's completed turns, in order. Each pairs the user's request
 * with the model's reply and carries the turn's high-water `step_index`.
 * A turn with no reply text yet (the model has not answered) is omitted:
 * the Stop handler logs it on the Stop that follows the answer.
 */
export function readAgyTurns(transcriptPath: string): AgyTurn[] {
  let entries: unknown[];
  try {
    entries = parseJsonl(transcriptPath);
  } catch {
    return [];
  }

  const turns: AgyTurn[] = [];
  let userText: string | null = null;
  let replyParts: string[] = [];
  let lastStepIndex = -1;

  const flush = () => {
    if (userText === null) return;
    const replyText = joinReplyParts(replyParts);
    if (replyText) turns.push({ userText, replyText, lastStepIndex });
    userText = null;
    replyParts = [];
  };

  for (const entry of entries) {
    const type = stringField(entry, "type");
    if (type === "USER_INPUT") {
      flush();
      userText = extractUserRequest(stringField(entry, "content"));
      lastStepIndex = numberField(entry, "step_index");
    } else if (type === "PLANNER_RESPONSE" && userText !== null) {
      const content = stringField(entry, "content").trim();
      const stepIndex = numberField(entry, "step_index");
      if (stepIndex > lastStepIndex) lastStepIndex = stepIndex;
      if (content) replyParts.push(content);
    }
  }
  flush();
  return turns;
}
