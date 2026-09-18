import assert from "node:assert/strict";
import { test } from "node:test";
import { mirrorContextTool, searchMemoriesTool } from "#mcp/tools/providerCrossing.ts";
import type { EmbeddingProvider } from "#providers/embedding.ts";
import { searchMemories } from "#search/memorySearch.ts";
import {
  accessState,
  GOLDEN,
  queryEmbedding,
  seededDatabase,
  seededPath,
  withSeededDatabaseAsync,
} from "./support/fixture.ts";

/** Replays the generator's patched `generate_embedding`, no provider call. */
const replayProvider: EmbeddingProvider = {
  async embed(text: string) {
    return { vector: queryEmbedding(text), promptTokens: null };
  },
};

const runtime = { embeddingProvider: replayProvider, frozenNowMs: GOLDEN.frozen_now_ms };

const CASES = GOLDEN.cases.filter(
  (testCase) => testCase.tool === "search_memories" || testCase.tool === "mirror_context",
);

test("the golden covers both provider-crossing tools, query paths included", () => {
  const tools = new Set(CASES.map((testCase) => testCase.tool));
  assert.deepEqual([...tools].sort(), ["mirror_context", "search_memories"]);
  assert.ok(
    CASES.some((testCase) => "query" in testCase.arguments),
    "a query case must be present, or the replayed path is untested",
  );
});

/**
 * Compare a ranked-search payload: every field byte-exact, the score within
 * 1e-6.
 *
 * Python's `np.dot` over float32 arrays accumulates IN float32; JavaScript has
 * no float32 arithmetic and widens to double. Identical vectors therefore
 * produce scores that agree to about seven significant digits and then diverge
 * (measured: ~3.6e-08). Reproducing numpy's pairwise float32 summation in JS
 * would mean reverse-engineering an implementation detail that numpy is free to
 * change, so the Navigator scoped the claim instead: ORDER and FIELDS are the
 * contract, the score is graded to tolerance, and the exception is recorded in
 * the story rather than hidden behind a rounded payload.
 */
function assertRankedPayloadParity(actual: string, expected: string, label: string): void {
  const actualRows = JSON.parse(actual) as Record<string, unknown>[];
  const expectedRows = JSON.parse(expected) as Record<string, unknown>[];
  assert.equal(actualRows.length, expectedRows.length, `${label}: result count`);
  actualRows.forEach((actualRow, index) => {
    const expectedRow = expectedRows[index];
    const { score: actualScore, ...actualRest } = actualRow;
    const { score: expectedScore, ...expectedRest } = expectedRow;
    // Order and every non-score field stay exact -- including the id at this
    // position, which is what a reordering would break.
    assert.deepEqual(actualRest, expectedRest, `${label}: row ${index} fields`);
    assert.ok(
      Math.abs(Number(actualScore) - Number(expectedScore)) < 1e-6,
      `${label}: row ${index} score ${actualScore} vs ${expectedScore} exceeds 1e-6`,
    );
  });
}

for (const testCase of CASES) {
  test(`payload parity: ${testCase.name}`, async () => {
    await withSeededDatabaseAsync(async (db) => {
      const run = () =>
        testCase.tool === "search_memories"
          ? searchMemoriesTool(db, testCase.arguments, runtime)
          : mirrorContextTool(db, testCase.arguments, runtime);

      if (testCase.raises !== null) {
        await assert.rejects(run, (error: Error) => {
          assert.equal(error.message, testCase.raises);
          return true;
        });
        return;
      }

      const actual = await run();
      // Only the ranked query path carries a float score; every other case,
      // filter paths included, is compared byte for byte.
      if (testCase.tool === "search_memories" && "query" in testCase.arguments) {
        assertRankedPayloadParity(actual, testCase.payload ?? "", testCase.name);
        return;
      }
      assert.equal(actual, testCase.payload);
    });
  });
}

test("search_memories with a query writes no access rows (AI-12)", async () => {
  // An agent searching on its own behalf is not a genuine context load. If this
  // reinforces, the ranker learns from its own exhaust -- the exact defect
  // AI-12 fixed in Python, which the TS port must not reintroduce.
  await withSeededDatabaseAsync(async (db) => {
    const before = accessState(db);
    await searchMemoriesTool(db, { query: "alpha insight", limit: 3 }, runtime);
    assert.deepEqual(accessState(db), before, "search_memories reinforced retrieval");
  });
});

test("mirror_context writes no access rows either, because it never searches memories", async () => {
  // The US2 plan (D6) assumed this tool reinforced, on the strength of AI-12's
  // note that "Builder context load keeps the default and still reinforces".
  // Measured against the Python oracle, that is wrong: the Builder load runs a
  // memory search, whereas load_mirror_context assembles identity layers and
  // searches ATTACHMENTS, which have no reinforcement. Python writes zero rows
  // here, and so does this port.
  await withSeededDatabaseAsync(async (db) => {
    const before = accessState(db);
    await mirrorContextTool(db, { query: "alpha insight" }, runtime);
    assert.deepEqual(accessState(db), before);
  });
});

test("the AI-12 opt-out is load-bearing: the same search reinforces without it", async () => {
  // Without this, "search_memories writes no access rows" would also pass if
  // the search silently failed, or if reinforcement were broken everywhere.
  // Running the identical query through the default path must write rows.
  await withSeededDatabaseAsync(async (db) => {
    const before = accessState(db);
    await searchMemories(db, {
      query: "alpha insight",
      limit: 3,
      provider: replayProvider,
      frozenNowMs: GOLDEN.frozen_now_ms,
    });
    assert.notDeepEqual(accessState(db), before, "the default path should reinforce");
  });
});

test("the query path records no embedding-ledger row (Navigator decision (d))", async () => {
  // The MCP server opens the database read-only, so an agent-initiated search
  // writes nothing at all -- not reinforcement, not the llm_calls ledger row
  // that a query embedding would normally record (AI-09/D-003).
  //
  // This is the COST of that decision, pinned so it cannot be forgotten:
  // agent-initiated searches are uncounted spend. CV22.DS9.TS1's wallet guard
  // reads this ledger, so TS2 has to settle how this server opens its database
  // before TS1 can guard what it cannot see. When that happens, this test is
  // the one that must change, deliberately.
  await withSeededDatabaseAsync(async (db) => {
    const ledgerRows = () =>
      Number(db.prepare("SELECT COUNT(*) AS n FROM llm_calls").get()?.n ?? -1);
    const before = ledgerRows();
    await searchMemoriesTool(db, { query: "alpha insight", limit: 3 }, runtime);
    assert.equal(ledgerRows(), before, "the MCP query path wrote a ledger row");
  });
});

test("asking for a write through a read-only handle names the option that asked", async () => {
  // The guard that makes decision (d) safe rather than silent: search reads
  // through a plain handle, and the two write paths are opt-in. Requesting one
  // with a read-only connection is a caller bug, and it says so.
  const { openDatabaseReadOnly } = await import("#db/database.ts");
  const seeded = seededDatabase();
  const path = seededPath(seeded);
  seeded.close();
  const readOnly = openDatabaseReadOnly(path);
  try {
    await assert.rejects(
      () =>
        searchMemories(readOnly, {
          query: "alpha insight",
          provider: replayProvider,
          logAccess: true,
          recordEmbeddingLedger: false,
        }),
      /logAccess requires a writable database handle/,
    );
  } finally {
    readOnly.close();
  }
});
