import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createLlmCallsTable, ledgerRows } from "#helpers/llmCallsSchema.ts";
import { chatLedgerHook, embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_EXTRACTION_MODEL } from "#providers/config.ts";

/**
 * CV22.DS8.US3 plateau 4 — the two shared ledger hooks.
 *
 * Python has ONE authority for this (`build_llm_logger`) and TypeScript grew
 * three hand-written copies that did not stay equal: US1 priced the search
 * embedding and left extraction's unpriced, which a live smoke run caught as
 * "7 of 10 rows priced". These tests pin the shared mechanism; the per-leaf
 * tests pin that each leaf actually wires it.
 */

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-ledger-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createLlmCallsTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function withDb(run: (db: WritableDatabase) => void): void {
  const { db, cleanup } = tempDb();
  try {
    run(db);
  } finally {
    cleanup();
  }
}

test("a chat row is priced from the static table, as Python's logger prices it", () => {
  withDb((db) => {
    chatLedgerHook(db, "consolidation")(
      {
        content: "{}",
        model: DEFAULT_EXTRACTION_MODEL,
        promptTokens: 1000,
        completionTokens: 500,
        latencyMs: 12,
      },
      "assembled prompt",
    );

    const [row] = ledgerRows(db);
    assert.equal(row?.role, "consolidation");
    assert.equal(row?.model, DEFAULT_EXTRACTION_MODEL);
    // 1000/1k * 0.0001 + 500/1k * 0.0004
    assert.equal(row?.cost_usd, 0.0001 + 0.0002);
  });
});

test("no usage means unpriced, never zero -- a replayed call cost nothing", () => {
  withDb((db) => {
    chatLedgerHook(db, "week_plan")({ content: "[]" }, "p");

    const [row] = ledgerRows(db);
    assert.equal(row?.cost_usd, null);
    assert.equal(row?.prompt_tokens, null);
  });
});

test("an unknown model prices to null, so unpriced spend stays visible", () => {
  withDb((db) => {
    chatLedgerHook(db, "consult")(
      { content: "hi", model: "anthropic/not-in-the-table", promptTokens: 10, completionTokens: 5 },
      "p",
    );

    const [row] = ledgerRows(db);
    assert.equal(row?.model, "anthropic/not-in-the-table");
    assert.equal(row?.cost_usd, null, "a missing price is unknown, not free");
    assert.equal(row?.prompt_tokens, 10, "usage is still recorded");
  });
});

test("bodies are withheld by default -- the prompt carries identity context", () => {
  withDb((db) => {
    chatLedgerHook(db, "shadow_scan")({ content: "secret answer" }, "secret prompt");

    const [row] = ledgerRows(db);
    assert.equal(row?.prompt, "");
    assert.equal(row?.response, "");
  });
});

test("an embedding row is priced on the prompt side only", () => {
  withDb((db) => {
    embeddingLedgerHook(db)({ text: "hello", vector: [0.1], promptTokens: 2000, latencyMs: 4 });

    const [row] = ledgerRows(db);
    assert.equal(row?.role, "embedding");
    assert.equal(row?.model, DEFAULT_EMBEDDING_MODEL);
    assert.equal(row?.completion_tokens, null, "a vector has no completion side");
    assert.equal(row?.cost_usd, 2000 * 0.00002 * 0.001);
  });
});

test("a failed round trip still lands a row -- money may already be spent", () => {
  withDb((db) => {
    // generateEmbeddingSafely calls onAttempt for every attempt, including the
    // ones that come back empty. A vanished row would hide real spend.
    embeddingLedgerHook(db)({ text: "hello", vector: null, latencyMs: 3, promptTokens: null });
    embeddingLedgerHook(db)({ text: "hello", vector: null, latencyMs: 4, promptTokens: null });

    const rows = ledgerRows(db);
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => row.cost_usd),
      [null, null],
      "no usage came back, so both are unpriced rather than absent",
    );
  });
});

test("attribution and the pipeline's clock travel with the row", () => {
  withDb((db) => {
    const context = {
      conversationId: "conv-1",
      sessionId: "sess-1",
      now: () => "2026-09-11T00:00:00.000000Z",
    };
    chatLedgerHook(db, "reception", context)({ content: "{}" }, "p");
    embeddingLedgerHook(db, context)({ text: "t", vector: [0.1], latencyMs: 1, promptTokens: 1 });

    const rows = ledgerRows(db);
    for (const row of rows) {
      assert.equal(row.conversation_id, "conv-1");
      assert.equal(row.session_id, "sess-1");
    }
    const stamps = db.prepare("SELECT called_at FROM llm_calls").all();
    for (const stamp of stamps) {
      assert.equal(stamp.called_at, "2026-09-11T00:00:00.000000Z", "the injected clock, not now()");
    }
  });
});

test("the model pins follow an explicit env when the caller holds one", () => {
  withDb((db) => {
    const env = {
      MEMORY_EXTRACTION_MODEL: "vendor/pinned-chat",
      MEMORY_EMBEDDING_MODEL: "vendor/pinned-embed",
    };
    chatLedgerHook(db, "descriptor", { env })({ content: "d" }, "p");
    embeddingLedgerHook(db, { env })({ text: "t", vector: [0.1], latencyMs: 1, promptTokens: 1 });

    assert.deepEqual(
      ledgerRows(db).map((row) => row.model),
      ["vendor/pinned-chat", "vendor/pinned-embed"],
    );
  });
});

test("logging never throws into the pipeline it observes", () => {
  withDb((db) => {
    db.exec("DROP TABLE llm_calls");

    assert.doesNotThrow(() => chatLedgerHook(db, "consolidation")({ content: "x" }, "p"));
    assert.doesNotThrow(() =>
      embeddingLedgerHook(db)({ text: "t", vector: null, latencyMs: 1, promptTokens: null }),
    );
  });
});
