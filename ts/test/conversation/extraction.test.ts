import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { runConversationExtraction } from "../../src/conversation/extraction.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { ReplayEmbeddingProvider } from "../../src/providers/embedding.ts";
import type { LlmProvider } from "../../src/providers/llm.ts";
import { ReplayLlmProvider } from "../../src/providers/llm.ts";

/** Mirrors the FailingEmbeddingProvider pattern from CR037, applied to
 * LlmProvider -- deterministic proof of the llm_failed path without a live
 * network dependency. */
class FailingLlmProvider implements LlmProvider {
  async complete(): Promise<never> {
    throw new Error("llm provider unreachable");
  }
}

function metadataOf(db: WritableDatabase, conversationId: string): Record<string, unknown> {
  const raw = db
    .prepare("SELECT metadata FROM conversations WHERE id = ?")
    .get(conversationId)?.metadata;
  return raw ? JSON.parse(String(raw)) : {};
}

const TMP_DIR = join(process.cwd(), "tmp", "test-conversation-extraction");

test("runConversationExtraction enforces journey and message-count guards", async () => {
  const { db, path } = await makeDb("guards.db");
  try {
    insertConversation(db, { id: "c1", journey: null });
    insertMessage(db, "c1", "user", "one", 1);
    insertMessage(db, "c1", "assistant", "two", 2);
    insertMessage(db, "c1", "user", "three", 3);
    insertMessage(db, "c1", "assistant", "four", 4);

    const result = await runConversationExtraction(db, "c1", providers());

    assert.deepEqual(result, { memoryIds: [], taskIds: [], extracted: 0 });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM memories").get()?.count, 0);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("runConversationExtraction persists replayed memories, tasks, summary, embeddings, and metadata", async () => {
  const { db, path } = await makeDb("extract.db");
  try {
    insertConversation(db, {
      id: "c1",
      journey: "cv22",
      persona: "builder",
      metadata: '{"kept":true}',
    });
    insertIdentity(db, "You are talking to Alisson today.");
    insertMessage(db, "c1", "user", "We decided to port extraction.", 1);
    insertMessage(db, "c1", "assistant", "I will keep it replay-safe.", 2);
    insertMessage(db, "c1", "user", "Also remember the validation task.", 3);
    insertMessage(db, "c1", "assistant", "Done.", 4);
    insertTask(db, { id: "existing-task", title: "Existing", journey: "cv22" });

    const result = await runConversationExtraction(db, "c1", {
      ...providers(),
      now: fixedNow,
      id: idSequence(["t1", "m1", "m2"]),
    });

    assert.deepEqual(result, { memoryIds: ["m1", "m2"], taskIds: ["t1"], extracted: 2 });
    const memories = db
      .prepare("SELECT id, title, journey, persona, tags, embedding FROM memories ORDER BY id")
      .all();
    assert.equal(memories.length, 2);
    assert.deepEqual(
      memories.map((row) => ({
        id: row.id,
        title: row.title,
        journey: row.journey,
        persona: row.persona,
        tags: row.tags,
        hasEmbedding: row.embedding instanceof Uint8Array,
      })),
      [
        {
          id: "m1",
          title: "Extraction decision",
          journey: "cv22",
          persona: "builder",
          tags: '["ts"]',
          hasEmbedding: true,
        },
        {
          id: "m2",
          title: "Explicit journey",
          journey: "manual",
          persona: "builder",
          tags: null,
          hasEmbedding: true,
        },
      ],
    );
    const tasks = db.prepare("SELECT id, title, journey, source FROM tasks ORDER BY id").all();
    assert.deepEqual(tasks, [
      { id: "existing-task", title: "Existing", journey: "cv22", source: "conversation" },
      { id: "t1", title: "Validate extraction", journey: "cv22", source: "conversation" },
    ]);
    assert.equal(
      db.prepare("SELECT summary FROM conversations WHERE id = ?").get("c1")?.summary,
      "Synthetic summary.",
    );
    assert.ok(
      db
        .prepare("SELECT summary_embedding FROM conversation_embeddings WHERE conversation_id = ?")
        .get("c1")?.summary_embedding instanceof Uint8Array,
    );
    assert.deepEqual(metadataOf(db, "c1"), {
      kept: true,
      extracted: true,
      extraction_status: "ok",
    });
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("runConversationExtraction records extraction_status: no_signal when the LLM returns no memories (AI-10)", async () => {
  const { db, path } = await makeDb("status-no-signal.db");
  try {
    insertConversation(db, { id: "c1", journey: "cv22" });
    for (let i = 1; i <= 4; i += 1)
      insertMessage(db, "c1", i % 2 ? "user" : "assistant", `m${i}`, i);
    const llm = new ReplayLlmProvider({
      kind: "llm",
      responses: { extraction: "[]", task_extraction: "[]", summary: "Summary" },
    });

    const result = await runConversationExtraction(db, "c1", {
      llm,
      embeddings: new ReplayEmbeddingProvider({
        kind: "embedding",
        response: { embedding: [1, 0] },
      }),
      now: fixedNow,
      id: idSequence([]),
    });

    assert.deepEqual(result.memoryIds, []);
    assert.deepEqual(metadataOf(db, "c1"), { extracted: true, extraction_status: "no_signal" });
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("runConversationExtraction records extraction_status: parse_failed for a non-array LLM response (AI-10)", async () => {
  const { db, path } = await makeDb("status-parse-failed.db");
  try {
    insertConversation(db, { id: "c1", journey: "cv22" });
    for (let i = 1; i <= 4; i += 1)
      insertMessage(db, "c1", i % 2 ? "user" : "assistant", `m${i}`, i);
    const llm = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        extraction: '{"not":"a list"}',
        task_extraction: "[]",
        summary: "Summary",
      },
    });

    const result = await runConversationExtraction(db, "c1", {
      llm,
      embeddings: new ReplayEmbeddingProvider({
        kind: "embedding",
        response: { embedding: [1, 0] },
      }),
      now: fixedNow,
      id: idSequence([]),
    });

    assert.deepEqual(result.memoryIds, []);
    assert.deepEqual(metadataOf(db, "c1"), { extracted: true, extraction_status: "parse_failed" });
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("runConversationExtraction records extraction_dropped only when sanitize actually drops something (AI-10)", async () => {
  const { db, path } = await makeDb("status-dropped.db");
  try {
    insertConversation(db, { id: "c1", journey: "cv22" });
    for (let i = 1; i <= 4; i += 1)
      insertMessage(db, "c1", i % 2 ? "user" : "assistant", `m${i}`, i);
    const llm = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        extraction: JSON.stringify([
          { title: "Keep", content: "Content", memory_type: "insight", layer: "ego" },
          { title: "Bad", content: "Content", memory_type: "insight", layer: "banana" },
        ]),
        task_extraction: "[]",
        summary: "Summary",
      },
    });

    const result = await runConversationExtraction(db, "c1", {
      llm,
      embeddings: new ReplayEmbeddingProvider({
        kind: "embedding",
        response: { embedding: [1, 0] },
      }),
      now: fixedNow,
      id: idSequence(["m1"]),
    });

    assert.deepEqual(result.memoryIds, ["m1"]);
    assert.deepEqual(metadataOf(db, "c1"), {
      extracted: true,
      extraction_status: "ok",
      extraction_dropped: { invalidLayer: 1, invalidType: 0, overCap: 0 },
    });
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("runConversationExtraction records extraction_status: llm_failed and still throws when the LLM call fails (AI-10)", async () => {
  const { db, path } = await makeDb("status-llm-failed.db");
  try {
    insertConversation(db, { id: "c1", journey: "cv22", metadata: '{"kept":true}' });
    for (let i = 1; i <= 4; i += 1)
      insertMessage(db, "c1", i % 2 ? "user" : "assistant", `m${i}`, i);

    await assert.rejects(
      runConversationExtraction(db, "c1", {
        llm: new FailingLlmProvider(),
        embeddings: new ReplayEmbeddingProvider({
          kind: "embedding",
          response: { embedding: [1, 0] },
        }),
        now: fixedNow,
      }),
      /llm provider unreachable/,
    );

    // Recorded, but NOT marked extracted -- a failed attempt is not "done"
    // (mirrors Python not setting meta["extracted"] on the exception path).
    assert.deepEqual(metadataOf(db, "c1"), { kept: true, extraction_status: "llm_failed" });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM memories").get()?.count, 0);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("two-pass curation can filter replayed candidate memories", async () => {
  const { db, path } = await makeDb("curation.db");
  try {
    insertConversation(db, { id: "c1", journey: "cv22" });
    for (let i = 1; i <= 4; i += 1)
      insertMessage(db, "c1", i % 2 ? "user" : "assistant", `m${i}`, i);
    const llm = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        extraction: JSON.stringify([
          { title: "Keep", content: "Content", memory_type: "insight" },
          { title: "Drop", content: "Duplicate", memory_type: "insight" },
        ]),
        curation: JSON.stringify([{ title: "Keep", content: "Content", memory_type: "insight" }]),
        task_extraction: "[]",
        summary: "Summary",
      },
    });

    const result = await runConversationExtraction(db, "c1", {
      llm,
      embeddings: new ReplayEmbeddingProvider({
        kind: "embedding",
        response: { embedding: [1, 0] },
      }),
      twoPass: true,
      curationExisting: [
        { title: "Old", content: "Duplicate", memory_type: "insight", layer: "ego" },
      ],
      now: fixedNow,
      id: idSequence(["m1"]),
    });

    assert.deepEqual(result.memoryIds, ["m1"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM memories").get()?.count, 1);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("task extraction failure does not block memory extraction", async () => {
  const { db, path } = await makeDb("task-failure.db");
  try {
    insertConversation(db, { id: "c1", journey: "cv22" });
    for (let i = 1; i <= 4; i += 1)
      insertMessage(db, "c1", i % 2 ? "user" : "assistant", `m${i}`, i);
    const llm = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        extraction: JSON.stringify([
          { title: "Memory", content: "Content", memory_type: "insight" },
        ]),
        summary: "Summary",
      },
    });

    const result = await runConversationExtraction(db, "c1", {
      llm,
      embeddings: new ReplayEmbeddingProvider({
        kind: "embedding",
        response: { embedding: [1, 0] },
      }),
      now: fixedNow,
      id: idSequence(["m1"]),
    });

    assert.deepEqual(result.memoryIds, ["m1"]);
    assert.deepEqual(result.taskIds, []);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

function providers() {
  return {
    llm: new ReplayLlmProvider({
      kind: "llm",
      responses: {
        extraction: JSON.stringify([
          {
            title: "Extraction decision",
            content: "Port safely",
            memory_type: "decision",
            tags: ["ts"],
          },
          { title: "bad" },
          {
            title: "Explicit journey",
            content: "Manual journey remains",
            memory_type: "insight",
            journey: "manual",
          },
        ]),
        task_extraction: JSON.stringify([
          { title: "Validate extraction", due_date: "2026-01-02" },
          { title: "Existing" },
        ]),
        summary: "Synthetic summary.",
      },
    }),
    embeddings: new ReplayEmbeddingProvider({
      kind: "embedding",
      response: { embedding: [1, 0, 0] },
    }),
  };
}

async function makeDb(name: string): Promise<{ db: WritableDatabase; path: string }> {
  await mkdir(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, name);
  await rm(path, { force: true });
  const db = openDatabaseCopyForWrite(path);
  db.exec(`
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
    CREATE TABLE tasks (
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
  `);
  return { db, path };
}

function insertConversation(
  db: WritableDatabase,
  input: { id: string; journey: string | null; persona?: string | null; metadata?: string | null },
): void {
  db.prepare(
    `INSERT INTO conversations (id, started_at, ended_at, interface, persona, journey, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:10:00Z",
    "pi",
    input.persona ?? null,
    input.journey,
    input.metadata ?? null,
  );
}

function insertMessage(
  db: WritableDatabase,
  conversationId: string,
  role: string,
  content: string,
  n: number,
): void {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(`msg-${n}`, conversationId, role, content, `2026-01-01T00:0${n}:00Z`);
}

function insertIdentity(db: WritableDatabase, content: string): void {
  db.prepare(
    `INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    "user-identity",
    "user",
    "identity",
    content,
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00Z",
  );
}

function insertTask(
  db: WritableDatabase,
  input: { id: string; title: string; journey: string },
): void {
  db.prepare(
    `INSERT INTO tasks (id, journey, title, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.id, input.journey, input.title, "todo", "conversation", fixedNow(), fixedNow());
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000000Z";
}

function idSequence(values: string[]): () => string {
  const remaining = [...values];
  return () => {
    const value = remaining.shift();
    if (!value) throw new Error("id sequence exhausted");
    return value;
  };
}
