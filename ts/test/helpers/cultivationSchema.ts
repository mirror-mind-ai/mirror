// Shared test schema helpers for `memories` (with `readiness_state`) and
// `consolidations` (CV22.DS7.US3). Single source so cultivation tests can't
// drift from the production DDL (`ts/src/db/schema.ts`), following the CR009
// convention `identitySchema.ts`/`tasksSchema.ts` established.

import type { WritableDatabase } from "../../src/db/database.ts";

export const MEMORIES_DDL =
  "CREATE TABLE memories (id TEXT PRIMARY KEY, conversation_id TEXT, memory_type TEXT NOT NULL, " +
  "layer TEXT NOT NULL DEFAULT 'ego', title TEXT NOT NULL, content TEXT NOT NULL, context TEXT, " +
  "journey TEXT, persona TEXT, tags TEXT, created_at TEXT NOT NULL, relevance_score REAL DEFAULT 1.0, " +
  "embedding BLOB, metadata TEXT, last_accessed_at TEXT, use_count INTEGER NOT NULL DEFAULT 0, " +
  "readiness_state TEXT NOT NULL DEFAULT 'observed')";

export const CONSOLIDATIONS_DDL =
  "CREATE TABLE consolidations (id TEXT PRIMARY KEY, action TEXT NOT NULL, proposal TEXT NOT NULL, " +
  "result TEXT, source_memory_ids TEXT NOT NULL, target_layer TEXT, target_key TEXT, rationale TEXT, " +
  "status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, reviewed_at TEXT)";

/** Create `memories` on a writable test database. */
export function createMemoriesTable(db: WritableDatabase): void {
  db.exec(MEMORIES_DDL);
}

/** Create `consolidations` on a writable test database. */
export function createConsolidationsTable(db: WritableDatabase): void {
  db.exec(CONSOLIDATIONS_DDL);
}

export interface SeedMemoryInput {
  id: string;
  memoryType?: string;
  layer?: string;
  title?: string;
  content?: string;
  context?: string | null;
  journey?: string | null;
  createdAt: string;
  embedding?: Uint8Array | null;
  readinessState?: string;
}

/** Insert a memory row with sane defaults, mirroring the Python `Memory` model's own defaults. */
export function insertMemory(db: WritableDatabase, input: SeedMemoryInput): void {
  db.prepare(
    "INSERT INTO memories (id, memory_type, layer, title, content, context, journey, created_at, " +
      "relevance_score, embedding, use_count, readiness_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1.0, ?, 0, ?)",
  ).run(
    input.id,
    input.memoryType ?? "insight",
    input.layer ?? "ego",
    input.title ?? `Memory ${input.id}`,
    input.content ?? `Synthetic content for ${input.id}.`,
    input.context ?? null,
    input.journey ?? null,
    input.createdAt,
    input.embedding ?? null,
    input.readinessState ?? "observed",
  );
}
