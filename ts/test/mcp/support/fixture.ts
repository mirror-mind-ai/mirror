// Shared fixture for the MCP tool parity tests (CV22.DS9.US2).
//
// The golden carries its seed as an ORDERED list, and both engines must insert
// it in that order: neither Python read has a tie-break beyond its timestamp, so
// equal timestamps resolve by rowid. Extracted here so the deterministic and
// provider-crossing suites seed identically rather than keeping two copies.

import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

interface Golden {
  embedding_dim: number;
  frozen_now: string;
  frozen_now_ms: number;
  frozen_version?: string;
  transcript: {
    stdin: string;
    stdout_lines: string[];
    stderr: string;
    exit_code: number;
  };
  seed: {
    journeys: { key: string; content: string; metadata: string | null }[];
    personas: { key: string; content: string; metadata: string | null }[];
    identity: { layer: string; key: string; content: string }[];
    memories: {
      id: string;
      title: string;
      content: string;
      memory_type: string;
      layer: string;
      journey: string | null;
      tags: string | null;
      created_at: string;
      embedding_seed: number | null;
    }[];
    conversations: {
      id: string;
      title: string | null;
      started_at: string;
      ended_at: string | null;
      interface: string;
      persona: string | null;
      journey: string | null;
      summary: string | null;
    }[];
    messages: {
      id: string;
      conversation_id: string;
      role: string;
      content: string;
      created_at: string;
    }[];
  };
  cases: {
    name: string;
    tool: string;
    arguments: Record<string, unknown>;
    payload: string | null;
    raises: string | null;
  }[];
}

export const GOLDEN = JSON.parse(
  readFileSync(join(HERE, "..", "..", "goldens", "mcp-tools.golden.json"), "utf-8"),
) as Golden;

const SEED_NOW = "2026-01-01T00:00:00Z";

/**
 * The stored-memory vector, computed from its seed exactly as the Python
 * generator computes it. Vectors are derived rather than carried because
 * production embeddings are 1536-dimensional: storing six of them would be a
 * megabyte of golden nobody can read.
 */
export function deterministicEmbedding(seed: number): number[] {
  return Array.from({ length: GOLDEN.embedding_dim }, (_, index) =>
    Number((((seed * 7 + index * 3) % 11) / 10).toFixed(4)),
  );
}

/**
 * The replayed query vector: a pure function of the query text, matching the
 * `generate_embedding` the generator patched into Python. No provider call on
 * either side, so CI never needs a key.
 */
export function queryEmbedding(text: string): number[] {
  let total = 0;
  for (const character of text) total += character.codePointAt(0) ?? 0;
  return Array.from({ length: GOLDEN.embedding_dim }, (_, index) =>
    Number((((total + index * 13) % 11) / 10).toFixed(4)),
  );
}

/**
 * Seed exactly the golden's rows, in exactly the golden's order.
 *
 * Neither Python read carries a tie-break beyond `created_at DESC` /
 * `started_at DESC`, so equal timestamps resolve by rowid — insertion order.
 * The seed contains such ties deliberately, which is why this inserts in
 * sequence rather than, say, sorting or batching.
 */
export function seedDatabase(db: WritableDatabase): void {
  const seed = GOLDEN.seed;
  for (const journey of seed.journeys) {
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, metadata, created_at, updated_at) " +
        "VALUES (?, 'journey', ?, ?, ?, ?, ?)",
    ).run(
      `id-journey-${journey.key}`,
      journey.key,
      journey.content,
      journey.metadata,
      SEED_NOW,
      SEED_NOW,
    );
  }
  for (const persona of seed.personas) {
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, metadata, created_at, updated_at) " +
        "VALUES (?, 'persona', ?, ?, ?, ?, ?)",
    ).run(
      `id-persona-${persona.key}`,
      persona.key,
      persona.content,
      persona.metadata,
      SEED_NOW,
      SEED_NOW,
    );
  }
  for (const row of seed.identity) {
    db.prepare(
      "INSERT INTO identity (id, layer, key, content, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
    ).run(`id-${row.layer}-${row.key}`, row.layer, row.key, row.content, SEED_NOW, SEED_NOW);
  }
  for (const memory of seed.memories) {
    const embedding =
      memory.embedding_seed === null
        ? null
        : Buffer.from(new Float32Array(deterministicEmbedding(memory.embedding_seed)).buffer);
    db.prepare(
      "INSERT INTO memories (id, title, content, memory_type, layer, journey, tags, created_at, " +
        "embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      memory.id,
      memory.title,
      memory.content,
      memory.memory_type,
      memory.layer,
      memory.journey,
      memory.tags,
      memory.created_at,
      embedding,
    );
  }
  for (const conversation of seed.conversations) {
    db.prepare(
      "INSERT INTO conversations (id, title, started_at, ended_at, interface, persona, journey, " +
        "summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      conversation.id,
      conversation.title,
      conversation.started_at,
      conversation.ended_at,
      conversation.interface,
      conversation.persona,
      conversation.journey,
      conversation.summary,
    );
  }
  for (const message of seed.messages) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(message.id, message.conversation_id, message.role, message.content, message.created_at);
  }
}

export function withSeededDatabase<T>(fn: (db: WritableDatabase) => T): T {
  // The DS4 copy guard refuses a write target outside a tmp/ directory, so the
  // fixture lives under one — the same shape the other parity tests use.
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-mcp-tools-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  try {
    createSchema(db);
    seedDatabase(db);
    return fn(db);
  } finally {
    db.close();
  }
}

/** Async variant: the database must outlive an awaited callback. */
export async function withSeededDatabaseAsync<T>(
  fn: (db: WritableDatabase) => Promise<T>,
): Promise<T> {
  const db = seededDatabase();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

/**
 * Reinforcement state as `(memory_id, access rows)` pairs.
 *
 * Reinforcement is rows in `memory_access_log` plus a `last_accessed_at` stamp,
 * not a counter column. The stamp is deliberately excluded: it is wall-clock and
 * would differ between two runs of the same comparison.
 */
export function accessState(db: WritableDatabase): [string, number][] {
  return db
    .prepare(
      "SELECT m.id AS id, COUNT(log.memory_id) AS hits FROM memories m " +
        "LEFT JOIN memory_access_log log ON log.memory_id = m.id GROUP BY m.id ORDER BY m.id",
    )
    .all()
    .map((row) => [String(row.id), Number(row.hits)]);
}

const SEEDED_PATHS = new WeakMap<object, string>();

/** Open a seeded database the caller is responsible for closing. */
export function seededDatabase(): WritableDatabase {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-mcp-tools-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const path = join(tmp, "copy.db");
  const db = openDatabaseCopyForWrite(path);
  createSchema(db);
  seedDatabase(db);
  SEEDED_PATHS.set(db, path);
  return db;
}

/** The file behind a seeded handle, for tests that reopen it read-only. */
export function seededPath(db: WritableDatabase): string {
  const path = SEEDED_PATHS.get(db);
  if (!path) throw new Error("not a seeded database handle");
  return path;
}
