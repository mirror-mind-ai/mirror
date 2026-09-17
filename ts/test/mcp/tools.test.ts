import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";
import {
  detectPersonaTool,
  journeyStatusTool,
  listConversationsTool,
  listJourneysTool,
  recallConversationTool,
} from "#mcp/tools/deterministic.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(
  readFileSync(join(HERE, "..", "goldens", "mcp-tools.golden.json"), "utf-8"),
) as Golden;

interface Golden {
  embedding_dim: number;
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
      embedding: number[] | null;
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

const SEED_NOW = "2026-01-01T00:00:00Z";

/**
 * Seed exactly the golden's rows, in exactly the golden's order.
 *
 * Neither Python read carries a tie-break beyond `created_at DESC` /
 * `started_at DESC`, so equal timestamps resolve by rowid — insertion order.
 * The seed contains such ties deliberately, which is why this inserts in
 * sequence rather than, say, sorting or batching.
 */
function seedDatabase(db: WritableDatabase): void {
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
      memory.embedding === null ? null : Buffer.from(new Float32Array(memory.embedding).buffer);
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

function withSeededDatabase<T>(fn: (db: WritableDatabase) => T): T {
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

const HANDLERS: Record<string, (db: WritableDatabase, args: unknown) => string> = {
  list_journeys: listJourneysTool,
  journey_status: journeyStatusTool,
  list_conversations: listConversationsTool,
  recall_conversation: recallConversationTool,
  detect_persona: detectPersonaTool,
};

const DETERMINISTIC_CASES = GOLDEN.cases.filter((testCase) => testCase.tool in HANDLERS);

test("the golden actually covers the five deterministic tools", () => {
  const covered = new Set(DETERMINISTIC_CASES.map((testCase) => testCase.tool));
  assert.deepEqual([...covered].sort(), Object.keys(HANDLERS).sort());
  assert.ok(DETERMINISTIC_CASES.length >= 14, "expected the full case list, not a subset");
});

for (const testCase of DETERMINISTIC_CASES) {
  test(`payload parity: ${testCase.name}`, () => {
    withSeededDatabase((db) => {
      const handler = HANDLERS[testCase.tool];
      if (testCase.raises !== null) {
        assert.throws(
          () => handler(db, testCase.arguments),
          (error: Error) => {
            assert.equal(error.message, testCase.raises);
            return true;
          },
        );
        return;
      }
      assert.equal(handler(db, testCase.arguments), testCase.payload);
    });
  });
}

test("journey_status carries no embedding bytes and no Pydantic repr", () => {
  // The D1 fix, asserted from the TypeScript side: before it, this payload
  // rendered live objects through Pydantic's __str__ including embedding=b'...'.
  withSeededDatabase((db) => {
    const payload = journeyStatusTool(db, {});
    assert.equal(payload.includes("embedding=b'"), false);
    assert.equal(payload.includes("id='"), false);
    assert.ok(payload.includes('"recent_memories"'));
  });
});

test("detect_persona renders whole scores as Python floats", () => {
  // The whole reason PyFloat exists: JSON.stringify would write 2 here.
  withSeededDatabase((db) => {
    const payload = detectPersonaTool(db, { query: "there is a bug in the database schema" });
    assert.match(payload, /"score": 2\.0/);
  });
});

test("recall_conversation with limit=0 returns the whole transcript", () => {
  // Python's messages[-0:] is the whole list. Recorded, not fixed: the DS9
  // threat model owns the finding and TS1 caps it. When that lands, this test
  // is the one that must change, deliberately.
  withSeededDatabase((db) => {
    const all = JSON.parse(recallConversationTool(db, { conversation_id: "conv-0001", limit: 0 }));
    const two = JSON.parse(recallConversationTool(db, { conversation_id: "conv-0001", limit: 2 }));
    assert.equal(all.messages.length, 3);
    assert.equal(two.messages.length, 2);
  });
});

test("timestamp ties resolve by insertion order, on both engines", () => {
  // mem-0001 and mem-0002 share a created_at; conv-0001 and conv-0002 share a
  // started_at. Neither query has a further tie-break, so rowid decides — which
  // is why the seed is ordered and this test seeds it in sequence.
  withSeededDatabase((db) => {
    const status = JSON.parse(journeyStatusTool(db, { slug: "alpha-journey" }));
    const entry = status["alpha-journey"];
    // Newest first (sort direction), then the tied pair in insertion order
    // (tie-break). The newest rows exist precisely so the direction is graded:
    // with only the tied pair, ASC and DESC produce the same list.
    assert.deepEqual(
      entry.recent_memories.map((memory: { id: string }) => memory.id),
      ["mem-0006", "mem-0001", "mem-0002"],
    );
    assert.deepEqual(
      entry.recent_conversations.map((conversation: { id: string }) => conversation.id),
      ["conv-0004", "conv-0001", "conv-0002"],
    );
  });
});
