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
);
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
INSERT INTO "conversations" ("id", "title", "started_at", "ended_at", "interface", "persona", "journey", "summary", "tags", "metadata") VALUES ('conv-legacy-1', 'Legacy Conversation', '2025-01-10T09:00:00Z', NULL, 'cli', 'engineer', 'genesis-project', NULL, NULL, NULL);
INSERT INTO "memories" ("id", "conversation_id", "memory_type", "layer", "title", "content", "context", "journey", "persona", "tags", "created_at", "relevance_score", "embedding", "metadata") VALUES ('mem-legacy-1', 'conv-legacy-1', 'decision', 'ego', 'Legacy Decision', 'Keep the legacy content intact through every migration.', 'legacy-context', 'genesis-project', NULL, NULL, '2025-01-10T09:05:00Z', 1.0, NULL, NULL);
INSERT INTO "identity" ("id", "layer", "key", "content", "version", "created_at", "updated_at", "metadata") VALUES ('ident-legacy-1', 'journey', 'genesis-project', '# Legacy Project Identity', '1.0.0', '2025-01-10T09:10:00Z', '2025-01-10T09:10:00Z', NULL);
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('001_project_to_travessia', '2026-07-21T12:07:40.930689Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('002_create_attachments', '2026-07-21T12:07:40.934903Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('003_create_tasks', '2026-07-21T12:07:40.939093Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('004_tasks_temporal_fields', '2026-07-21T12:07:40.943746Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('005_travessia_to_journey', '2026-07-21T12:07:40.948593Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('006_create_llm_calls', '2026-07-21T12:07:40.948667Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('007_create_identity_descriptors', '2026-07-21T12:07:40.948699Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('008_create_memories_fts', '2026-07-21T12:07:40.951827Z');
INSERT INTO "attachments" ("id", "journey_id", "name", "description", "content", "content_type", "tags", "embedding", "created_at", "updated_at", "metadata") VALUES ('att-legacy-1', 'genesis-project', 'legacy-plan.md', NULL, 'Legacy plan content.', 'markdown', NULL, NULL, '2025-01-10T09:15:00Z', '2025-01-10T09:15:00Z', NULL);
INSERT INTO "tasks" ("id", "journey", "title", "status", "due_date", "stage", "context", "source", "created_at", "updated_at", "completed_at", "metadata", "scheduled_at", "time_hint") VALUES ('task-legacy-1', 'genesis-project', 'Legacy task', 'todo', NULL, NULL, NULL, 'manual', '2025-01-10T09:20:00Z', '2025-01-10T09:20:00Z', NULL, NULL, NULL, NULL);
INSERT INTO "memories_fts" ("title", "content", "context") VALUES ('Legacy Decision', 'Keep the legacy content intact through every migration.', 'legacy-context');
PRAGMA foreign_keys=ON;