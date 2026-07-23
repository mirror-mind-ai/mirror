// Shared `memories` row writer + minimal read, extracted so extraction
// (CV22.DS5) and cultivation's `merge` action (CV22.DS7.US3) do not each grow
// their own copy of the same INSERT (DRY: the original write path lived only
// in `conversation/extraction.ts`; cultivation needed the identical shape for
// a merged memory, so the primitive moved here, one level below both callers,
// and extraction now calls through it unchanged).

import type { Database, SqlValue, WritableDatabase } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

/** Every writable column of a `memories` row except `last_accessed_at`
 * (never set on insert -- it starts NULL, same as Python's `Memory` default). */
export interface MemoryRowInput {
  id: string;
  conversationId?: string | null;
  memoryType: string;
  layer: string;
  title: string;
  content: string;
  context?: string | null;
  journey?: string | null;
  persona?: string | null;
  tags?: string | null;
  createdAt: string;
  relevanceScore?: number;
  embedding: Uint8Array;
  metadata?: string | null;
  useCount?: number;
  readinessState?: string;
}

const MEMORY_COLUMNS =
  "id, conversation_id, memory_type, layer, title, content, context, journey, persona, tags, " +
  "created_at, relevance_score, embedding, metadata, use_count, readiness_state";

/**
 * Insert one `memories` row. Mirrors both `insert_memory`-shaped writers in
 * the Python core: `ConversationExtraction`'s per-memory insert and
 * `consolidate_cmd.cmd_apply`'s `merge` action -- same 16 columns, same
 * defaults (`relevance_score` 1.0, `use_count` 0, `readiness_state`
 * `'observed'`), `last_accessed_at` always starts NULL (omitted, not a
 * writable column here).
 */
export function createMemoryRow(db: WritableDatabase, input: MemoryRowInput): void {
  const params: SqlValue[] = [
    input.id,
    input.conversationId ?? null,
    input.memoryType,
    input.layer,
    input.title,
    input.content,
    input.context ?? null,
    input.journey ?? null,
    input.persona ?? null,
    input.tags ?? null,
    input.createdAt,
    input.relevanceScore ?? 1.0,
    input.embedding,
    input.metadata ?? null,
    input.useCount ?? 0,
    input.readinessState ?? "observed",
  ];
  db.prepare(
    `INSERT INTO memories (${MEMORY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(...params);
}

/** The projection `consolidate apply`'s `merge` action needs from the first source memory. */
export interface MergeSourceMemory {
  memory_type: string;
  layer: string;
  title: string;
  journey: string | null;
}

/** Port of the fields `cmd_apply`'s merge branch reads via `Store.get_memory`. */
export function getMemorySourceForMerge(db: Database, id: string): MergeSourceMemory | null {
  const row = db
    .prepare("SELECT memory_type, layer, title, journey FROM memories WHERE id = ?")
    .get(id);
  if (row === undefined) return null;
  return {
    memory_type: requireString(row, "memory_type"),
    layer: requireString(row, "layer"),
    title: requireString(row, "title"),
    journey: optionalString(row, "journey"),
  };
}
