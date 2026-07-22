// Schema-state guard for the database seam (CR018, RS003 database audit).
//
// CV22 freezes the SQLite schema as a compatibility contract, but the Python
// core is still alive and still migrating (CV9 work). This guard is the
// contract's enforcement point on the TS side: before serving a command, the
// front door asserts that the database's `_migrations` bookkeeping matches the
// migration set this TS core was built against, converting silent schema drift
// into an explicit, actionable error.
//
// `KNOWN_MIGRATION_IDS` is the TS-authoritative migration set. It carries every
// Python `MIGRATIONS` id (as a prefix) plus any migration TS now authors on its
// own — from CV22.DS6.US2 onward TS schema custody means TS ⊇ Python. The
// Python-side test (`tests/unit/test_ts_schema_contract.py`) asserts the Python
// list is a prefix of this one, so a new Python migration still cannot land
// without extending this list, while TS may add forward migrations Python lacks.

import type { Database } from "./database.ts";

/** Raised when the database's migration state does not match this TS build. */
export class SchemaStateError extends Error {}

/**
 * Migrations TS authored with no Python counterpart (TS ⊇ Python, CV22.DS6.US2).
 * A database missing ONLY these is still served — the read/write path does not
 * yet depend on them, and they will be applied to existing databases by the TS
 * migrate-on-open path (a CV22.DS6 follow-up). A database missing any *Python*
 * migration is still refused, because Python remains able to apply those.
 */
export const TS_AUTHORED_MIGRATION_IDS: ReadonlySet<string> = new Set([
  "017_journey_parent_column",
]);

/** The migration ids this TS core was built against (Python prefix + TS-authored). */
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
 * Assert that the database was bootstrapped by a Python core whose migration
 * set matches this TS build. Three failure modes, each named in the error:
 * `_migrations` absent (not a bootstrapped Mirror database), a known id
 * missing (database older than this TS core — run the Python core once to
 * migrate), an unknown id present (database migrated by a newer checkout than
 * the running TS code — update this checkout).
 */
export function assertSchemaState(db: Database): void {
  let rows: { id: string }[];
  try {
    rows = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
  } catch {
    throw new SchemaStateError(
      "database has no _migrations table — not a bootstrapped Mirror database. " +
        "Run any Python `uv run python -m memory` command once to initialize it.",
    );
  }
  const applied = new Set(rows.map((row) => row.id));
  // Only *Python* migrations are required to serve: Python can apply those, and
  // the runtime read/write path depends on them. A database missing only
  // TS-authored migrations (TS ⊇ Python) is tolerated — Python cannot apply them
  // and the current read path does not need them; the migrate-on-open follow-up
  // will apply them to existing databases.
  const missingRequired = KNOWN_MIGRATION_IDS.filter(
    (id) => !applied.has(id) && !TS_AUTHORED_MIGRATION_IDS.has(id),
  );
  if (missingRequired.length > 0) {
    throw new SchemaStateError(
      `database schema is older than this TS core (pending migrations: ${missingRequired.join(", ")}). ` +
        "Run any Python `uv run python -m memory` command once to migrate, then retry.",
    );
  }
  const known = new Set(KNOWN_MIGRATION_IDS);
  const unknown = rows.map((row) => row.id).filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new SchemaStateError(
      `database schema is newer than this TS core (unknown migrations: ${unknown.join(", ")}). ` +
        "Update this Mirror checkout (git pull) so the TS front door matches the database.",
    );
  }
}
