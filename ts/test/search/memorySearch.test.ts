import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { ReplayEmbeddingProvider } from "../../src/providers/embedding.ts";
import {
  accessCountsByMemoryId,
  ftsLexicalScores,
  ftsQuery,
  searchMemories,
} from "../../src/search/memorySearch.ts";

const TMP_DIR = join(process.cwd(), "tmp", "test-memory-search");

test("ftsQuery mirrors Python safe quoting", () => {
  assert.equal(ftsQuery('mirror "builder" ariad'), '"mirror" "builder" "ariad"');
  assert.equal(ftsQuery("   "), "");
});

test("accessCountsByMemoryId matches per-id COUNT semantics", async () => {
  const { db, path } = await makeDb("access-counts.db");
  try {
    insertMemory(db, {
      id: "m1",
      content: "alpha",
      embedding: [1, 0, 0],
      createdAt: "2026-01-02T00:00:00Z",
    });
    insertMemory(db, {
      id: "m2",
      content: "beta",
      embedding: [0, 1, 0],
      createdAt: "2026-01-01T00:00:00Z",
    });
    db.prepare(
      "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
    ).run("m1", "2026-01-03T00:00:00Z", "probe");
    db.prepare(
      "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
    ).run("m1", "2026-01-04T00:00:00Z", "probe");

    const grouped = accessCountsByMemoryId(db, ["m1", "m2"]);
    const perId = new Map(
      ["m1", "m2"].map((id) => [
        id,
        Number(
          db.prepare("SELECT COUNT(*) AS count FROM memory_access_log WHERE memory_id = ?").get(id)
            ?.count,
        ),
      ]),
    );

    assert.deepEqual(grouped, perId);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("ftsLexicalScores returns ordinal lexical scores and honors filters", async () => {
  const { db, path } = await makeDb("fts.db");
  try {
    insertMemory(db, {
      id: "journey-alpha",
      content: "mirror mirror builder",
      embedding: [1, 0, 0],
      createdAt: "2026-01-03T00:00:00Z",
      journey: "cv22",
    });
    insertMemory(db, {
      id: "other-alpha",
      content: "mirror builder",
      embedding: [0, 1, 0],
      createdAt: "2026-01-02T00:00:00Z",
      journey: "other",
    });
    rebuildFts(db);

    const scores = ftsLexicalScores(db, "mirror builder", { journey: "cv22" });

    assert.deepEqual([...scores.entries()], [["journey-alpha", 1]]);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("searchMemories ranks with replayed embedding and logs returned access only", async () => {
  const { db, path } = await makeDb("fresh-search.db");
  try {
    insertMemory(db, {
      id: "semantic-hit",
      content: "mirror builder ariad",
      embedding: [1, 0, 0],
      createdAt: "2026-01-03T00:00:00Z",
      relevanceScore: 0.2,
    });
    insertMemory(db, {
      id: "semantic-miss",
      content: "unrelated",
      embedding: [0, 1, 0],
      createdAt: "2026-01-04T00:00:00Z",
      relevanceScore: 0,
    });
    rebuildFts(db);

    const provider = new ReplayEmbeddingProvider({
      kind: "embedding",
      response: { embedding: [1, 0, 0] },
    });
    const longQuery = `${"mirror ".repeat(60)}builder`;

    const results = await searchMemories(db, {
      query: longQuery,
      limit: 1,
      frozenNowMs: Date.parse("2026-01-05T00:00:00Z"),
      now: "2026-01-05T00:00:00Z",
      provider,
    });

    assert.deepEqual(
      results.map((result) => result.id),
      ["semantic-hit"],
    );
    const logRows = db.prepare("SELECT memory_id, access_context FROM memory_access_log").all();
    assert.equal(logRows.length, 1);
    assert.equal(logRows[0]?.memory_id, "semantic-hit");
    assert.equal(String(logRows[0]?.access_context).length, 200);
    assert.equal(
      db.prepare("SELECT last_accessed_at FROM memories WHERE id = ?").get("semantic-hit")
        ?.last_accessed_at,
      "2026-01-05T00:00:00Z",
    );
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

async function makeDb(name: string): Promise<{ db: WritableDatabase; path: string }> {
  await mkdir(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, name);
  await rm(path, { force: true });
  const db = openDatabaseCopyForWrite(path);
  db.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      memory_type TEXT NOT NULL,
      layer TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      context TEXT,
      journey TEXT,
      persona TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      relevance_score REAL NOT NULL DEFAULT 0,
      embedding BLOB,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TEXT
    );
    CREATE TABLE memory_access_log (
      memory_id TEXT NOT NULL,
      accessed_at TEXT NOT NULL,
      access_context TEXT
    );
    CREATE VIRTUAL TABLE memories_fts USING fts5(
      title,
      content,
      content='memories',
      content_rowid='rowid'
    );
  `);
  return { db, path };
}

function insertMemory(
  db: WritableDatabase,
  input: {
    id: string;
    content: string;
    embedding: readonly number[];
    createdAt: string;
    journey?: string;
    relevanceScore?: number;
  },
): void {
  db.prepare(
    `INSERT INTO memories
      (id, memory_type, layer, title, content, journey, created_at, relevance_score, embedding)
     VALUES (?, 'insight', 'journey', ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.id,
    input.content,
    input.journey ?? null,
    input.createdAt,
    input.relevanceScore ?? 0,
    float32Blob(input.embedding),
  );
}

function rebuildFts(db: WritableDatabase): void {
  db.prepare("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')").run();
}

function float32Blob(values: readonly number[]): Uint8Array {
  const array = new Float32Array(values);
  return new Uint8Array(array.buffer);
}
