PRAGMA foreign_keys=OFF;
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    interface TEXT NOT NULL,
    persona TEXT,
    project TEXT,
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
    project TEXT,
    persona TEXT,
    tags TEXT,
    created_at TEXT NOT NULL,
    relevance_score REAL DEFAULT 1.0,
    embedding BLOB,
    metadata TEXT
);
CREATE INDEX idx_memories_project ON memories(project);
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
INSERT INTO "conversations" ("id", "title", "started_at", "ended_at", "interface", "persona", "project", "summary", "tags", "metadata") VALUES ('conv-legacy-1', 'Legacy Conversation', '2025-01-10T09:00:00Z', NULL, 'cli', 'engineer', 'genesis-project', NULL, NULL, NULL);
INSERT INTO "memories" ("id", "conversation_id", "memory_type", "layer", "title", "content", "context", "project", "persona", "tags", "created_at", "relevance_score", "embedding", "metadata") VALUES ('mem-legacy-1', 'conv-legacy-1', 'decision', 'ego', 'Legacy Decision', 'Keep the legacy content intact through every migration.', 'legacy-context', 'genesis-project', NULL, NULL, '2025-01-10T09:05:00Z', 1.0, NULL, NULL);
INSERT INTO "identity" ("id", "layer", "key", "content", "version", "created_at", "updated_at", "metadata") VALUES ('ident-legacy-1', 'project', 'genesis-project', '# Legacy Project Identity', '1.0.0', '2025-01-10T09:10:00Z', '2025-01-10T09:10:00Z', NULL);
PRAGMA foreign_keys=ON;