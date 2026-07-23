// `conversations` listing read — the port of Store.list_recent_conversation_summaries
// (memory.cli.conversations, the plain-listing path only). The metadata-lifecycle
// and backfill preview/apply flags on the same Python CLI are stateful writes
// (ES-001); routing.ts falls back to Python whenever any of those flags are
// present, so this module only ever serves the plain listing.
//
// Query-builder + row-mapper, ordering pushed down to SQLite, per the same
// database-seam philosophy as memory/listing.ts.

import type { Database, SqlValue } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

export interface ConversationSummary {
  id: string;
  title: string | null;
  started_at: string | null;
  persona: string | null;
  journey: string | null;
  message_count: number;
}

export interface ListRecentConversationsFilters {
  limit?: number;
  journey?: string | null;
  persona?: string | null;
}

/**
 * Build the parameterized recent-conversations query, mirroring the Python
 * builder exactly: a `1=1` seed, `journey = ?` then `persona = ?` when
 * provided (in that order), `ORDER BY started_at DESC`, trailing `LIMIT ?`.
 */
export function buildListRecentConversationsQuery(filters: ListRecentConversationsFilters = {}): {
  sql: string;
  params: SqlValue[];
} {
  const { limit = 20, journey = null, persona = null } = filters;
  const conditions = ["1=1"];
  const params: SqlValue[] = [];
  if (journey) {
    conditions.push("journey = ?");
    params.push(journey);
  }
  if (persona) {
    conditions.push("persona = ?");
    params.push(persona);
  }
  params.push(limit);
  const sql =
    "SELECT id, title, started_at, persona, journey, " +
    "(SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count " +
    `FROM conversations c WHERE ${conditions.join(" AND ")} ORDER BY started_at DESC LIMIT ?`;
  return { sql, params };
}

function toSummary(row: Record<string, unknown>): ConversationSummary {
  return {
    id: requireString(row, "id"),
    title: optionalString(row, "title"),
    started_at: optionalString(row, "started_at"),
    persona: optionalString(row, "persona"),
    journey: optionalString(row, "journey"),
    message_count: Number(row.message_count),
  };
}

/** Return recent conversation summaries with optional equality filters, newest first. */
export function listRecentConversationSummaries(
  db: Database,
  filters: ListRecentConversationsFilters = {},
): ConversationSummary[] {
  const { sql, params } = buildListRecentConversationsQuery(filters);
  return db
    .prepare(sql)
    .all(...params)
    .map(toSummary);
}
