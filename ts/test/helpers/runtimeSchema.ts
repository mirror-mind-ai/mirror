import type { WritableDatabase } from "#db/database.ts";

export function createRuntimeTables(db: WritableDatabase): void {
  db.exec(`
    CREATE TABLE runtime_sessions (
      session_id TEXT PRIMARY KEY,
      conversation_id TEXT,
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
  `);
}
