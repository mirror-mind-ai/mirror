// Assistant-turn backfill from a Claude transcript (CV22.DS7.US10 slice E).
//
// Ports `backfill_assistant_messages` from
// `src/memory/cli/conversation_logger.py` together with the two helpers it
// borrows from `src/memory/cli/transcript_export.py` (`parse_jsonl`,
// `_assistant_text`). `hook_session_end` calls it after ending the session --
// and, when the payload carries no session id at all, INSTEAD of ending one:
// that session-less route is the path US5's hook port deliberately left out.
//
// This is not an import: nothing is created or bound. It appends assistant
// turns to conversations that overlap the transcript's time window and logged
// no assistant message of their own, stamping each with `now` (Python's
// `Message` default), not with the transcript timestamp. Python commits every
// message as it goes and swallows nothing here; a malformed entry reached
// mid-walk raises with the earlier appends already committed. The port keeps
// that sequence so partial state matches, and leaves swallowing to the hook.

import { readFileSync } from "node:fs";
import type { LoggerDeps } from "#conversation/logger.ts";
import type { WritableDatabase } from "#db/database.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python `dict.get` on something that must be a dict; see `backfill.ts`. */
function getOr(container: unknown, key: string, fallback: unknown): unknown {
  if (!isRecord(container)) throw new TypeError(`expected an object with '${key}'`);
  return key in container ? container[key] : fallback;
}

function getFrom(container: unknown, key: string): unknown {
  return getOr(container, key, undefined);
}

/** Python `parse_jsonl`: blank lines skipped, unparseable lines skipped. */
export function parseJsonl(path: string): unknown[] {
  const entries: unknown[] = [];
  for (const raw of readFileSync(path, "utf8").split(/\r?\n|\r/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // json.JSONDecodeError -> continue
    }
  }
  return entries;
}

/**
 * Python `_assistant_text`: the stripped, non-empty `text` blocks of an
 * assistant message joined by a blank line. Iterating a string or a dict
 * yields no dict items (so no text); a null or number cannot be iterated and
 * raises, as does a text block whose `text` is not a string.
 */
export function assistantText(contentBlocks: unknown): string {
  const iterable = Array.isArray(contentBlocks)
    ? contentBlocks
    : typeof contentBlocks === "string" || isRecord(contentBlocks)
      ? []
      : null;
  if (iterable === null) throw new TypeError("assistant content is not iterable");
  const parts: string[] = [];
  for (const block of iterable) {
    if (!isRecord(block) || block.type !== "text") continue;
    const text = getOr(block, "text", "");
    if (typeof text !== "string") throw new TypeError("text block is not a string");
    const trimmed = text.trim();
    if (trimmed) parts.push(trimmed);
  }
  return parts.join("\n\n");
}

/** Python `str` truthiness on the timestamp: absent, null, or empty is skipped. */
function timestampOf(entry: unknown): string | null {
  const value = getOr(entry, "timestamp", "");
  return typeof value === "string" && value ? value : null;
}

/**
 * Python `backfill_assistant_messages`. The transcript window is
 * `[min(timestamp), max(timestamp)]` over entries that carry one; a
 * conversation is in range when `started_at <= window end` and it either
 * ended at or after the window start or is still open. Within an in-range
 * conversation that has no assistant turn, every `assistant` entry whose
 * timestamp falls inside `[started_at, ended_at or window end]` is appended.
 */
export function backfillAssistantMessages(
  db: WritableDatabase,
  transcriptPath: string,
  deps: LoggerDeps,
): void {
  const entries = parseJsonl(transcriptPath);
  if (entries.length === 0) return;

  const timestamps = entries.map(timestampOf).filter((value): value is string => value !== null);
  if (timestamps.length === 0) return;
  // Python's min()/max() on str compare by code point; ISO timestamps are
  // ASCII, so plain comparison is the same order.
  let startTime = timestamps[0] as string;
  let endTime = timestamps[0] as string;
  for (const value of timestamps) {
    if (value < startTime) startTime = value;
    if (value > endTime) endTime = value;
  }

  const conversations = db
    .prepare(
      `SELECT id, started_at, ended_at FROM conversations
        WHERE started_at <= ? AND (ended_at >= ? OR ended_at IS NULL)`,
    )
    .all(endTime, startTime) as { id: string; started_at: string; ended_at: string | null }[];

  const hasAssistant = db.prepare(
    "SELECT 1 FROM messages WHERE conversation_id = ? AND role = 'assistant' LIMIT 1",
  );
  const insert = db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, token_count, metadata)
     VALUES (?, ?, 'assistant', ?, ?, NULL, NULL)`,
  );

  for (const conversation of conversations) {
    if (hasAssistant.get(conversation.id)) continue;
    const conversationStart = conversation.started_at;
    const conversationEnd = conversation.ended_at ?? endTime;

    for (const entry of entries) {
      const timestamp = timestampOf(entry);
      if (!timestamp || !(conversationStart <= timestamp && timestamp <= conversationEnd)) continue;
      if (getFrom(entry, "type") !== "assistant") continue;
      const message = getOr(entry, "message", {});
      const text = assistantText(getOr(message, "content", []));
      if (text) {
        // Python: Message(...) draws its id before its created_at.
        const id = deps.newId();
        insert.run(id, conversation.id, text, deps.nowIso());
      }
    }
  }
}
