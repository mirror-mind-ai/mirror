// Memory listing parity port (CV22.DS2.US3).
//
// A faithful TypeScript port of Python `Store.list_recent_memory_summaries` and
// `Store.count_memories_by_type` (`src/memory/storage/memories.py`). Following
// the database-seam philosophy, the ordering is pushed down to SQLite
// (`ORDER BY created_at DESC`) — the TS unit is a query builder + row→summary
// mapper, not a re-implementation of SQLite's sort. The `--search` listing path
// is out of scope here: it reuses the US1 hybrid ranker.

import type { Database, SqlValue } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

/** The listing projection, mirroring the Python `MemorySummary` DTO. */
export interface MemorySummary {
  id: string;
  memory_type: string;
  layer: string;
  title: string;
  content: string;
  context: string | null;
  journey: string | null;
  persona: string | null;
  tags: string | null;
  created_at: string;
}

/** Optional equality filters and limit for the recent-memories read. */
export interface ListRecentFilters {
  limit?: number;
  memoryType?: string | null;
  layer?: string | null;
  journey?: string | null;
}

const SUMMARY_COLUMNS =
  "id, memory_type, layer, title, content, context, journey, persona, tags, created_at";

/**
 * Build the parameterized recent-memories query, mirroring the Python builder:
 * a `1=1` seed, one `col = ?` clause per provided filter (in
 * type → layer → journey order), `ORDER BY created_at DESC`, and a trailing
 * `LIMIT ?`. Params are ordered to match the placeholders.
 */
export function buildListRecentQuery(filters: ListRecentFilters = {}): {
  sql: string;
  params: SqlValue[];
} {
  const { limit = 20, memoryType = null, layer = null, journey = null } = filters;
  const conditions = ["1=1"];
  const params: SqlValue[] = [];
  if (memoryType) {
    conditions.push("memory_type = ?");
    params.push(memoryType);
  }
  if (layer) {
    conditions.push("layer = ?");
    params.push(layer);
  }
  if (journey) {
    conditions.push("journey = ?");
    params.push(journey);
  }
  params.push(limit);
  const sql =
    `SELECT ${SUMMARY_COLUMNS} FROM memories ` +
    `WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`;
  return { sql, params };
}

function toSummary(row: Record<string, unknown>): MemorySummary {
  return {
    id: requireString(row, "id"),
    memory_type: requireString(row, "memory_type"),
    layer: requireString(row, "layer"),
    title: requireString(row, "title"),
    content: requireString(row, "content"),
    context: optionalString(row, "context"),
    journey: optionalString(row, "journey"),
    persona: optionalString(row, "persona"),
    tags: optionalString(row, "tags"),
    created_at: requireString(row, "created_at"),
  };
}

/** Return recent memory summaries with optional equality filters, newest first. */
export function listRecentMemorySummaries(
  db: Database,
  filters: ListRecentFilters = {},
): MemorySummary[] {
  const { sql, params } = buildListRecentQuery(filters);
  return db
    .prepare(sql)
    .all(...params)
    .map(toSummary);
}

/**
 * Return memory counts grouped by type. SQLite leaves `GROUP BY` order
 * unspecified, so — like the Python CLI, which sorts before display — callers
 * compare these as a map/sorted set, not as an ordered list.
 */
export function countMemoriesByType(db: Database): [string, number][] {
  return db
    .prepare("SELECT memory_type, COUNT(*) as count FROM memories GROUP BY memory_type")
    .all()
    .map((row) => [requireString(row, "memory_type"), Number(row.count)] as [string, number]);
}
