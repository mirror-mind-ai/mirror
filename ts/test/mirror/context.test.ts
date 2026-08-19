import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { loadMirrorContext } from "#mirror/context.ts";

function fixture() {
  const dir = mkdtempSync("/tmp/mirror-context-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  db.exec(`CREATE TABLE attachments (
    id TEXT PRIMARY KEY, journey_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
    content TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'markdown', tags TEXT,
    embedding BLOB, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, metadata TEXT
  )`);
  const insert = db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, 't', 't')",
  );
  let id = 0;
  for (const [layer, key, content] of [
    ["ego", "constraints", "Never invent"],
    ["self", "soul", "Soul"],
    ["ego", "behavior", "Behavior"],
    ["user", "identity", "User"],
    ["ego", "identity", "Ego"],
    ["persona", "engineer", "Engineer"],
    ["knowledge", "a", "Knowledge A"],
    ["journey", "parent", "Parent must not load"],
    ["journey", "selected", "Selected context"],
    ["journey", "child", "Child must not load"],
    ["shadow", "one", "Shadow pattern"],
  ] as const)
    insert.run(String(++id), layer, key, content);
  return db;
}

test("context preserves Python section order and selected-journey isolation", async () => {
  const db = fixture();
  const context = await loadMirrorContext(db, {
    persona: "engineer",
    journey: "selected",
    touchesIdentity: true,
    touchesShadow: true,
  });
  assert.equal(
    context,
    [
      "=== ⛔ HARD CONSTRAINTS ===\nNever invent",
      "=== self/soul ===\nSoul",
      "=== ego/behavior ===\nBehavior",
      "=== user/identity ===\nUser",
      "=== ego/identity ===\nEgo",
      "=== persona/engineer ===\nEngineer",
      "=== knowledge/a ===\nKnowledge A",
      "=== journey/selected ===\nSelected context",
      "=== shadow/profile ===\n[Confirmed shadow patterns — grounded in evidence across multiple conversations]\n\nShadow pattern",
    ].join("\n\n"),
  );
  assert.doesNotMatch(context, /Parent must not load|Child must not load/);
  db.close();
});

test("extension context is appended after every core and attachment section", async () => {
  const db = fixture();
  const context = await loadMirrorContext(db, {
    persona: "engineer",
    journey: "child",
    extensionContext: "=== extension/hello/greeting ===\nLatest ping",
  });
  assert.match(
    context,
    /=== journey\/child ===[\s\S]*=== extension\/hello\/greeting ===\nLatest ping$/,
  );
  db.close();
});

test("identity and shadow layers are conservatively omitted", async () => {
  const db = fixture();
  const context = await loadMirrorContext(db, { touchesIdentity: false, touchesShadow: false });
  assert.doesNotMatch(context, /self\/soul|ego\/identity|shadow\/profile/);
  assert.match(context, /ego\/behavior/);
  db.close();
});

test("attachment context uses replayed semantic score and selected journey only", async () => {
  const db = fixture();
  const embedding = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));
  const vector = Buffer.from(new Float32Array(embedding).buffer);
  db.prepare(
    `INSERT INTO attachments
      (id, journey_id, name, description, content, embedding, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("a1", "selected", "plan.md", "The plan", "Selected attachment", vector, "t1", "t1");
  db.prepare(
    `INSERT INTO attachments
      (id, journey_id, name, description, content, embedding, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("a2", "parent", "parent.md", null, "Parent attachment", vector, "t2", "t2");
  const context = await loadMirrorContext(db, {
    journey: "selected",
    query: "plan",
    embeddingProvider: { embed: async () => embedding },
  });
  assert.match(context, /plan\.md \(score: 1\.000\)/);
  assert.match(context, /Selected attachment/);
  assert.doesNotMatch(context, /Parent attachment/);
  db.close();
});
