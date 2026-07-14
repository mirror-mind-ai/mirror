// Shared test schema helpers (CR009).
//
// The `identity` DDL and the `_migrations` seed were copy-pasted across a dozen
// test files; drift between the copies would produce failures unrelated to the
// code under test. These are the single source.

import type { WritableDatabase } from "../../src/db/database.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";

/** The production shape of the `identity` table (matches src/memory schema). */
export const IDENTITY_DDL =
  "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
  "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
  "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key))";

/** Create the `identity` table on a writable test database. */
export function createIdentityTable(db: WritableDatabase): void {
  db.exec(IDENTITY_DDL);
}

/**
 * Create the `_migrations` bookkeeping table and mark every migration the TS
 * core was built against as applied, so the front door's schema guard accepts
 * the database.
 */
export function seedKnownMigrations(db: WritableDatabase): void {
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const insert = db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, 't')");
  for (const id of KNOWN_MIGRATION_IDS) {
    insert.run(id);
  }
}
