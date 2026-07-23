// `recall` read primitives — the port of ConversationService.find_by_id_prefix
// and Store.get_messages, plus Python's `messages[-limit:]` tail-slice
// semantics (memory.cli.recall).

import type { Database } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

export interface RecallConversationRow {
  id: string;
  title: string | null;
  started_at: string | null;
  persona: string | null;
  journey: string | null;
  summary: string | null;
}

export interface RecallMessageRow {
  role: string;
  content: string;
}

/** Port of `find_conversation_by_id_prefix`: latest match by started_at DESC, or null. */
export function findConversationByIdPrefix(
  db: Database,
  prefix: string,
): RecallConversationRow | null {
  const row = db
    .prepare(
      "SELECT id, title, started_at, persona, journey, summary FROM conversations " +
        "WHERE id LIKE ? ORDER BY started_at DESC LIMIT 1",
    )
    .get(`${prefix}%`);
  if (row === undefined) return null;
  return {
    id: requireString(row, "id"),
    title: optionalString(row, "title"),
    started_at: optionalString(row, "started_at"),
    persona: optionalString(row, "persona"),
    journey: optionalString(row, "journey"),
    summary: optionalString(row, "summary"),
  };
}

/** Port of `Store.get_messages`: every message for a conversation, oldest first. */
export function getMessagesForConversation(
  db: Database,
  conversationId: string,
): RecallMessageRow[] {
  return db
    .prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at")
    .all(conversationId)
    .map((row) => ({ role: requireString(row, "role"), content: requireString(row, "content") }));
}

/**
 * Port of Python's `arr[-n:]` slice-start semantics for any integer `n`
 * (including zero and negative values), reproduced exactly because a real
 * behavioral quirk depends on it: `n = 0` means `arr[-0:]` — and `-0 == 0` in
 * Python, so it slices from index 0, i.e. the WHOLE array, not an empty one.
 * A negative `n` (e.g. --limit -3) becomes a positive start index and DROPS
 * the first `-n` elements instead of taking a tail.
 */
export function pythonTailSliceStart(length: number, n: number): number {
  const idx = n <= 0 ? -n : length - n;
  return Math.max(0, Math.min(idx, length));
}
