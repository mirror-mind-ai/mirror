// Activation every TS serving path performs before opening its connection.
//
// Bootstrap a missing file (CV22.DS6.TS4), then apply any pending forward
// migration (US3 migrate-on-open). Python did the equivalent inside
// `get_connection`, so every one of its entry points -- including the MCP
// server -- got it for free; TypeScript has to compose it, and before
// CV22.DS9.TS2 only the front door did.
//
// This order is what lets `assertSchemaState` be strict (CV22.DS10.TS5): by
// the time it runs, every pending known migration has been applied, so a user
// never meets a "schema is older" error for work the engine could have done.
//
// Deliberately pure: it returns what happened and writes no log. The front door
// records a redacted `migrate_on_open` event in the front-door log; the MCP
// server writes one line to stderr, which is where its diagnostics belong. A
// single function parameterized on a logger would have been more machinery than
// the two lines it saves.

import { bootstrapDatabaseIfMissing } from "./bootstrap.ts";
import type { MigrateOnOpenResult } from "./migrateOnOpen.ts";
import { ensureMigratedOnOpen, type MigrateOnOpenOptions } from "./migrateOnOpen.ts";

/**
 * Bootstrap-if-missing, then migrate-if-pending. The steady state is a cheap
 * no-op: one read of `_migrations`. A one-time migration takes its own backup
 * under the cross-process bootstrap lock (the DS6 contract), so concurrent
 * openers cannot double-apply it.
 */
export function ensureDatabaseReady(
  dbPath: string,
  options: MigrateOnOpenOptions = {},
): MigrateOnOpenResult {
  bootstrapDatabaseIfMissing(dbPath, options);
  return ensureMigratedOnOpen(dbPath, options);
}
