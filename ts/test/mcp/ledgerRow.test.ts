// CV22.DS9.TS2 plateau 1 — the agent search is recorded as spend again.
//
// US2 shipped `recordEmbeddingLedger: false` because the server's handle could
// not write, which left agent-initiated searches uncounted and blocked TS1's
// wallet guard. TS2 restores Python's behavior through a sink: the tool receives
// a FUNCTION, never a writable handle, so no tool can reach the connection.
//
// The ai-engineer lens set the bar for this file: "a computed cost" passes
// vacuously when the replay provider reports null usage, which the existing
// parity replay does. So the provider here reports real usage and the row's
// cost is graded NUMERICALLY against the single cost authority.

import assert from "node:assert/strict";
import { test } from "node:test";
import { MCP_LEDGER_SESSION } from "#mcp/guards.ts";
import { searchMemoriesTool } from "#mcp/tools/providerCrossing.ts";
import { embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { DEFAULT_EMBEDDING_MODEL } from "#providers/config.ts";
import { computeCost } from "#providers/cost.ts";
import type { EmbeddingProvider } from "#providers/embedding.ts";
import { GOLDEN, queryEmbedding, withSeededDatabaseAsync } from "./support/fixture.ts";

const PROMPT_TOKENS = 12;

/** Replays the golden's vector AND reports usage, so cost is gradable. */
const meteredProvider: EmbeddingProvider = {
  async embed(text: string) {
    return { vector: queryEmbedding(text), promptTokens: PROMPT_TOKENS };
  },
};

function ledgerRows(db: {
  prepare: (sql: string) => { all: (...p: never[]) => Record<string, unknown>[] };
}): Record<string, unknown>[] {
  return db
    .prepare(
      "SELECT role, model, prompt, response, prompt_tokens, completion_tokens, " +
        "latency_ms, cost_usd, conversation_id, session_id FROM llm_calls",
    )
    .all();
}

test("a query search through the sink writes exactly one priced llm_calls row", async () => {
  await withSeededDatabaseAsync(async (db) => {
    await searchMemoriesTool(
      db,
      { query: "memory", limit: 3 },
      {
        embeddingProvider: meteredProvider,
        frozenNowMs: GOLDEN.frozen_now_ms,
        embeddingLedger: embeddingLedgerHook(db, { sessionId: MCP_LEDGER_SESSION }),
      },
    );

    const rows = ledgerRows(db);
    assert.equal(rows.length, 1, "exactly one embedding crossing, exactly one row");
    const row = rows[0];
    assert.equal(row.role, "embedding");
    assert.equal(row.model, DEFAULT_EMBEDDING_MODEL);
    // Bodies are withheld in metadata mode — the same policy Python applies,
    // and the reason an agent-authored query never lands in the ledger.
    assert.equal(row.prompt, "");
    assert.equal(row.response, "");
    assert.equal(row.prompt_tokens, PROMPT_TOKENS);
    assert.equal(row.completion_tokens, null);
    // FLIPPED AT CV22.DS9.TS1, deliberately. TS2 wrote this row at Python's shape --
    // unattributed -- and recorded that a wallet guard reading it could not tell MCP spend
    // from extraction spend. TS1 is that guard, so the row now carries the `mcp` marker and
    // this assertion changes with the fact it was pinning. `conversation_id` stays null: an
    // agent's search belongs to no conversation.
    assert.equal(row.conversation_id, null);
    assert.equal(row.session_id, MCP_LEDGER_SESSION);

    const expected = computeCost(DEFAULT_EMBEDDING_MODEL, PROMPT_TOKENS, null);
    assert.notEqual(expected, null, "the cost authority must price the pinned model");
    assert.equal(
      row.cost_usd,
      expected,
      "the row must carry the cost authority's figure, not merely a non-null number",
    );
  });
});

test("a filter search crosses no provider and writes no ledger row", async () => {
  await withSeededDatabaseAsync(async (db) => {
    await searchMemoriesTool(
      db,
      { type: GOLDEN.seed.memories[0].memory_type, limit: 3 },
      {
        embeddingProvider: meteredProvider,
        frozenNowMs: GOLDEN.frozen_now_ms,
        embeddingLedger: embeddingLedgerHook(db, { sessionId: MCP_LEDGER_SESSION }),
      },
    );
    assert.equal(ledgerRows(db).length, 0);
  });
});

test("without a sink the tool records nothing — US2's read-only posture is the default", async () => {
  await withSeededDatabaseAsync(async (db) => {
    await searchMemoriesTool(
      db,
      { query: "memory", limit: 3 },
      { embeddingProvider: meteredProvider, frozenNowMs: GOLDEN.frozen_now_ms },
    );
    assert.equal(
      ledgerRows(db).length,
      0,
      "a runtime without a ledger sink must not fall back to writing through the tools' handle",
    );
  });
});
