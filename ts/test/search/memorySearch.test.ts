import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import type { EmbeddingProvider } from "../../src/providers/embedding.ts";
import { ReplayEmbeddingProvider } from "../../src/providers/embedding.ts";
import {
  accessCountsByMemoryId,
  ftsLexicalScores,
  ftsQuery,
  searchMemories,
  searchMemoriesWithStatus,
} from "../../src/search/memorySearch.ts";

/** Mirrors Python's `mocker.patch(..., side_effect=RuntimeError(...))` -- a
 * provider that always fails, so degraded-mode is exercised deterministically
 * without a live network dependency. */
class FailingEmbeddingProvider implements EmbeddingProvider {
  async embed(): Promise<readonly number[]> {
    throw new Error("embedding provider unreachable");
  }
}

/** Proves the CR043 retry-before-degrade correction: a well-formed but empty
 * response is TRANSIENT (unlike FailingEmbeddingProvider's exception, which
 * is terminal in both old and new code) and must be retried before search
 * gives up and degrades. */
class EmptyThenSucceedsEmbeddingProvider implements EmbeddingProvider {
  calls = 0;
  private readonly emptyCount: number;
  private readonly vector: readonly number[];
  constructor(emptyCount: number, vector: readonly number[]) {
    this.emptyCount = emptyCount;
    this.vector = vector;
  }
  async embed(): Promise<readonly number[]> {
    this.calls += 1;
    return this.calls <= this.emptyCount ? [] : this.vector;
  }
}

const TMP_DIR = join(process.cwd(), "tmp", "test-memory-search");
// generateEmbeddingSafely (CR043) validates response length against
// EMBEDDING_DIMENSIONS=1536 -- query-embedding replay fixtures must be
// realistic length now, not the toy [1,0,0] vectors pre-CR043 tests used.
// Stored MEMORY embeddings (insertMemory's `embedding` param) are unaffected
// -- they're decoded from BLOB storage, never dimension-validated.
const VALID_EMBEDDING = Array(1536).fill(0.1);

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
      response: { embedding: VALID_EMBEDDING },
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

test("searchMemoriesWithStatus degrades to lexical-only and filters non-FTS-matched candidates (AI-04)", async () => {
  const { db, path } = await makeDb("degraded-filter.db");
  try {
    insertMemory(db, {
      id: "lexical-hit",
      content: "mirror builder release notes",
      embedding: [1, 0, 0],
      createdAt: "2026-01-03T00:00:00Z",
    });
    insertMemory(db, {
      id: "lexical-miss",
      content: "completely unrelated weather report",
      embedding: [0, 1, 0],
      createdAt: "2026-01-04T00:00:00Z",
    });
    rebuildFts(db);

    const outcome = await searchMemoriesWithStatus(db, {
      query: "release",
      limit: 5,
      provider: new FailingEmbeddingProvider(),
    });

    assert.equal(outcome.degraded, true);
    assert.deepEqual(
      outcome.results.map((result) => result.id),
      ["lexical-hit"],
    );
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("searchMemories (legacy) does not throw when the embedding provider fails, and still returns FTS-matched results", async () => {
  const { db, path } = await makeDb("degraded-legacy.db");
  try {
    insertMemory(db, {
      id: "lexical-hit",
      content: "mirror builder release notes",
      embedding: [1, 0, 0],
      createdAt: "2026-01-03T00:00:00Z",
    });
    insertMemory(db, {
      id: "lexical-miss",
      content: "completely unrelated weather report",
      embedding: [0, 1, 0],
      createdAt: "2026-01-04T00:00:00Z",
    });
    rebuildFts(db);

    const results = await searchMemories(db, {
      query: "release",
      limit: 5,
      provider: new FailingEmbeddingProvider(),
    });

    assert.deepEqual(
      results.map((result) => result.id),
      ["lexical-hit"],
    );
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("searchMemoriesWithStatus reports degraded: false when the embedding succeeds (normal-mode regression)", async () => {
  const { db, path } = await makeDb("degraded-false.db");
  try {
    insertMemory(db, {
      id: "semantic-hit",
      content: "mirror builder ariad",
      embedding: [1, 0, 0],
      createdAt: "2026-01-03T00:00:00Z",
    });
    rebuildFts(db);

    const provider = new ReplayEmbeddingProvider({
      kind: "embedding",
      response: { embedding: VALID_EMBEDDING },
    });

    const outcome = await searchMemoriesWithStatus(db, { query: "builder", limit: 5, provider });

    assert.equal(outcome.degraded, false);
    assert.ok(outcome.results.length >= 1);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("searchMemoriesWithStatus retries a transient empty response before degrading (CR043 correction: Python retries via generate_embedding before search gives up)", async () => {
  const { db, path } = await makeDb("retry-before-degrade.db");
  try {
    insertMemory(db, {
      id: "semantic-hit",
      content: "mirror builder ariad",
      embedding: [1, 0, 0],
      createdAt: "2026-01-03T00:00:00Z",
    });
    rebuildFts(db);

    // Empty twice (transient), succeeds on the 3rd call -- within the default
    // 3-attempt budget. A provider EXCEPTION (FailingEmbeddingProvider) is
    // terminal and stays single-attempt in both old and new code; only this
    // well-formed-but-empty case is where retry-before-degrade applies.
    const provider = new EmptyThenSucceedsEmbeddingProvider(2, VALID_EMBEDDING);

    const outcome = await searchMemoriesWithStatus(db, {
      query: "builder",
      limit: 5,
      provider,
      embeddingRetrySleep: async () => {}, // fast test, no real backoff wait
    });

    assert.equal(provider.calls, 3);
    assert.equal(outcome.degraded, false); // eventually succeeded -- not degraded
    assert.ok(outcome.results.length >= 1);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("searchMemoriesWithStatus logs the query embedding call to the ledger (AI-09/D-003)", async () => {
  const { db, path } = await makeDb("embedding-ledger.db");
  try {
    insertMemory(db, {
      id: "semantic-hit",
      content: "mirror builder ariad",
      embedding: [1, 0, 0],
      createdAt: "2026-01-03T00:00:00Z",
    });
    rebuildFts(db);

    const provider = new ReplayEmbeddingProvider({
      kind: "embedding",
      response: { embedding: VALID_EMBEDDING },
    });
    await searchMemoriesWithStatus(db, { query: "builder", limit: 5, provider });

    const rows = db
      .prepare("SELECT role, prompt_tokens, cost_usd FROM llm_calls WHERE role = 'embedding'")
      .all() as { role: string; prompt_tokens: number | null; cost_usd: number | null }[];
    assert.equal(rows.length, 1);
    // Honest limitation: no usage data from EmbeddingProvider -- unpriced, not fabricated.
    assert.equal(rows[0]?.prompt_tokens, null);
    assert.equal(rows[0]?.cost_usd, null);
  } finally {
    db.close();
    await rm(path, { force: true });
  }
});

test("searchMemoriesWithStatus composes the FTS-match filter with an existing journey filter when degraded", async () => {
  const { db, path } = await makeDb("degraded-compose-journey.db");
  try {
    insertMemory(db, {
      id: "match-both",
      content: "mirror builder session",
      embedding: [1, 0, 0],
      createdAt: "2026-01-03T00:00:00Z",
      journey: "cv22",
    });
    insertMemory(db, {
      id: "fts-match-wrong-journey",
      content: "another session here",
      embedding: [0, 1, 0],
      createdAt: "2026-01-04T00:00:00Z",
      journey: "other",
    });
    insertMemory(db, {
      id: "journey-match-no-fts",
      content: "totally different words",
      embedding: [0, 0, 1],
      createdAt: "2026-01-05T00:00:00Z",
      journey: "cv22",
    });
    rebuildFts(db);

    const outcome = await searchMemoriesWithStatus(db, {
      query: "session",
      limit: 5,
      journey: "cv22",
      provider: new FailingEmbeddingProvider(),
    });

    // Degraded narrows (FTS-match required); the existing journey filter must
    // still apply too -- neither filter alone should let a result through.
    assert.equal(outcome.degraded, true);
    assert.deepEqual(
      outcome.results.map((result) => result.id),
      ["match-both"],
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
    CREATE TABLE llm_calls (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, model TEXT NOT NULL,
      prompt TEXT NOT NULL, response TEXT NOT NULL,
      prompt_tokens INTEGER, completion_tokens INTEGER, latency_ms INTEGER,
      cost_usd REAL, conversation_id TEXT, session_id TEXT, called_at TEXT NOT NULL
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
