PRAGMA foreign_keys=OFF;
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    interface TEXT NOT NULL,
    persona TEXT,
    journey TEXT,
    summary TEXT,
    tags TEXT,
    metadata TEXT
);
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    memory_type TEXT NOT NULL,
    layer TEXT NOT NULL DEFAULT 'ego',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    context TEXT,
    journey TEXT,
    persona TEXT,
    tags TEXT,
    created_at TEXT NOT NULL,
    relevance_score REAL DEFAULT 1.0,
    embedding BLOB,
    metadata TEXT
, last_accessed_at TEXT, use_count INTEGER NOT NULL DEFAULT 0, readiness_state TEXT NOT NULL DEFAULT 'observed');
CREATE TABLE identity (
    id TEXT PRIMARY KEY,
    layer TEXT NOT NULL,
    key TEXT NOT NULL,
    content TEXT NOT NULL,
    version TEXT DEFAULT '1.0.0',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT,
    UNIQUE(layer, key)
);
CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE attachments (
            id TEXT PRIMARY KEY,
            journey_id TEXT NOT NULL,
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
CREATE TABLE tasks (
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
            metadata TEXT
        , scheduled_at TEXT, time_hint TEXT);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_memories_journey ON memories(journey);
CREATE INDEX idx_tasks_journey ON tasks(journey);
CREATE INDEX idx_attachments_journey ON attachments(journey_id);
CREATE UNIQUE INDEX idx_attachments_journey_name
                ON attachments(journey_id, name);
CREATE TABLE llm_calls (
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
CREATE INDEX idx_llm_calls_conversation ON llm_calls(conversation_id);
CREATE INDEX idx_llm_calls_role ON llm_calls(role);
CREATE INDEX idx_llm_calls_called_at ON llm_calls(called_at);
CREATE TABLE identity_descriptors (
            layer        TEXT NOT NULL,
            key          TEXT NOT NULL,
            descriptor   TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            PRIMARY KEY (layer, key)
        );
CREATE VIRTUAL TABLE memories_fts USING fts5(
            title,
            content,
            context,
            content=memories,
            content_rowid=rowid
        );
CREATE TRIGGER memories_fts_ai AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(rowid, title, content, context)
            VALUES (NEW.rowid, NEW.title, NEW.content, COALESCE(NEW.context, ''));
        END;
CREATE TRIGGER memories_fts_ad AFTER DELETE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, title, content, context)
            VALUES ('delete', OLD.rowid, OLD.title, OLD.content, COALESCE(OLD.context, ''));
        END;
CREATE TRIGGER memories_fts_au AFTER UPDATE ON memories BEGIN
            INSERT INTO memories_fts(memories_fts, rowid, title, content, context)
            VALUES ('delete', OLD.rowid, OLD.title, OLD.content, COALESCE(OLD.context, ''));
            INSERT INTO memories_fts(rowid, title, content, context)
            VALUES (NEW.rowid, NEW.title, NEW.content, COALESCE(NEW.context, ''));
        END;
CREATE TABLE consolidations (
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
CREATE INDEX idx_consolidations_status ON consolidations(status);
CREATE INDEX idx_consolidations_created ON consolidations(created_at);
CREATE TABLE operation_runs (
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
CREATE INDEX idx_operation_runs_operation
            ON operation_runs(operation_id);
CREATE INDEX idx_operation_runs_started
            ON operation_runs(started_at);
CREATE INDEX idx_operation_runs_status
            ON operation_runs(status);
CREATE TABLE operation_run_events (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES operation_runs(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL,
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            details_json TEXT,
            created_at TEXT NOT NULL
        );
CREATE INDEX idx_operation_run_events_run
            ON operation_run_events(run_id, sequence);
CREATE TABLE exploratory_stories (
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
CREATE INDEX idx_exploratory_stories_journey
            ON exploratory_stories(journey, updated_at);
CREATE INDEX idx_exploratory_stories_status
            ON exploratory_stories(status);
CREATE UNIQUE INDEX idx_exploratory_stories_one_active_per_journey
            ON exploratory_stories(journey)
            WHERE status = 'active';
CREATE TABLE identity_integrations (
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
CREATE INDEX idx_identity_integrations_target
            ON identity_integrations(layer, key, created_at);
CREATE INDEX idx_identity_integrations_status
            ON identity_integrations(status);
CREATE TABLE builder_refinement_stories (
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
CREATE INDEX idx_builder_refinement_stories_journey_status
        ON builder_refinement_stories(journey, status, position, updated_at);
CREATE TABLE builder_change_requests (
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
CREATE INDEX idx_builder_change_requests_story_status
        ON builder_change_requests(journey, refinement_story_id, status, position, updated_at);
CREATE INDEX idx_builder_change_requests_journey_status
        ON builder_change_requests(journey, status, updated_at);
CREATE TABLE builder_refinement_cursors (
        journey TEXT PRIMARY KEY,
        active_refinement_story_id TEXT REFERENCES builder_refinement_stories(id),
        active_change_request_id TEXT REFERENCES builder_change_requests(id),
        last_refinement_event TEXT,
        updated_at TEXT NOT NULL
    );
INSERT INTO "conversations" ("id", "title", "started_at", "ended_at", "interface", "persona", "journey", "summary", "tags", "metadata") VALUES ('conv-legacy-1', 'Legacy Conversation', '2025-01-10T09:00:00Z', NULL, 'cli', 'engineer', 'genesis-project', NULL, NULL, NULL);
INSERT INTO "memories" ("id", "conversation_id", "memory_type", "layer", "title", "content", "context", "journey", "persona", "tags", "created_at", "relevance_score", "embedding", "metadata", "last_accessed_at", "use_count", "readiness_state") VALUES ('mem-legacy-1', 'conv-legacy-1', 'decision', 'ego', 'Legacy Decision', 'Keep the legacy content intact through every migration.', 'legacy-context', 'genesis-project', NULL, NULL, '2025-01-10T09:05:00Z', 1.0, NULL, NULL, NULL, 0, 'observed');
INSERT INTO "identity" ("id", "layer", "key", "content", "version", "created_at", "updated_at", "metadata") VALUES ('ident-legacy-1', 'journey', 'genesis-project', '# Legacy Project Identity', '1.0.0', '2025-01-10T09:10:00Z', '2025-01-10T09:10:00Z', NULL);
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('001_project_to_travessia', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('002_create_attachments', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('003_create_tasks', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('004_tasks_temporal_fields', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('005_travessia_to_journey', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('006_create_llm_calls', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('007_create_identity_descriptors', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('008_create_memories_fts', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('009_memories_reinforcement_columns', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('010_create_consolidations', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('011_create_operation_runs', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('012_create_operation_run_events', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('013_create_exploratory_stories', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('014_create_identity_integrations', '2026-01-01T00:00:00.000000Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('015_create_builder_workbench', '2026-01-01T00:00:00.000000Z');
INSERT INTO "attachments" ("id", "journey_id", "name", "description", "content", "content_type", "tags", "embedding", "created_at", "updated_at", "metadata") VALUES ('att-legacy-1', 'genesis-project', 'legacy-plan.md', NULL, 'Legacy plan content.', 'markdown', NULL, NULL, '2025-01-10T09:15:00Z', '2025-01-10T09:15:00Z', NULL);
INSERT INTO "tasks" ("id", "journey", "title", "status", "due_date", "stage", "context", "source", "created_at", "updated_at", "completed_at", "metadata", "scheduled_at", "time_hint") VALUES ('task-legacy-1', 'genesis-project', 'Legacy task', 'todo', NULL, NULL, NULL, 'manual', '2025-01-10T09:20:00Z', '2025-01-10T09:20:00Z', NULL, NULL, NULL, NULL);
INSERT INTO "memories_fts" ("title", "content", "context") VALUES ('Legacy Decision', 'Keep the legacy content intact through every migration.', 'legacy-context');
INSERT INTO "builder_refinement_stories" ("id", "journey", "title", "description", "status", "position", "source", "provenance", "created_at", "updated_at", "pulled_at", "closed_at") VALUES ('rs-alpha-1', 'alpha-journey', 'Alpha refinement one', NULL, 'draft', 0, 'manual', NULL, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z', NULL, NULL);
INSERT INTO "builder_refinement_stories" ("id", "journey", "title", "description", "status", "position", "source", "provenance", "created_at", "updated_at", "pulled_at", "closed_at") VALUES ('rs-alpha-2', 'alpha-journey', 'Alpha refinement two', NULL, 'draft', 1, 'manual', NULL, '2026-01-02T00:00:01Z', '2026-01-02T00:00:01Z', NULL, NULL);
INSERT INTO "builder_refinement_stories" ("id", "journey", "title", "description", "status", "position", "source", "provenance", "created_at", "updated_at", "pulled_at", "closed_at") VALUES ('rs-beta-1', 'beta-journey', 'Beta refinement one', NULL, 'draft', 0, 'manual', NULL, '2026-01-02T00:00:02Z', '2026-01-02T00:00:02Z', NULL, NULL);
INSERT INTO "builder_change_requests" ("id", "journey", "refinement_story_id", "title", "body", "status", "position", "source", "provenance", "outcome_notes", "created_at", "updated_at", "completed_at") VALUES ('cr-alpha-1', 'alpha-journey', 'rs-alpha-1', 'Alpha change one', 'Body a1', 'captured', 0, 'manual', NULL, NULL, '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z', NULL);
INSERT INTO "builder_change_requests" ("id", "journey", "refinement_story_id", "title", "body", "status", "position", "source", "provenance", "outcome_notes", "created_at", "updated_at", "completed_at") VALUES ('cr-alpha-2', 'alpha-journey', 'rs-alpha-1', 'Alpha change two', 'Body a2', 'captured', 1, 'manual', NULL, NULL, '2026-01-03T00:00:01Z', '2026-01-03T00:00:01Z', NULL);
INSERT INTO "builder_change_requests" ("id", "journey", "refinement_story_id", "title", "body", "status", "position", "source", "provenance", "outcome_notes", "created_at", "updated_at", "completed_at") VALUES ('cr-beta-1', 'beta-journey', 'rs-beta-1', 'Beta change one', 'Body b1', 'captured', 0, 'manual', NULL, NULL, '2026-01-03T00:00:02Z', '2026-01-03T00:00:02Z', NULL);
PRAGMA foreign_keys=ON;