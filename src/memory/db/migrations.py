"""Incremental database migrations.

Every migration is idempotent: running it twice is a no-op, and running it
against a fresh database that was already initialized from SCHEMA is also a
no-op. Migrations do NOT silently swallow errors — a genuine failure raises.

This matters under concurrent startup: when two processes race to initialize
the same database, SCHEMA and migrations each may have been partially applied
by the other process. Both layers must tolerate that without masking real
bugs.
"""

import sqlite3
from collections.abc import Callable

from memory.models import _now


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone()
    return row is not None


def _rename_column_if_needed(
    conn: sqlite3.Connection, table: str, old_name: str, new_name: str
) -> None:
    if not _table_exists(conn, table):
        return
    columns = _table_columns(conn, table)
    if new_name in columns:
        return
    if old_name not in columns:
        return
    conn.execute(f"ALTER TABLE {table} RENAME COLUMN {old_name} TO {new_name}")


def _add_column_if_missing(
    conn: sqlite3.Connection, table: str, column: str, column_type: str
) -> None:
    if not _table_exists(conn, table):
        return
    columns = _table_columns(conn, table)
    if column in columns:
        return
    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")


# --- Migration apply functions (all idempotent) ---


def _migrate_project_to_travessia(conn: sqlite3.Connection) -> None:
    """Rename legacy `project` columns to `travessia` (Portuguese-era intermediate)."""
    _rename_column_if_needed(conn, "conversations", "project", "travessia")
    _rename_column_if_needed(conn, "memories", "project", "travessia")
    conn.execute("DROP INDEX IF EXISTS idx_memories_project")
    # Index on travessia is dropped again by migration 005; create only if the
    # column still exists so we don't break on modern schemas.
    if _table_exists(conn, "memories") and "travessia" in _table_columns(conn, "memories"):
        conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_travessia ON memories(travessia)")
    if _table_exists(conn, "identity"):
        conn.execute("UPDATE identity SET layer = 'travessia' WHERE layer = 'project'")


def _migrate_create_attachments(conn: sqlite3.Connection) -> None:
    """Create the attachments table if legacy init never did."""
    if _table_exists(conn, "attachments"):
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_create_tasks(conn: sqlite3.Connection) -> None:
    """Create the tasks table if legacy init never did."""
    if _table_exists(conn, "tasks"):
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_tasks_temporal_fields(conn: sqlite3.Connection) -> None:
    """Add scheduled_at / time_hint to tasks if missing."""
    _add_column_if_missing(conn, "tasks", "scheduled_at", "TEXT")
    _add_column_if_missing(conn, "tasks", "time_hint", "TEXT")


def _migrate_travessia_to_journey(conn: sqlite3.Connection) -> None:
    """Rename persisted journey terminology from Portuguese to English."""
    conn.executescript(
        """
        DROP INDEX IF EXISTS idx_memories_travessia;
        DROP INDEX IF EXISTS idx_tasks_travessia;
        DROP INDEX IF EXISTS idx_attachments_travessia;
        DROP INDEX IF EXISTS idx_attachments_travessia_name;
        """
    )

    _rename_column_if_needed(conn, "conversations", "travessia", "journey")
    _rename_column_if_needed(conn, "memories", "travessia", "journey")
    _rename_column_if_needed(conn, "tasks", "travessia", "journey")
    _rename_column_if_needed(conn, "attachments", "travessia_id", "journey_id")

    if _table_exists(conn, "identity"):
        conn.execute("UPDATE identity SET layer = 'journey' WHERE layer = 'travessia'")
        conn.execute("UPDATE identity SET layer = 'journey_path' WHERE layer = 'caminho'")

    if _table_exists(conn, "memories"):
        conn.execute("UPDATE memories SET layer = 'journey' WHERE layer = 'travessia'")
        conn.execute("UPDATE memories SET layer = 'journey_path' WHERE layer = 'caminho'")

    if _table_exists(conn, "memories") and "journey" in _table_columns(conn, "memories"):
        conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_journey ON memories(journey)")
    if _table_exists(conn, "tasks") and "journey" in _table_columns(conn, "tasks"):
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_journey ON tasks(journey)")
    if _table_exists(conn, "attachments") and "journey_id" in _table_columns(conn, "attachments"):
        conn.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_attachments_journey ON attachments(journey_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_journey_name
                ON attachments(journey_id, name);
            """
        )


def _migrate_create_llm_calls(conn: sqlite3.Connection) -> None:
    """Create the llm_calls table if it does not yet exist."""
    if _table_exists(conn, "llm_calls"):
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_create_memories_fts(conn: sqlite3.Connection) -> None:
    """Create the memories_fts FTS5 table, triggers, and initial population.

    Skipped on fresh databases where `memories` does not exist yet — SCHEMA
    creates memories_fts alongside the other tables in that case.
    """
    if _table_exists(conn, "memories_fts"):
        return
    if not _table_exists(conn, "memories"):
        # Fresh database: SCHEMA will create memories_fts when it runs after migrations.
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_create_identity_descriptors(conn: sqlite3.Connection) -> None:
    """Create the identity_descriptors sidecar table if it does not yet exist."""
    if _table_exists(conn, "identity_descriptors"):
        return
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS identity_descriptors (
            layer        TEXT NOT NULL,
            key          TEXT NOT NULL,
            descriptor   TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            PRIMARY KEY (layer, key)
        );
        """
    )


def _migrate_memories_reinforcement_columns(conn: sqlite3.Connection) -> None:
    """Add last_accessed_at, use_count, and readiness_state to the memories table.

    Introduced in CV7.E4.S2 (honest reinforcement) to distinguish use from
    retrieval and enable time-decayed reinforcement scoring.

    - last_accessed_at: timestamp of the last retrieval, cached for fast decay
    - use_count: incremented when the memory was explicitly referenced in a response
    - readiness_state: Jungian progression state (observed → integrated)
    """
    if not _table_exists(conn, "memories"):
        # Fresh database: SCHEMA already includes these columns.
        return
    existing = _table_columns(conn, "memories")
    if "last_accessed_at" not in existing:
        conn.execute("ALTER TABLE memories ADD COLUMN last_accessed_at TEXT")
    if "use_count" not in existing:
        conn.execute("ALTER TABLE memories ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0")
    if "readiness_state" not in existing:
        conn.execute(
            "ALTER TABLE memories ADD COLUMN readiness_state TEXT NOT NULL DEFAULT 'observed'"
        )
    conn.commit()


def _migrate_create_consolidations(conn: sqlite3.Connection) -> None:
    """Create the consolidations table introduced in CV7.E4.S3.

    Tracks consolidation proposals (merge / identity_update / shadow_candidate)
    with full provenance: source memory IDs, proposed content, user decision,
    and the resulting content that was written to the identity layer.
    """
    if _table_exists(conn, "consolidations"):
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_create_operation_runs(conn: sqlite3.Connection) -> None:
    """Create the operation_runs table introduced for web operation audit evidence."""
    if _table_exists(conn, "operation_runs"):
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_create_operation_run_events(conn: sqlite3.Connection) -> None:
    """Create durable lifecycle events for asynchronous web operation runs."""
    if _table_exists(conn, "operation_run_events"):
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_create_exploratory_stories(conn: sqlite3.Connection) -> None:
    """Create durable Exploratory Story records for Explorer Mode."""
    if _table_exists(conn, "exploratory_stories"):
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_create_identity_integrations(conn: sqlite3.Connection) -> None:
    """Create atomic records for confirmed identity integrations."""
    if _table_exists(conn, "identity_integrations"):
        return
    conn.executescript(
        """
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
        """
    )


def _migrate_create_builder_workbench(conn: sqlite3.Connection) -> None:
    """Create durable Builder Workbench storage for Refinement Work."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS builder_refinement_stories (
            id TEXT PRIMARY KEY,
            journey TEXT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS builder_change_requests (
            id TEXT PRIMARY KEY,
            journey TEXT NOT NULL,
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

        CREATE TABLE IF NOT EXISTS builder_refinement_cursors (
            journey TEXT PRIMARY KEY,
            active_refinement_story_id TEXT REFERENCES builder_refinement_stories(id),
            active_change_request_id TEXT REFERENCES builder_change_requests(id),
            last_refinement_event TEXT,
            updated_at TEXT NOT NULL
        );
        """
    )


MigrationApply = Callable[[sqlite3.Connection], None]


MIGRATIONS: list[tuple[str, MigrationApply]] = [
    ("001_project_to_travessia", _migrate_project_to_travessia),
    ("002_create_attachments", _migrate_create_attachments),
    ("003_create_tasks", _migrate_create_tasks),
    ("004_tasks_temporal_fields", _migrate_tasks_temporal_fields),
    ("005_travessia_to_journey", _migrate_travessia_to_journey),
    ("006_create_llm_calls", _migrate_create_llm_calls),
    ("007_create_identity_descriptors", _migrate_create_identity_descriptors),
    ("008_create_memories_fts", _migrate_create_memories_fts),
    ("009_memories_reinforcement_columns", _migrate_memories_reinforcement_columns),
    ("010_create_consolidations", _migrate_create_consolidations),
    ("011_create_operation_runs", _migrate_create_operation_runs),
    ("012_create_operation_run_events", _migrate_create_operation_run_events),
    ("013_create_exploratory_stories", _migrate_create_exploratory_stories),
    ("014_create_identity_integrations", _migrate_create_identity_integrations),
    ("015_create_builder_workbench", _migrate_create_builder_workbench),
]


def run_migrations(conn: sqlite3.Connection) -> None:
    """Run any pending migrations against an existing database.

    Each migration is idempotent, so running this against a database that was
    already bootstrapped from SCHEMA is safe and a no-op.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS _migrations (
            id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        )
        """
    )
    conn.commit()

    for migration_id, apply in MIGRATIONS:
        row = conn.execute("SELECT id FROM _migrations WHERE id = ?", (migration_id,)).fetchone()
        if row:
            continue
        try:
            apply(conn)
        except Exception:
            conn.rollback()
            raise
        conn.execute(
            "INSERT OR IGNORE INTO _migrations (id, applied_at) VALUES (?, ?)",
            (migration_id, _now()),
        )
        conn.commit()
