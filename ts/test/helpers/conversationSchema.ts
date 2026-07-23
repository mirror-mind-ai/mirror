// Shared test schema helpers for `conversations` and `messages` (DS7.US1).
//
// The production shape is copy-pasted across test/conversation/extraction.test.ts
// today; this is the single source for new DS7.US1 tests (recall, conversations
// listing, journey status) so the schema can't drift between call sites.

import type { WritableDatabase } from "../../src/db/database.ts";

export const CONVERSATIONS_DDL =
  "CREATE TABLE conversations (id TEXT PRIMARY KEY, title TEXT, started_at TEXT NOT NULL, " +
  "ended_at TEXT, interface TEXT NOT NULL, persona TEXT, journey TEXT, summary TEXT, " +
  "tags TEXT, metadata TEXT)";

export const MESSAGES_DDL =
  "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL " +
  "REFERENCES conversations(id), role TEXT NOT NULL, content TEXT NOT NULL, " +
  "created_at TEXT NOT NULL, token_count INTEGER, metadata TEXT)";

/** Create `conversations` and `messages` on a writable test database. */
export function createConversationTables(db: WritableDatabase): void {
  db.exec(CONVERSATIONS_DDL);
  db.exec(MESSAGES_DDL);
}

export function insertConversation(
  db: WritableDatabase,
  input: {
    id: string;
    startedAt: string;
    title?: string | null;
    persona?: string | null;
    journey?: string | null;
    summary?: string | null;
  },
): void {
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, interface, persona, journey, summary) " +
      "VALUES (?, ?, ?, 'cli', ?, ?, ?)",
  ).run(
    input.id,
    input.title ?? null,
    input.startedAt,
    input.persona ?? null,
    input.journey ?? null,
    input.summary ?? null,
  );
}

export function insertMessage(
  db: WritableDatabase,
  input: { id: string; conversationId: string; role: string; content: string; createdAt: string },
): void {
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(input.id, input.conversationId, input.role, input.content, input.createdAt);
}
