// CV22.DS9.TS1 plateau 1 — the other paid tool is recorded, and both are attributed.
//
// TS2 made `search_memories(query)` write its `llm_calls` row. `mirror_context(query)`
// embeds too -- through attachment search -- and wrote nothing, on BOTH engines: Python's
// `attachment.py` calls `generate_embedding(query)` with no `on_llm_call`. A guard that
// reads the ledger is blind to half the paid surface until this is fixed, so TS1 fixes it
// and records the oracle's omission rather than porting it.
//
// The marker matters as much as the row. Extraction embeds every memory it creates, so a
// session close writes dozens of embedding rows in a minute; a guard counting ALL embedding
// rows would refuse the agent because the USER just ended a session. `session_id = "mcp"`
// is what makes the count name the actor it guards.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { WritableDatabase } from "#db/database.ts";
import { MCP_LEDGER_SESSION } from "#mcp/guards.ts";
import { mirrorContextTool, searchMemoriesTool } from "#mcp/tools/providerCrossing.ts";
import { embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import type { EmbeddingProvider } from "#providers/embedding.ts";
import {
  deterministicEmbedding,
  GOLDEN,
  queryEmbedding,
  withSeededDatabaseAsync,
} from "./support/fixture.ts";

const meteredProvider: EmbeddingProvider = {
  async embed(text: string) {
    return { vector: queryEmbedding(text), promptTokens: 12 };
  },
};

function ledgerSessions(db: WritableDatabase): (string | null)[] {
  return db
    .prepare("SELECT session_id FROM llm_calls ORDER BY called_at")
    .all()
    .map((row) => (row.session_id === null ? null : String(row.session_id)));
}

function seedAttachment(db: WritableDatabase): void {
  const embedding = Buffer.from(new Float32Array(deterministicEmbedding(3)).buffer);
  db.prepare(
    "INSERT INTO attachments (id, journey_id, name, description, content, content_type, " +
      "created_at, updated_at, embedding) VALUES (?, ?, ?, ?, ?, 'markdown', ?, ?, ?)",
  ).run(
    "att-1",
    GOLDEN.seed.journeys[0].key,
    "parity notes",
    "notes about the port",
    "the golden corpus is the oracle",
    GOLDEN.frozen_now,
    GOLDEN.frozen_now,
    embedding,
  );
}

function runtime(db: WritableDatabase) {
  return {
    embeddingProvider: meteredProvider,
    frozenNowMs: GOLDEN.frozen_now_ms,
    embeddingLedger: embeddingLedgerHook(db, { sessionId: MCP_LEDGER_SESSION }),
  };
}

test("mirror_context with a query records its embedding, attributed to the MCP surface", async () => {
  await withSeededDatabaseAsync(async (db) => {
    seedAttachment(db);
    await mirrorContextTool(
      db,
      { query: "parity", journey: GOLDEN.seed.journeys[0].key },
      runtime(db),
    );
    assert.deepEqual(
      ledgerSessions(db),
      ["mcp"],
      "the attachment-search embedding is a paid call and must be countable",
    );
  });
});

test("mirror_context without attachments embeds nothing, so it records nothing", async () => {
  await withSeededDatabaseAsync(async (db) => {
    // No attachment rows: `relevantAttachments` returns before generating a vector, so
    // there is no spend to record. A row here would mean the guard counts phantom calls.
    await mirrorContextTool(db, { query: "parity" }, runtime(db));
    assert.deepEqual(ledgerSessions(db), []);
  });
});

test("mirror_context without a query never reaches the provider", async () => {
  await withSeededDatabaseAsync(async (db) => {
    seedAttachment(db);
    await mirrorContextTool(db, { journey: GOLDEN.seed.journeys[0].key }, runtime(db));
    assert.deepEqual(ledgerSessions(db), []);
  });
});

test("search_memories carries the same marker, so one window counts both tools", async () => {
  await withSeededDatabaseAsync(async (db) => {
    await searchMemoriesTool(db, { query: "memory", limit: 3 }, runtime(db));
    assert.deepEqual(ledgerSessions(db), ["mcp"]);
  });
});

test("another caller's embedding row is not attributed to MCP", async () => {
  await withSeededDatabaseAsync(async (db) => {
    // What extraction does at a session close. The guard must not count it: refusing the
    // agent because the user ended a conversation is the failure this marker prevents.
    embeddingLedgerHook(db)({
      text: "a memory being stored",
      vector: [],
      latencyMs: 4,
      promptTokens: 7,
    });
    await searchMemoriesTool(db, { query: "memory", limit: 3 }, runtime(db));
    assert.deepEqual(ledgerSessions(db), [null, "mcp"]);
  });
});
