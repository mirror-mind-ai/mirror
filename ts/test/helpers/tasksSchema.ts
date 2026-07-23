// Shared test schema helper for the `tasks` table (CV22.DS7.US2), following the
// same single-source rationale as `identitySchema.ts` (CR009): copy-pasting DDL
// across test files invites drift unrelated to the code under test.

import type { WritableDatabase } from "../../src/db/database.ts";

/** Matches the TS-authored schema (`ts/src/db/schema.ts`), itself proven
 * structurally identical to Python's real bootstrapped `tasks` table
 * (CV22.DS6.TS1). */
export const TASKS_DDL = `CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  journey TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  due_date TEXT,
  stage TEXT,
  context TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  metadata TEXT,
  scheduled_at TEXT,
  time_hint TEXT
)`;

/** Create the `tasks` table on a writable test database. */
export function createTasksTable(db: WritableDatabase): void {
  db.exec(TASKS_DDL);
}
