"""SQLite schema definition for the memory database."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
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

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    token_count INTEGER,
    metadata TEXT
);

CREATE TABLE IF NOT EXISTS memories (
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

CREATE TABLE IF NOT EXISTS conversation_embeddings (
    conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
    summary_embedding BLOB
);

CREATE TABLE IF NOT EXISTS runtime_sessions (
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

CREATE INDEX IF NOT EXISTS idx_runtime_sessions_conversation ON runtime_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_active ON runtime_sessions(active);

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

CREATE TABLE IF NOT EXISTS memory_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id TEXT NOT NULL REFERENCES memories(id),
    accessed_at TEXT NOT NULL,
    access_context TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
CREATE INDEX IF NOT EXISTS idx_memories_journey ON memories(journey);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_access_log_memory ON memory_access_log(memory_id);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    journey TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    due_date TEXT,
    scheduled_at TEXT,
    time_hint TEXT,
    stage TEXT,
    context TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_journey ON tasks(journey);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

CREATE TABLE IF NOT EXISTS identity (
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

CREATE TABLE IF NOT EXISTS attachments (
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

CREATE INDEX IF NOT EXISTS idx_attachments_journey ON attachments(journey_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_journey_name ON attachments(journey_id, name);

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

CREATE TABLE IF NOT EXISTS identity_descriptors (
    layer        TEXT NOT NULL,
    key          TEXT NOT NULL,
    descriptor   TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    PRIMARY KEY (layer, key)
);

CREATE TABLE IF NOT EXISTS consolidations (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,            -- 'merge' | 'identity_update' | 'shadow_candidate'
    proposal TEXT NOT NULL,          -- LLM-generated proposal (full markdown text)
    result TEXT,                     -- content actually written (accepted as-is or user-edited)
    source_memory_ids TEXT NOT NULL, -- JSON array of Memory.id values
    target_layer TEXT,               -- 'ego', 'self', 'shadow' (for identity_update)
    target_key TEXT,                 -- 'behavior', 'soul', etc. (for identity_update)
    rationale TEXT,                  -- one-sentence LLM rationale for the chosen action
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected'
    created_at TEXT NOT NULL,
    reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_consolidations_status ON consolidations(status);
CREATE INDEX IF NOT EXISTS idx_consolidations_created ON consolidations(created_at);

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

CREATE INDEX IF NOT EXISTS idx_operation_runs_operation ON operation_runs(operation_id);
CREATE INDEX IF NOT EXISTS idx_operation_runs_started ON operation_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_operation_runs_status ON operation_runs(status);

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

-- Extension subsystem bookkeeping.
--
-- _ext_migrations tracks which SQL migration files have been applied per
-- extension. The checksum guards against in-place edits to an applied
-- migration: the runner refuses to skip or replay a file whose contents
-- changed since it was first applied.
--
-- _ext_bindings maps an extension's capabilities to integration targets
-- (typically a persona). The Mirror Mode context dispatcher reads this
-- table after persona resolution to decide which extension providers to
-- invoke. See docs/product/extensions/binding-model.md.
CREATE TABLE IF NOT EXISTS _ext_migrations (
    extension_id TEXT NOT NULL,
    filename     TEXT NOT NULL,
    checksum     TEXT NOT NULL,
    applied_at   TEXT NOT NULL,
    PRIMARY KEY (extension_id, filename)
);

CREATE TABLE IF NOT EXISTS _ext_bindings (
    extension_id  TEXT NOT NULL,
    capability_id TEXT NOT NULL,
    target_kind   TEXT NOT NULL,    -- 'persona' | 'journey' | 'global'
    target_id     TEXT,             -- NULL only when target_kind = 'global'
    created_at    TEXT NOT NULL,
    PRIMARY KEY (extension_id, capability_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_bindings_target
    ON _ext_bindings(target_kind, target_id);
"""
