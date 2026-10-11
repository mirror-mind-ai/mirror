
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

INSERT INTO conversations (id, title, started_at, interface, persona, project)
VALUES ('conv-legacy-1', 'Legacy Conversation', '2025-01-10T09:00:00Z', 'cli', 'engineer', 'genesis-project');

INSERT INTO memories (id, conversation_id, memory_type, layer, title, content, context, project, created_at)
VALUES ('mem-legacy-1', 'conv-legacy-1', 'decision', 'ego', 'Legacy Decision', 'Keep the legacy content intact through every migration.', 'legacy-context', 'genesis-project', '2025-01-10T09:05:00Z');

INSERT INTO identity (id, layer, key, content, created_at, updated_at)
VALUES ('ident-legacy-1', 'project', 'genesis-project', '# Legacy Project Identity', '2025-01-10T09:10:00Z', '2025-01-10T09:10:00Z');
