// Assistant-turn backfill from a Claude transcript (CV22.DS7.US10 slice E,
// rescoped by CR151).
//
// Started as a port of `backfill_assistant_messages` from
// `src/memory/cli/conversation_logger.py` together with the two helpers it
// borrows from `src/memory/cli/transcript_export.py` (`parse_jsonl`,
// `_assistant_text`). `hook_session_end` calls it after ending the session.
//
// It now DIVERGES from that Python on purpose (CR151). Python chose the
// conversations to fill by time window alone, so a session's replies were
// copied into every open, reply-less conversation overlapping its transcript
// -- a session killed mid-first-turn, or a concurrent one on another runtime --
// and stamped them with `now`. Do not restore either behavior:
//
//   * the caller names the ONE conversation the transcript belongs to (the
//     ending session's bound conversation); nothing else is touched, and a
//     transcript no session owns fills nothing;
//   * an inserted reply carries the transcript's own timestamp, normalized to
//     the logger's microsecond ISO form, so the reply sorts between the prompts
//     around it for every reader that orders by `created_at`.
//
// This is not an import: nothing is created or bound. A conversation that
// already logged an assistant turn of its own (the Stop hook's path) is left
// alone. Appends commit as they go; a malformed entry reached mid-walk raises
// with the earlier appends already committed, and the hook swallows it.

import { readFileSync } from "node:fs";
import type { LoggerDeps } from "#conversation/logger.ts";
import type { WritableDatabase } from "#db/database.ts";
import { toMicrosecondIso } from "#util/pyGenerators.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Python `dict.get(key, default)` on a value that MUST be a dict: anything else
 * raises, as Python's AttributeError does. The default applies only when the
 * key is ABSENT -- a present `null` comes back as null, as Python returns None.
 */
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

const UTC_ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;

/**
 * A timestamp in the logger's microsecond ISO-`Z` form, or null when it cannot
 * be read as an instant. Claude writes milliseconds (`.123Z`), the logger
 * microseconds (`.123000Z`); compared as strings the two disagree (`.123Z`
 * sorts after `.123456Z`), so every bound and every insert goes through here.
 * A UTC string is re-padded rather than parsed, keeping microseconds intact.
 */
export function normalizeTimestamp(value: string): string | null {
  const utc = UTC_ISO.exec(value);
  if (utc) return `${utc[1]}.${(utc[2] ?? "").padEnd(6, "0").slice(0, 6)}Z`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : toMicrosecondIso(parsed);
}

/** An entry's normalized timestamp; absent, empty, non-string, or unreadable is null. */
function timestampOf(entry: unknown): string | null {
  const value = getOr(entry, "timestamp", "");
  return typeof value === "string" && value ? normalizeTimestamp(value) : null;
}

/**
 * Append the transcript's assistant turns to `conversationId` -- the one
 * conversation the transcript's session is bound to, and only it (CR151).
 * Skipped when that conversation does not exist or already logged an
 * assistant turn. An `assistant` entry lands when its timestamp falls inside
 * the conversation's own `[started_at, ended_at]` (open-ended while the
 * conversation is open), and it lands stamped with that timestamp.
 */
export function backfillAssistantMessages(
  db: WritableDatabase,
  transcriptPath: string,
  conversationId: string,
  deps: Pick<LoggerDeps, "newId">,
): void {
  const conversation = db
    .prepare("SELECT started_at, ended_at FROM conversations WHERE id = ?")
    .get(conversationId) as { started_at: string; ended_at: string | null } | undefined;
  if (!conversation) return;
  const hasAssistant = db
    .prepare("SELECT 1 FROM messages WHERE conversation_id = ? AND role = 'assistant' LIMIT 1")
    .get(conversationId);
  if (hasAssistant) return;

  const start = normalizeTimestamp(conversation.started_at) ?? conversation.started_at;
  const end =
    conversation.ended_at === null
      ? null
      : (normalizeTimestamp(conversation.ended_at) ?? conversation.ended_at);

  const insert = db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, token_count, metadata)
     VALUES (?, ?, 'assistant', ?, ?, NULL, NULL)`,
  );
  for (const entry of parseJsonl(transcriptPath)) {
    const timestamp = timestampOf(entry);
    if (!timestamp || timestamp < start || (end !== null && timestamp > end)) continue;
    if (getFrom(entry, "type") !== "assistant") continue;
    const message = getOr(entry, "message", {});
    const text = assistantText(getOr(message, "content", []));
    if (text) insert.run(deps.newId(), conversationId, text, timestamp);
  }
}
