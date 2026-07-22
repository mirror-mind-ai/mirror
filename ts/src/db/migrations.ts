// Incremental database migrations — CV22.DS6.TS2.
//
// Independent TS port of `src/memory/db/migrations.py`'s `MIGRATIONS` list and
// `run_migrations`, function-for-function, preserving every early-return guard
// exactly. Several of these guards are load-bearing: on a from-scratch fresh
// database (already proven by CV22.DS6.TS1's createSchema), most migration
// bodies are dead code — `001`/`005` no-op on the tables that don't exist yet,
// `008`/`009` explicitly skip ("SCHEMA will create/already includes this on a
// fresh database"), and `016`'s ADD-COLUMN branch never fires since `015`
// already creates `display_code` inline. Their real logic only exercises
// against a genuinely older, already-existing database — which is why this
// story's validation is a legacy-transition state-diff, not a fresh-DB check.
//
// Every migration is idempotent: running it twice is a no-op, matching the
// Python contract. `runMigrations` commits each migration individually via
// `withTransaction` and rolls back (and rethrows) only the currently failing
// one — migrations before it stay applied and recorded, so a retry resumes
// from exactly that point (see `migrationsWithTransaction`/`runMigrations`).

import { nowIso } from "../util/pyGenerators.ts";
import { type WritableDatabase, withTransaction } from "./database.ts";

function tableColumns(db: WritableDatabase, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function tableExists(db: WritableDatabase, table: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
    undefined
  );
}

function renameColumnIfNeeded(
  db: WritableDatabase,
  table: string,
  oldName: string,
  newName: string,
): void {
  if (!tableExists(db, table)) return;
  const columns = tableColumns(db, table);
  if (columns.has(newName)) return;
  if (!columns.has(oldName)) return;
  db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
}

function addColumnIfMissing(
  db: WritableDatabase,
  table: string,
  column: string,
  columnType: string,
): void {
  if (!tableExists(db, table)) return;
  const columns = tableColumns(db, table);
  if (columns.has(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnType}`);
}

function backfillDisplayCodes(
  db: WritableDatabase,
  table: string,
  prefix: string,
  orderBy: string,
): void {
  const journeys = (
    db
      .prepare(`SELECT DISTINCT journey FROM ${table} WHERE display_code IS NULL ORDER BY journey`)
      .all() as { journey: string }[]
  ).map((row) => row.journey);
  for (const journey of journeys) {
    const rows = db
      .prepare(`SELECT id FROM ${table} WHERE journey = ? ORDER BY ${orderBy}`)
      .all(journey) as { id: string }[];
    rows.forEach((row, index) => {
      const code = `${prefix}${String(index + 1).padStart(3, "0")}`;
      db.prepare(`UPDATE ${table} SET display_code = COALESCE(display_code, ?) WHERE id = ?`).run(
        code,
        row.id,
      );
    });
  }
}

// --- Migration apply functions (all idempotent) ---

function migrateProjectToTravessia(db: WritableDatabase): void {
  renameColumnIfNeeded(db, "conversations", "project", "travessia");
  renameColumnIfNeeded(db, "memories", "project", "travessia");
  db.exec("DROP INDEX IF EXISTS idx_memories_project");
  if (tableExists(db, "memories") && tableColumns(db, "memories").has("travessia")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_memories_travessia ON memories(travessia)");
  }
  if (tableExists(db, "identity")) {
    db.exec("UPDATE identity SET layer = 'travessia' WHERE layer = 'project'");
  }
}

function migrateCreateAttachments(db: WritableDatabase): void {
  if (tableExists(db, "attachments")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        travessia_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'markdown',
        tags TEXT,
        embedding BLOB,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_travessia
        ON attachments(travessia_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_travessia_name
        ON attachments(travessia_id, name);
  `);
}

function migrateCreateTasks(db: WritableDatabase): void {
  if (tableExists(db, "tasks")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        travessia TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo',
        due_date TEXT,
        stage TEXT,
        context TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_travessia ON tasks(travessia);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
  `);
}

function migrateTasksTemporalFields(db: WritableDatabase): void {
  addColumnIfMissing(db, "tasks", "scheduled_at", "TEXT");
  addColumnIfMissing(db, "tasks", "time_hint", "TEXT");
}

function migrateTravessiaToJourney(db: WritableDatabase): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_memories_travessia;
    DROP INDEX IF EXISTS idx_tasks_travessia;
    DROP INDEX IF EXISTS idx_attachments_travessia;
    DROP INDEX IF EXISTS idx_attachments_travessia_name;
  `);

  renameColumnIfNeeded(db, "conversations", "travessia", "journey");
  renameColumnIfNeeded(db, "memories", "travessia", "journey");
  renameColumnIfNeeded(db, "tasks", "travessia", "journey");
  renameColumnIfNeeded(db, "attachments", "travessia_id", "journey_id");

  if (tableExists(db, "identity")) {
    db.exec("UPDATE identity SET layer = 'journey' WHERE layer = 'travessia'");
    db.exec("UPDATE identity SET layer = 'journey_path' WHERE layer = 'caminho'");
  }

  if (tableExists(db, "memories")) {
    db.exec("UPDATE memories SET layer = 'journey' WHERE layer = 'travessia'");
    db.exec("UPDATE memories SET layer = 'journey_path' WHERE layer = 'caminho'");
  }

  if (tableExists(db, "memories") && tableColumns(db, "memories").has("journey")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_memories_journey ON memories(journey)");
  }
  if (tableExists(db, "tasks") && tableColumns(db, "tasks").has("journey")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_journey ON tasks(journey)");
  }
  if (tableExists(db, "attachments") && tableColumns(db, "attachments").has("journey_id")) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_attachments_journey ON attachments(journey_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_journey_name
          ON attachments(journey_id, name);
    `);
  }
}

function migrateCreateLlmCalls(db: WritableDatabase): void {
  if (tableExists(db, "llm_calls")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_calls (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        latency_ms INTEGER,
        cost_usd REAL,
        conversation_id TEXT REFERENCES conversations(id),
        session_id TEXT,
        called_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_llm_calls_conversation ON llm_calls(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_llm_calls_role ON llm_calls(role);
    CREATE INDEX IF NOT EXISTS idx_llm_calls_called_at ON llm_calls(called_at);
  `);
}

function migrateCreateMemoriesFts(db: WritableDatabase): void {
  // Skipped on fresh databases where `memories` does not exist yet — SCHEMA
  // creates memories_fts alongside the other tables in that case.
  if (tableExists(db, "memories_fts")) return;
  if (!tableExists(db, "memories")) return;
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        title,
        content,
        context,
        content=memories,
        content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS memories_fts_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, title, content, context)
        VALUES (NEW.rowid, NEW.title, NEW.content, COALESCE(NEW.context, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS memories_fts_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, context)
        VALUES ('delete', OLD.rowid, OLD.title, OLD.content, COALESCE(OLD.context, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS memories_fts_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, context)
        VALUES ('delete', OLD.rowid, OLD.title, OLD.content, COALESCE(OLD.context, ''));
        INSERT INTO memories_fts(rowid, title, content, context)
        VALUES (NEW.rowid, NEW.title, NEW.content, COALESCE(NEW.context, ''));
    END;

    INSERT INTO memories_fts(rowid, title, content, context)
    SELECT rowid, title, content, COALESCE(context, '') FROM memories;
  `);
}

function migrateCreateIdentityDescriptors(db: WritableDatabase): void {
  if (tableExists(db, "identity_descriptors")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS identity_descriptors (
        layer        TEXT NOT NULL,
        key          TEXT NOT NULL,
        descriptor   TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        PRIMARY KEY (layer, key)
    );
  `);
}

function migrateMemoriesReinforcementColumns(db: WritableDatabase): void {
  // Fresh database: SCHEMA already includes these columns.
  if (!tableExists(db, "memories")) return;
  const existing = tableColumns(db, "memories");
  if (!existing.has("last_accessed_at")) {
    db.exec("ALTER TABLE memories ADD COLUMN last_accessed_at TEXT");
  }
  if (!existing.has("use_count")) {
    db.exec("ALTER TABLE memories ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!existing.has("readiness_state")) {
    db.exec("ALTER TABLE memories ADD COLUMN readiness_state TEXT NOT NULL DEFAULT 'observed'");
  }
}

function migrateCreateConsolidations(db: WritableDatabase): void {
  if (tableExists(db, "consolidations")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS consolidations (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        proposal TEXT NOT NULL,
        result TEXT,
        source_memory_ids TEXT NOT NULL,
        target_layer TEXT,
        target_key TEXT,
        rationale TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_consolidations_status ON consolidations(status);
    CREATE INDEX IF NOT EXISTS idx_consolidations_created ON consolidations(created_at);
  `);
}

function migrateCreateOperationRuns(db: WritableDatabase): void {
  if (tableExists(db, "operation_runs")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_runs (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        status TEXT NOT NULL,
        outcome TEXT,
        parameters_json TEXT NOT NULL,
        summary_json TEXT,
        result_json TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_operation_runs_operation
        ON operation_runs(operation_id);
    CREATE INDEX IF NOT EXISTS idx_operation_runs_started
        ON operation_runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_operation_runs_status
        ON operation_runs(status);
  `);
}

function migrateCreateOperationRunEvents(db: WritableDatabase): void {
  if (tableExists(db, "operation_run_events")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES operation_runs(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_operation_run_events_run
        ON operation_run_events(run_id, sequence);
  `);
}

function migrateCreateExploratoryStories(db: WritableDatabase): void {
  if (tableExists(db, "exploratory_stories")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS exploratory_stories (
        id TEXT PRIMARY KEY,
        journey TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        current_story TEXT,
        narrative_summary TEXT,
        last_story_card TEXT,
        attractors_json TEXT,
        experiment_proposal_json TEXT,
        builder_handoff_json TEXT,
        source_conversations_json TEXT,
        artifact_dir TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        promoted_at TEXT,
        archived_at TEXT,
        CHECK(status IN ('active', 'archived', 'promoted'))
    );
    CREATE INDEX IF NOT EXISTS idx_exploratory_stories_journey
        ON exploratory_stories(journey, updated_at);
    CREATE INDEX IF NOT EXISTS idx_exploratory_stories_status
        ON exploratory_stories(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_exploratory_stories_one_active_per_journey
        ON exploratory_stories(journey)
        WHERE status = 'active';
  `);
}

function migrateCreateIdentityIntegrations(db: WritableDatabase): void {
  if (tableExists(db, "identity_integrations")) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS identity_integrations (
        id TEXT PRIMARY KEY,
        layer TEXT NOT NULL,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'soul_mode',
        origin TEXT,
        conversation_id TEXT REFERENCES conversations(id),
        journal_id TEXT REFERENCES memories(id),
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_identity_integrations_target
        ON identity_integrations(layer, key, created_at);
    CREATE INDEX IF NOT EXISTS idx_identity_integrations_status
        ON identity_integrations(status);
  `);
}

function migrateCreateBuilderWorkbench(db: WritableDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS builder_refinement_stories (
        id TEXT PRIMARY KEY,
        journey TEXT NOT NULL,
        display_code TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        position INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        provenance TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        pulled_at TEXT,
        closed_at TEXT,
        CHECK(status IN ('draft', 'open', 'active', 'closed', 'parked'))
    );
    CREATE INDEX IF NOT EXISTS idx_builder_refinement_stories_journey_status
        ON builder_refinement_stories(journey, status, position, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_builder_refinement_stories_journey_display_code
        ON builder_refinement_stories(journey, display_code);

    CREATE TABLE IF NOT EXISTS builder_change_requests (
        id TEXT PRIMARY KEY,
        journey TEXT NOT NULL,
        display_code TEXT NOT NULL,
        refinement_story_id TEXT REFERENCES builder_refinement_stories(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'captured',
        position INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        provenance TEXT,
        outcome_notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        CHECK(status IN (
            'captured', 'planned', 'active', 'implemented', 'validated',
            'done', 'parked', 'rejected', 'promoted'
        ))
    );
    CREATE INDEX IF NOT EXISTS idx_builder_change_requests_story_status
        ON builder_change_requests(journey, refinement_story_id, status, position, updated_at);
    CREATE INDEX IF NOT EXISTS idx_builder_change_requests_journey_status
        ON builder_change_requests(journey, status, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_builder_change_requests_journey_display_code
        ON builder_change_requests(journey, display_code);

    CREATE TABLE IF NOT EXISTS builder_refinement_cursors (
        journey TEXT PRIMARY KEY,
        active_refinement_story_id TEXT REFERENCES builder_refinement_stories(id),
        active_change_request_id TEXT REFERENCES builder_change_requests(id),
        last_refinement_event TEXT,
        updated_at TEXT NOT NULL
    );
  `);
}

function migrateBuilderWorkbenchDisplayCodes(db: WritableDatabase): void {
  const storyCols = tableColumns(db, "builder_refinement_stories");
  if (!storyCols.has("display_code")) {
    db.exec("ALTER TABLE builder_refinement_stories ADD COLUMN display_code TEXT");
  }
  const crCols = tableColumns(db, "builder_change_requests");
  if (!crCols.has("display_code")) {
    db.exec("ALTER TABLE builder_change_requests ADD COLUMN display_code TEXT");
  }

  backfillDisplayCodes(
    db,
    "builder_refinement_stories",
    "RS",
    "position ASC, created_at ASC, id ASC",
  );
  backfillDisplayCodes(db, "builder_change_requests", "CR", "created_at ASC, position ASC, id ASC");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_builder_refinement_stories_journey_display_code
        ON builder_refinement_stories(journey, display_code);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_builder_change_requests_journey_display_code
        ON builder_change_requests(journey, display_code);
  `);
}

/**
 * 017 (CV22.DS6.US2) — the first *new forward* migration authored by the TS
 * engine, graduating journey hierarchy from JSON metadata to a first-class
 * `identity.parent_journey` column. Guarded on table existence: `identity` is
 * created by `createSchema`, which runs AFTER migrations on a fresh database, so
 * on a fresh DB this is a no-op (createSchema adds the column + index) and only a
 * genuinely older, already-existing `identity` table is altered and backfilled
 * here. Idempotent: the column guard, the `parent_journey IS NULL` backfill
 * filter, and `CREATE INDEX IF NOT EXISTS` all no-op on re-run. The value stays
 * mirrored in metadata JSON (dual-source) so the still-present Python surfaces
 * keep reading it until DS7/DS10.
 */
function migrateJourneyParentColumn(db: WritableDatabase): void {
  if (!tableExists(db, "identity")) return;
  addColumnIfMissing(db, "identity", "parent_journey", "TEXT");
  const rows = db
    .prepare(
      "SELECT id, metadata FROM identity WHERE layer = 'journey' " +
        "AND parent_journey IS NULL AND metadata IS NOT NULL",
    )
    .all() as { id: string; metadata: string }[];
  for (const row of rows) {
    let parent: unknown;
    try {
      parent = (JSON.parse(row.metadata) as Record<string, unknown>).parent_journey;
    } catch {
      continue;
    }
    if (typeof parent === "string" && parent) {
      db.prepare("UPDATE identity SET parent_journey = ? WHERE id = ?").run(parent, row.id);
    }
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_identity_parent_journey " +
      "ON identity(parent_journey) WHERE parent_journey IS NOT NULL",
  );
}

export type MigrationApply = (db: WritableDatabase) => void;

export const MIGRATIONS: readonly (readonly [string, MigrationApply])[] = [
  ["001_project_to_travessia", migrateProjectToTravessia],
  ["002_create_attachments", migrateCreateAttachments],
  ["003_create_tasks", migrateCreateTasks],
  ["004_tasks_temporal_fields", migrateTasksTemporalFields],
  ["005_travessia_to_journey", migrateTravessiaToJourney],
  ["006_create_llm_calls", migrateCreateLlmCalls],
  ["007_create_identity_descriptors", migrateCreateIdentityDescriptors],
  ["008_create_memories_fts", migrateCreateMemoriesFts],
  ["009_memories_reinforcement_columns", migrateMemoriesReinforcementColumns],
  ["010_create_consolidations", migrateCreateConsolidations],
  ["011_create_operation_runs", migrateCreateOperationRuns],
  ["012_create_operation_run_events", migrateCreateOperationRunEvents],
  ["013_create_exploratory_stories", migrateCreateExploratoryStories],
  ["014_create_identity_integrations", migrateCreateIdentityIntegrations],
  ["015_create_builder_workbench", migrateCreateBuilderWorkbench],
  ["016_builder_workbench_display_codes", migrateBuilderWorkbenchDisplayCodes],
  ["017_journey_parent_column", migrateJourneyParentColumn],
];

/**
 * Run any pending migrations against an existing database. Each migration is
 * idempotent, so running this against a database that was already
 * bootstrapped from `createSchema()` is safe and a no-op.
 *
 * Commits each migration individually (`withTransaction`) and only rolls back
 * (and rethrows) the currently failing one — migrations before it stay
 * applied and recorded, so a retry resumes from exactly that point. Matches
 * `memory.db.migrations.run_migrations`'s documented partial-failure
 * contract.
 */
export function runMigrations(db: WritableDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
    )
  `);

  for (const [migrationId, apply] of MIGRATIONS) {
    const row = db.prepare("SELECT id FROM _migrations WHERE id = ?").get(migrationId);
    if (row) continue;
    withTransaction(db, () => {
      apply(db);
      db.prepare("INSERT OR IGNORE INTO _migrations (id, applied_at) VALUES (?, ?)").run(
        migrationId,
        nowIso(),
      );
    });
  }
}
