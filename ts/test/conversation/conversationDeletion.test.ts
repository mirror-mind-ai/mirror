// CR154 (review findings D1 and E2): one deletion for a conversation, shared by
// `discard-current` and the removal of imported Pi conversations.
//
// Six tables reference a conversation. The deletion deletes what is only the
// conversation's own -- its messages and its embedding -- and unlinks what
// outlives it: memories, provider-call records, the session binding, identity
// integrations. Foreign keys are on, so a table the deletion forgets makes the
// conversation undeletable: `discard-current` failed on any conversation a Soul
// Mode integration names, with `FOREIGN KEY constraint failed`.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CONVERSATION_REFERENCES, deleteConversation } from "#conversation/conversationDeletion.ts";
import { discardCurrentConversation, logUserMessage } from "#conversation/logger.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { SqlValue, WritableDatabase } from "#db/database.ts";

const NOW = "2026-10-21T12:00:00.000Z";

function freshDb(): WritableDatabase {
  return bootstrapDatabase(join(mkdtempSync("/tmp/conversation-deletion-"), "memory.db"));
}

function count(db: WritableDatabase, sql: string, ...params: SqlValue[]): number {
  return Number((db.prepare(sql).get(...params) as { n: number }).n);
}

/** A conversation every referencing table names. */
function seedEverywhere(db: WritableDatabase, id: string): void {
  db.prepare(
    "INSERT INTO conversations (id, started_at, ended_at, interface) VALUES (?, ?, ?, 'pi')",
  ).run(id, NOW, NOW);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', 'hi', ?)",
  ).run(`${id}-message`, id, NOW);
  db.prepare(
    "INSERT INTO conversation_embeddings (conversation_id, summary_embedding) VALUES (?, NULL)",
  ).run(id);
  db.prepare(
    "INSERT INTO memories (id, conversation_id, memory_type, title, content, created_at) VALUES (?, ?, 'insight', 't', 'c', ?)",
  ).run(`${id}-memory`, id, NOW);
  db.prepare(
    "INSERT INTO llm_calls (id, role, model, prompt, response, conversation_id, called_at) VALUES (?, 'conversation_title', 'm', 'p', 'r', ?, ?)",
  ).run(`${id}-call`, id, NOW);
  db.prepare(
    "INSERT INTO runtime_sessions (session_id, conversation_id, interface, started_at, updated_at) VALUES (?, ?, 'pi', ?, ?)",
  ).run(`/sessions/${id}.jsonl`, id, NOW, NOW);
  db.prepare(
    "INSERT INTO identity_integrations (id, layer, key, content, conversation_id, created_at) VALUES (?, 'self', 'soul', 'x', ?, ?)",
  ).run(`${id}-integration`, id, NOW);
}

test("the deletion handles every table whose foreign key names a conversation", () => {
  // A table added later that references a conversation fails this test until
  // the deletion decides what to do with it: delete it with the conversation,
  // or unlink it. That decision is the point; this test only forces it.
  const db = freshDb();
  const referencing = db
    .prepare(
      `SELECT DISTINCT m.name AS name
         FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f
        WHERE m.type = 'table' AND f."table" = 'conversations'
        ORDER BY m.name`,
    )
    .all()
    .map((row) => String(row.name));
  const handled = [...CONVERSATION_REFERENCES.deleted, ...CONVERSATION_REFERENCES.unlinked].sort();
  assert.deepEqual(referencing, handled);
  db.close();
});

test("a conversation every referencing table names is deleted, under foreign keys", () => {
  const db = freshDb();
  seedEverywhere(db, "gone");
  seedEverywhere(db, "kept");

  deleteConversation(db, "gone");

  assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations WHERE id = 'gone'"), 0);
  // Its own: deleted.
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM messages WHERE id = 'gone-message'"), 0);
  assert.equal(
    count(db, "SELECT COUNT(*) AS n FROM conversation_embeddings WHERE conversation_id = 'gone'"),
    0,
  );
  // What outlives it: kept, unlinked.
  for (const [table, key, id] of [
    ["memories", "id", "gone-memory"],
    ["llm_calls", "id", "gone-call"],
    ["runtime_sessions", "session_id", "/sessions/gone.jsonl"],
    ["identity_integrations", "id", "gone-integration"],
  ] as const) {
    const row = db.prepare(`SELECT conversation_id FROM ${table} WHERE ${key} = ?`).get(id);
    assert.ok(row, `${table} row kept`);
    assert.equal(row.conversation_id, null, `${table} row unlinked`);
  }
  // Another conversation: untouched, every reference intact.
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM conversations WHERE id = 'kept'"), 1);
  for (const table of [
    "messages",
    "conversation_embeddings",
    "memories",
    "llm_calls",
    "runtime_sessions",
    "identity_integrations",
  ]) {
    assert.equal(
      count(db, `SELECT COUNT(*) AS n FROM ${table} WHERE conversation_id = 'kept'`),
      1,
      table,
    );
  }
  db.close();
});

test("discard-current deletes a conversation a Soul Mode integration names", () => {
  const db = freshDb();
  let counter = 0;
  const deps = { newId: () => `id${++counter}`, nowIso: () => NOW };
  logUserMessage(db, "session-1", "hello", { interface: "pi" }, deps);
  const conversationId = String(
    db.prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = 'session-1'").get()
      ?.conversation_id,
  );
  db.prepare(
    "INSERT INTO identity_integrations (id, layer, key, content, conversation_id, created_at) VALUES ('integration-1', 'self', 'soul', 'x', ?, ?)",
  ).run(conversationId, NOW);

  assert.equal(
    discardCurrentConversation(db, "session-1", { interface: "pi" }, deps),
    conversationId,
  );
  assert.equal(
    count(db, "SELECT COUNT(*) AS n FROM conversations WHERE id = ?", conversationId),
    0,
  );
  const integration = db
    .prepare("SELECT conversation_id FROM identity_integrations WHERE id = 'integration-1'")
    .get();
  assert.equal(integration?.conversation_id, null);
  db.close();
});
