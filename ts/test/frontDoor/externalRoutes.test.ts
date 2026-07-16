import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";

const TMP_DIR = join(process.cwd(), "tmp", "test-frontdoor-external");

test("front door runs consult credits through TS replay route", async () => {
  const dir = await freshDir("consult-credits");
  const creditsPath = join(dir, "credits.json");
  await writeJson(creditsPath, {
    kind: "credits",
    credits: { totalCredits: 10, totalUsage: 8, balance: 2 },
  });

  const result = spawnFrontDoor(["consult", "credits"], {
    MIRROR_TS_EXTERNAL_ROUTES: "1",
    MIRROR_TS_CREDITS_REPLAY: creditsPath,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "Balance: openrouter: ▓▓▓▓░░░░░░░░░░░░░░░░ R$ 11.40\n");
  assert.equal(result.stderr, "");
});

test("front door runs consult ask through TS replay route", async () => {
  const dir = await freshDir("consult-ask");
  const creditsPath = join(dir, "credits.json");
  const llmPath = join(dir, "llm.json");
  await writeJson(creditsPath, {
    kind: "credits",
    credits: { totalCredits: 10, totalUsage: 5, balance: 5 },
    generationCosts: { "gen-1": 0.001 },
  });
  await writeJson(llmPath, {
    kind: "llm",
    responses: {
      consult: {
        model: "google/gemini-2.5-flash-lite",
        content: "synthetic answer",
        generationId: "gen-1",
        promptTokens: 3,
        completionTokens: 4,
      },
    },
  });

  const result = spawnFrontDoor(["consult", "gemini", "hello"], {
    MIRROR_TS_EXTERNAL_ROUTES: "1",
    MIRROR_TS_CREDITS_REPLAY: creditsPath,
    MIRROR_TS_CONSULT_LLM_REPLAY: llmPath,
    MIRROR_TS_CONSULT_CONTEXT: "synthetic context",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Consulting google\/gemini-2.5-flash-lite/);
  assert.match(result.stdout, /synthetic answer/);
  assert.match(result.stdout, /\[prompt: 3, completion: 4\]/);
  assert.match(result.stdout, /Balance: openrouter:/);
  assert.equal(result.stderr, "");
});

test("front door runs memories --search through TS replay route and keeps logs metadata-only", async () => {
  const dir = await freshDir("search");
  const dbPath = join(dir, "search-copy.db");
  const embeddingPath = join(dir, "embedding.json");
  await writeJson(embeddingPath, { kind: "embedding", response: { embedding: [1, 0, 0] } });
  const db = makeSearchDb(dbPath);
  try {
    insertMemory(db, {
      id: "hit-memory",
      title: "Hit Memory",
      content: "mirror builder search",
      embedding: [1, 0, 0],
      createdAt: "2026-01-02T00:00:00Z",
    });
    insertMemory(db, {
      id: "miss-memory",
      title: "Miss Memory",
      content: "unrelated",
      embedding: [0, 1, 0],
      createdAt: "2026-01-01T00:00:00Z",
    });
    db.prepare("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')").run();
  } finally {
    db.close();
  }

  const result = spawnFrontDoor(
    ["memories", "--search", "mirror builder", "--limit", "1", "--db-path", dbPath],
    {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_SEARCH_EMBEDDING_REPLAY: embeddingPath,
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /🔍 Search: "mirror builder" \(1 results\)/);
  assert.match(result.stdout, /Hit Memory/);
  const dbAfter = openDatabaseCopyForWrite(dbPath);
  try {
    assert.equal(
      dbAfter.prepare("SELECT COUNT(*) AS count FROM memory_access_log").get()?.count,
      1,
    );
  } finally {
    dbAfter.close();
  }
  const log = await readFile(join(dir, "front-door.log"), "utf8");
  assert.match(log, /memories\tts\texit=0/);
  assert.doesNotMatch(log, /mirror builder/);
});

async function freshDir(name: string): Promise<string> {
  const dir = join(TMP_DIR, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2));
}

function makeSearchDb(path: string): WritableDatabase {
  const db = openDatabaseCopyForWrite(path);
  db.exec(`
    CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
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
    CREATE TABLE memory_access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT NOT NULL REFERENCES memories(id),
      accessed_at TEXT NOT NULL,
      access_context TEXT
    );
    CREATE VIRTUAL TABLE memories_fts USING fts5(
      title,
      content,
      context,
      content='memories',
      content_rowid='rowid'
    );
  `);
  for (const id of KNOWN_MIGRATION_IDS) {
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
      id,
      "2026-01-01T00:00:00Z",
    );
  }
  return db;
}

function insertMemory(
  db: WritableDatabase,
  input: {
    id: string;
    title: string;
    content: string;
    embedding: readonly number[];
    createdAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO memories
      (id, memory_type, layer, title, content, created_at, relevance_score, embedding)
     VALUES (?, 'insight', 'ego', ?, ?, ?, 1.0, ?)`,
  ).run(input.id, input.title, input.content, input.createdAt, float32Blob(input.embedding));
}

function float32Blob(values: readonly number[]): Uint8Array {
  const array = new Float32Array(values);
  return new Uint8Array(array.buffer);
}
