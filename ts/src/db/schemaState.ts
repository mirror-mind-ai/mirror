// Schema-state guard for the database seam (CR018, RS003 database audit).
//
// CV22 freezes the SQLite schema as a compatibility contract. This guard is
// its enforcement point: before serving a command, the front door asserts that
// the database's `_migrations` bookkeeping matches the migration set this core
// was built against, converting silent schema drift into an explicit,
// actionable error.
//
// `KNOWN_MIGRATION_IDS` is the authoritative migration set. It began as the
// Python list plus whatever TypeScript authored on its own (CV22.DS6.US2 made
// TS ⊇ Python), and `tests/unit/test_ts_schema_contract.py` held the other
// side of that contract so a new Python migration could not land without
// extending this list.
//
// CV22.DS10.TS5 collapses the two-custodian model: TypeScript carries all
// seventeen, Python carries sixteen and is being deleted, so there is no second
// list to stay a prefix of. The remedies below name `runtime migrate` rather
// than an interpreter, for the same reason.

import type { Database } from "./database.ts";

/** Raised when the database's migration state does not match this TS build. */
export class SchemaStateError extends Error {}

/**
 * Every migration this core knows, in order. Until CV22.DS10.TS5 the list was
 * the Python engine's plus the TypeScript-authored tail; since then the
 * TypeScript engine is the only custodian, and the list is simply its own.
 */
export const KNOWN_MIGRATION_IDS: readonly string[] = [
  "001_project_to_travessia",
  "002_create_attachments",
  "003_create_tasks",
  "004_tasks_temporal_fields",
  "005_travessia_to_journey",
  "006_create_llm_calls",
  "007_create_identity_descriptors",
  "008_create_memories_fts",
  "009_memories_reinforcement_columns",
  "010_create_consolidations",
  "011_create_operation_runs",
  "012_create_operation_run_events",
  "013_create_exploratory_stories",
  "014_create_identity_integrations",
  "015_create_builder_workbench",
  "016_builder_workbench_display_codes",
  // TS-authored, no Python counterpart (CV22.DS6.US2 — first TS ⊋ Python migration).
  "017_journey_parent_column",
];

/**
 * Assert that the database's migration ledger matches this build. Three
 * failure modes, each named in the error: `_migrations` absent (not a
 * bootstrapped Mirror database), a known id missing (database older than this
 * core — `runtime migrate` brings it forward), an unknown id present (database
 * migrated by a newer core than the running one — update this installation).
 */
export function assertSchemaState(db: Database): void {
  let rows: { id: string }[];
  try {
    rows = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
  } catch {
    throw new SchemaStateError(
      "database has no _migrations table — not a bootstrapped Mirror database. " +
        "Point Mirror at the right file, or create one: any write command bootstraps a missing database.",
    );
  }
  const applied = new Set(rows.map((row) => row.id));
  // Every known migration is required now. Until CV22.DS10.TS5 this filtered
  // out the TS-authored tail, because Python could not apply those and the read
  // path did not need them -- a split that only made sense while two engines
  // shared custody. TypeScript carries all seventeen and is the only engine
  // left to apply them, so "pending" means pending.
  const missingRequired = KNOWN_MIGRATION_IDS.filter((id) => !applied.has(id));
  if (missingRequired.length > 0) {
    throw new SchemaStateError(
      `database schema is older than this TS core (pending migrations: ${missingRequired.join(", ")}). ` +
        "Run `runtime migrate` to bring it forward, then retry.",
    );
  }
  const known = new Set(KNOWN_MIGRATION_IDS);
  const unknown = rows.map((row) => row.id).filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new SchemaStateError(
      `database schema is newer than this TS core (unknown migrations: ${unknown.join(", ")}). ` +
        "Update this Mirror installation so its core matches the database.",
    );
  }
}
