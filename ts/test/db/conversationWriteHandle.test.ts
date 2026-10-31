// CV24.DS2 — the narrowed handle a host's Conversation writes go through.
//
// See the decision "A host's Conversation writes are narrowed, not
// snapshotted". The handle must refuse, before the driver sees it, every
// statement the four Conversation calls do not need, so that a host holding it
// cannot delete, alter or write elsewhere. These tests pin both lists.

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForConversationWrites, openDatabaseReadOnly } from "#db/database.ts";
import { tempDir } from "#helpers/tempDir.ts";

function home(): string {
  const dbPath = join(tempDir("mirror-conversation-handle-"), "memory.db");
  const db = bootstrapDatabase(dbPath);
  db.prepare(
    "INSERT INTO conversations (id, title, started_at, interface, journey) VALUES (?, ?, ?, ?, ?)",
  ).run("conv-handle-0001", "Kept", "2026-10-28T00:00:00Z", "test", "journey-one");
  db.close();
  return dbPath;
}

const ACCEPTED = [
  "SELECT id FROM conversations WHERE id = ?",
  "  select   journey\n FROM conversations WHERE id = ?  ;",
  "INSERT INTO messages (id, conversation_id, role, content, created_at, token_count, metadata) VALUES (?, ?, ?, ?, ?, NULL, ?)",
  "INSERT INTO conversations\n (id, title, started_at, ended_at, interface, persona, journey, summary, tags, metadata)\n VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL)",
  "INSERT INTO runtime_sessions (session_id, conversation_id) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET conversation_id = excluded.conversation_id",
  "UPDATE conversations SET title = ? WHERE id = ?",
  "UPDATE conversations SET title = ?, metadata = ? WHERE id = ?",
  "UPDATE conversations SET title = ?, journey = ?, interface = ? WHERE id = ?",
];

const REFUSED = [
  "DELETE FROM conversations WHERE id = ?",
  "DELETE FROM messages",
  "DROP TABLE conversations",
  "ALTER TABLE conversations ADD COLUMN x TEXT",
  "UPDATE conversations SET ended_at = ? WHERE id = ?",
  "UPDATE conversations SET title = ?, summary = ? WHERE id = ?",
  "UPDATE conversations SET title = ?",
  "UPDATE messages SET content = ? WHERE id = ?",
  "INSERT INTO identity (layer, key, content) VALUES (?, ?, ?)",
  "INSERT INTO memories (id) VALUES (?)",
  "INSERT OR REPLACE INTO conversations (id) VALUES (?)",
  "INSERT INTO messages (id) SELECT id FROM conversations",
  "SELECT 1; DELETE FROM conversations",
  "WITH x AS (SELECT 1) DELETE FROM conversations",
  "PRAGMA journal_mode=DELETE",
  "VACUUM",
];

test("the handle prepares exactly the statements the Conversation calls need", () => {
  const db = openDatabaseForConversationWrites(home());
  try {
    for (const sql of ACCEPTED) assert.doesNotThrow(() => db.prepare(sql), sql);
    for (const sql of REFUSED) {
      assert.throws(() => db.prepare(sql), /refused/, sql);
    }
  } finally {
    db.close();
  }
});

test("exec runs transaction control and nothing else", () => {
  const dbPath = home();
  const db = openDatabaseForConversationWrites(dbPath);
  try {
    db.exec("BEGIN IMMEDIATE");
    db.exec("ROLLBACK");
    db.exec("BEGIN IMMEDIATE");
    db.exec("COMMIT");
    for (const sql of [
      "DELETE FROM conversations",
      "DROP TABLE messages",
      "BEGIN; DELETE FROM conversations",
      "VACUUM",
    ]) {
      assert.throws(() => db.exec(sql), /refused/, sql);
    }
  } finally {
    db.close();
  }
  const reader = openDatabaseReadOnly(dbPath);
  try {
    assert.equal(
      (reader.prepare("SELECT count(*) AS n FROM conversations").get() as { n: number }).n,
      1,
    );
  } finally {
    reader.close();
  }
});

test("an accepted write lands, and a refused one never reaches the driver", () => {
  const dbPath = home();
  const db = openDatabaseForConversationWrites(dbPath);
  try {
    db.prepare("UPDATE conversations SET title = ? WHERE id = ?").run(
      "Renamed",
      "conv-handle-0001",
    );
    assert.throws(() => db.prepare("DELETE FROM conversations WHERE id = ?"), /refused/);
  } finally {
    db.close();
  }
  const reader = openDatabaseReadOnly(dbPath);
  try {
    assert.deepEqual(
      { ...reader.prepare("SELECT id, title FROM conversations").get() },
      { id: "conv-handle-0001", title: "Renamed" },
    );
  } finally {
    reader.close();
  }
});
