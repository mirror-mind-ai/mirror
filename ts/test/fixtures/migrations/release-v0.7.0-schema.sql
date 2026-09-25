-- A Mirror Mind database as release v0.7.0 created it (2026-04-30): the last
-- release before `_ext_migrations` and `_ext_bindings` joined the bootstrap
-- schema, in v0.8.0.
--
-- Recorded 2026-09-25, at CV22.DS10.TS5's handoff review (finding B1), from
-- `get_connection` in `src/memory/db/connection.py` at tag `v0.7.0`, run
-- against a missing file: that release's migrations, then its bootstrap
-- schema. Schema and migration ledger only -- no rows. Each object is written
-- as `sqlite_master` holds it, in creation order. FTS5 shadow tables and
-- SQLite's own objects are left out, because `CREATE VIRTUAL TABLE` and SQLite
-- recreate them. The ledger's `applied_at` values are normalized to the
-- release date.
--
-- Loaded into an empty file, its canonical inventory (`buildSchemaInventory`)
-- equals the recorded database's. It is an oracle recording, frozen like the
-- others (ts/test/goldens/README.md).

CREATE TABLE _migrations (
            id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );

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

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    token_count INTEGER,
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
    metadata TEXT,
    last_accessed_at TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    readiness_state TEXT NOT NULL DEFAULT 'observed'
);

CREATE TABLE conversation_embeddings (
    conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
    summary_embedding BLOB
);

CREATE TABLE runtime_sessions (
    session_id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    interface TEXT,
    mirror_active INTEGER NOT NULL DEFAULT 0,
    persona TEXT,
    journey TEXT,
    hook_injected INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT,
    metadata TEXT
);

CREATE INDEX idx_runtime_sessions_conversation ON runtime_sessions(conversation_id);

CREATE INDEX idx_runtime_sessions_active ON runtime_sessions(active);

CREATE TABLE memory_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id TEXT NOT NULL REFERENCES memories(id),
    accessed_at TEXT NOT NULL,
    access_context TEXT
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);

CREATE INDEX idx_memories_type ON memories(memory_type);

CREATE INDEX idx_memories_layer ON memories(layer);

CREATE INDEX idx_memories_journey ON memories(journey);

CREATE INDEX idx_memories_created ON memories(created_at);

CREATE INDEX idx_access_log_memory ON memory_access_log(memory_id);

CREATE TABLE identity (
    id TEXT PRIMARY KEY,
    layer TEXT NOT NULL,              -- 'self', 'ego', 'user', 'organization', 'persona', 'journey', 'journey_path'
    key TEXT NOT NULL,                -- 'soul', 'behavior', 'identity', 'principles', ou persona_id
    content TEXT NOT NULL,            -- conteúdo do prompt (markdown/texto)
    version TEXT DEFAULT '1.0.0',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT,
    UNIQUE(layer, key)
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

INSERT INTO "_migrations" ("id", "applied_at") VALUES ('001_project_to_travessia', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('002_create_attachments', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('003_create_tasks', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('004_tasks_temporal_fields', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('005_travessia_to_journey', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('006_create_llm_calls', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('007_create_identity_descriptors', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('008_create_memories_fts', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('009_memories_reinforcement_columns', '2026-04-30T00:00:00Z');
INSERT INTO "_migrations" ("id", "applied_at") VALUES ('010_create_consolidations', '2026-04-30T00:00:00Z');
