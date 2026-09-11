import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { consolidateScan, shadowScan } from "#cultivation/scan.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { embeddingToBytes } from "#db/decode.ts";
import {
  runDescriptorGenerateRoute,
  runJournalRoute,
  runWeekPlanRoute,
} from "#frontDoor/contentTailRoute.ts";
import { runConsolidateApply } from "#frontDoor/cultivationRoute.ts";
import { runSoulRoute } from "#frontDoor/soulRoute.ts";
import {
  createConsolidationsTable,
  createMemoriesTable,
  insertMemory,
} from "#helpers/cultivationSchema.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createLlmCallsTable, ledgerRows } from "#helpers/llmCallsSchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { upsertIdentity } from "#identity/identityStore.ts";
import { chatLedgerHook, embeddingLedgerHook } from "#observability/ledgerHooks.ts";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "#providers/embedding.ts";
import { ReplayLlmProvider } from "#providers/llm.ts";

/**
 * CV22.DS8.US3 plateau 4 — the rows Python writes and TypeScript did not.
 *
 * Python logs `consolidation`, `shadow_scan`, `week_plan`,
 * `journal_classification`, and the `embedding` rows behind `journal`,
 * `soul harvest save`, and `consolidate apply`'s merge. TypeScript logged none
 * of them. That was invisible under replay — a replayed call is free, so an
 * absent row was *accurate* — and becomes real spend absent from the table the
 * burn-down and any future budget guard read as ground truth.
 *
 * The goldens pin PYTHON's rows for these leaves; nothing asserted TypeScript's
 * until now.
 */

const NOW = "2026-09-11T12:00:00.000000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-ledger-parity-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createMemoriesTable(db);
  createConsolidationsTable(db);
  createLlmCallsTable(db);
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedIds(...ids: string[]): () => string {
  let call = 0;
  return () => ids[call++] as string;
}

const MERGE_PROPOSAL = JSON.stringify({
  action: "merge",
  proposed_content: "One sharper memory.",
  rationale: "They say the same thing twice.",
});

function fixedEmbedding(): EmbeddingProvider {
  return {
    embed: async (text: string) => ({
      vector: Array(EMBEDDING_DIMENSIONS).fill(0.01),
      model: "openai/text-embedding-3-small",
      promptTokens: text.length,
    }),
  };
}

test("consolidate scan logs one consolidation row per cluster, as Python does", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, { id: "m1", createdAt: NOW, embedding: embeddingToBytes([1, 0, 0, 0]) });
    insertMemory(db, { id: "m2", createdAt: NOW, embedding: embeddingToBytes([0.99, 0.01, 0, 0]) });

    await consolidateScan(db, {
      provider: new ReplayLlmProvider({
        kind: "llm",
        responses: { consolidation: MERGE_PROPOSAL },
      }),
      id: seedIds("c1"),
      nowIso: () => NOW,
      onLlmCall: chatLedgerHook(db, "consolidation"),
    });

    const rows = ledgerRows(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.role, "consolidation");
    assert.equal(rows[0]?.cost_usd, null, "replayed: no usage, so unpriced rather than free");
  } finally {
    cleanup();
  }
});

test("a proposal the parser rejects still leaves its row -- the call was paid for", async () => {
  // Python logs after a successful call and before parsing. A row that
  // vanished on a parse failure would make a `parse_failed` run look free.
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, { id: "m1", createdAt: NOW, embedding: embeddingToBytes([1, 0, 0, 0]) });
    insertMemory(db, { id: "m2", createdAt: NOW, embedding: embeddingToBytes([0.99, 0.01, 0, 0]) });

    const result = await consolidateScan(db, {
      provider: new ReplayLlmProvider({
        kind: "llm",
        responses: { consolidation: "I am prose, not JSON." },
      }),
      id: seedIds("c1"),
      nowIso: () => NOW,
      onLlmCall: chatLedgerHook(db, "consolidation"),
    });

    assert.equal(result.results[0]?.proposal, null, "nothing was proposed");
    assert.equal(ledgerRows(db).length, 1, "but the call still happened");
  } finally {
    cleanup();
  }
});

test("shadow scan logs its one shadow_scan row", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "s1",
      createdAt: NOW,
      layer: "shadow",
      embedding: embeddingToBytes([1, 0, 0, 0]),
    });

    await shadowScan(db, {
      provider: new ReplayLlmProvider({
        kind: "llm",
        responses: {
          shadow_scan: JSON.stringify([
            { title: "Avoidance", observation: "A pattern.", memory_ids: ["s1"] },
          ]),
        },
      }),
      id: seedIds("o1"),
      nowIso: () => NOW,
      onLlmCall: chatLedgerHook(db, "shadow_scan"),
    });

    assert.deepEqual(
      ledgerRows(db).map((row) => row.role),
      ["shadow_scan"],
    );
  } finally {
    cleanup();
  }
});

test("a merge logs the embedding it paid for", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, { id: "m1", createdAt: NOW, embedding: embeddingToBytes([1, 0, 0, 0]) });
    db.prepare(
      `INSERT INTO consolidations (id, action, source_memory_ids, proposal, rationale, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("p1", "merge", JSON.stringify(["m1"]), "Merged content.", "why", "pending", NOW);

    const outcome = await runConsolidateApply(
      db,
      "p1",
      null,
      { identityId: "i1", mergeMemoryId: "mm1", nowIso: NOW },
      fixedEmbedding(),
    );

    assert.equal(outcome.kind, "applied");
    assert.deepEqual(
      ledgerRows(db).map((row) => row.role),
      ["embedding"],
      "the hook existed on this path; nobody had ever passed it one (CR075's adjacent case)",
    );
  } finally {
    cleanup();
  }
});

test("the embedding row survives a write that fails after it -- spend is not rolled back", async () => {
  // The invariant named in the plan: ledger rows are never inside a write
  // transaction. Money left the building; a failed insert must not erase the
  // record of it.
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, { id: "m1", createdAt: NOW, embedding: embeddingToBytes([1, 0, 0, 0]) });
    db.prepare(
      `INSERT INTO consolidations (id, action, source_memory_ids, proposal, rationale, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("p1", "merge", JSON.stringify(["m1"]), "Merged content.", "why", "pending", NOW);
    // Make the memory insert fail AFTER the embedding round trip: a duplicate
    // primary key for the id the merge is about to write.
    insertMemory(db, { id: "mm1", createdAt: NOW, embedding: embeddingToBytes([0, 1, 0, 0]) });

    await assert.rejects(() =>
      runConsolidateApply(
        db,
        "p1",
        null,
        { identityId: "i1", mergeMemoryId: "mm1", nowIso: NOW },
        fixedEmbedding(),
      ),
    );

    assert.deepEqual(
      ledgerRows(db).map((row) => row.role),
      ["embedding"],
      "the paid round trip is still recorded",
    );
  } finally {
    cleanup();
  }
});

// --- the content tail and the soul harvest ------------------------------------

/**
 * Record a route's stdout without swallowing anything.
 *
 * The stub FORWARDS to the real stream. A silencing stub eats the test
 * runner's own reporter output while it is installed -- six results vanished
 * from this file's first run, and the summary under-counted to match. The
 * repo's other route tests avoid the problem entirely by spawning the front
 * door (`spawnFrontDoor`); these call the route in-process to keep the
 * provider seams injectable, so forwarding is the price.
 */
async function captured(run: () => Promise<number>): Promise<{ exitCode: number; out: string }> {
  const original = process.stdout.write.bind(process.stdout);
  let out = "";
  process.stdout.write = ((chunk: string, ...rest: unknown[]) => {
    out += typeof chunk === "string" ? chunk : "";
    return (original as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stdout.write;
  try {
    return { exitCode: await run(), out };
  } finally {
    process.stdout.write = original;
  }
}

test("journal logs BOTH rows Python logs: the classification and the embedding", async () => {
  const { db, cleanup } = tempDb();
  try {
    const { exitCode } = await captured(() =>
      runJournalRoute(db, ["journal", "Decidi parar de adiar."], {
        llm: new ReplayLlmProvider({
          kind: "llm",
          responses: {
            journal_classification: JSON.stringify({ title: "A decision", layer: "ego", tags: [] }),
          },
        }),
        embedding: fixedEmbedding(),
      }),
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(
      ledgerRows(db).map((row) => row.role),
      ["journal_classification", "embedding"],
      "Python's add_journal logs the classification, then add_memory logs the embedding",
    );
  } finally {
    cleanup();
  }
});

test("the journal embedding goes through the safety wrapper, not the bare provider (CR075)", async () => {
  // The wrapper owns three behaviors a direct `provider.embed` call skips:
  // bounded retry of a transient empty payload, the AI-07 dimension guard, and
  // the ledger hook. This pins the first: a provider that returns an empty
  // vector once and a good one next must produce a memory and TWO ledger rows.
  const { db, cleanup } = tempDb();
  try {
    let call = 0;
    const flaky: EmbeddingProvider = {
      embed: async (text: string) => ({
        vector: call++ === 0 ? [] : Array(EMBEDDING_DIMENSIONS).fill(0.01),
        model: "openai/text-embedding-3-small",
        promptTokens: text.length,
      }),
    };

    const { exitCode } = await captured(() =>
      runJournalRoute(db, ["journal", "entry"], {
        llm: new ReplayLlmProvider({
          kind: "llm",
          responses: { journal_classification: JSON.stringify({ title: "T", layer: "ego" }) },
        }),
        embedding: flaky,
      }),
    );

    assert.equal(exitCode, 0, "the transient empty payload was retried, not fatal");
    assert.deepEqual(
      ledgerRows(db).map((row) => row.role),
      ["journal_classification", "embedding", "embedding"],
      "both embedding round trips are recorded -- the failed one was paid for too",
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memories").get()?.n, 1);
  } finally {
    cleanup();
  }
});

test("a permanent dimension mismatch refuses the write, and the attempt is still ledgered", async () => {
  const { db, cleanup } = tempDb();
  try {
    const wrongDimensions: EmbeddingProvider = {
      embed: async () => ({ vector: [0.1, 0.2], model: "vendor/short", promptTokens: 1 }),
    };

    await assert.rejects(() =>
      captured(() =>
        runJournalRoute(db, ["journal", "entry"], {
          llm: new ReplayLlmProvider({
            kind: "llm",
            responses: { journal_classification: JSON.stringify({ title: "T", layer: "ego" }) },
          }),
          embedding: wrongDimensions,
        }),
      ),
    );

    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM memories").get()?.n,
      0,
      "AI-07: a vector the corpus cannot rank against is never stored",
    );
    assert.equal(ledgerRows(db).length, 2, "classification + the refused round trip");
  } finally {
    cleanup();
  }
});

test("soul harvest save embeds through the wrapper and logs the row", async () => {
  const { db, cleanup } = tempDb();
  try {
    createRuntimeTables(db);
    db.prepare(
      `INSERT INTO runtime_sessions (session_id, conversation_id, interface, started_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "sess-1",
      null,
      "pi",
      NOW,
      NOW,
      JSON.stringify({ soul: { harvested_fruit: "A fruit." } }),
    );

    const { exitCode } = await captured(() =>
      runSoulRoute(db, ["soul", "harvest", "save", "--session-id", "sess-1"], {
        readMessages: () => [],
        embed: async (database, text) => {
          embeddingLedgerHook(database)({
            text,
            vector: [0.01],
            latencyMs: 1,
            promptTokens: text.length,
          });
          return new Uint8Array(new Float32Array(Array(EMBEDDING_DIMENSIONS).fill(0.01)).buffer);
        },
        newId: seedIds("mem-1"),
        nowIso: () => NOW,
      }),
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(
      ledgerRows(db).map((row) => row.role),
      ["embedding"],
      "the one leaf of Soul that crosses the provider seam now records it",
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memories").get()?.n, 1);
  } finally {
    cleanup();
  }
});

test("a failed harvest embedding leaves the fruit harvested for a retry", async () => {
  // Python raises out of add_journal before clear_harvested_fruit is reached.
  // Clearing first would lose the fruit to a provider outage.
  const { db, cleanup } = tempDb();
  try {
    createRuntimeTables(db);
    db.prepare(
      `INSERT INTO runtime_sessions (session_id, conversation_id, interface, started_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "sess-1",
      null,
      "pi",
      NOW,
      NOW,
      JSON.stringify({ soul: { harvested_fruit: "A fruit." } }),
    );

    const exitCode = await captured(() =>
      runSoulRoute(db, ["soul", "harvest", "save", "--session-id", "sess-1"], {
        readMessages: () => [],
        embed: async () => {
          throw new Error("provider down");
        },
        newId: seedIds("mem-1"),
        nowIso: () => NOW,
      }),
    ).then(
      (result) => result.exitCode,
      () => 1,
    );

    assert.equal(exitCode, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memories").get()?.n, 0, "nothing written");
    const metadata = db
      .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
      .get("sess-1") as { metadata: string };
    assert.match(metadata.metadata, /harvested_fruit/, "the fruit survives to be saved again");
  } finally {
    cleanup();
  }
});

test("week plan logs its week_plan row", async () => {
  const { db, cleanup } = tempDb();
  try {
    db.exec(
      "CREATE TABLE journeys (slug TEXT PRIMARY KEY, description TEXT, status TEXT, " +
        "parent_slug TEXT, created_at TEXT, updated_at TEXT);" +
        "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, journey TEXT, " +
        "due_date TEXT, created_at TEXT, updated_at TEXT, metadata TEXT);",
    );
    const pendingPath = join(mkdtempSync(join(tmpdir(), "mirror-core-week-")), "pending.json");

    const { exitCode } = await captured(() =>
      runWeekPlanRoute(
        db,
        ["Segunda: revisar o plano."],
        new ReplayLlmProvider({ kind: "llm", responses: { week_plan: "[]" } }),
        { pendingPath },
      ),
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(
      ledgerRows(db).map((row) => row.role),
      ["week_plan"],
    );
  } finally {
    cleanup();
  }
});

test("descriptor generate logs one row per entity -- the decided divergence", async () => {
  // Python's `generate_descriptor` is its ONE LLM caller that takes no
  // `on_llm_call`, so neither engine recorded this spend. US11 preserved the
  // gap as parity and flagged it as a DS8 input; DS8 closes it in TypeScript,
  // the product authority for a ported command. The command fans out one call
  // per persona and per journey, so a ledger blind to it is blind to the
  // largest single-command spend in this story.
  const { db, cleanup } = tempDb();
  try {
    db.exec(
      "CREATE TABLE identity_descriptors (layer TEXT NOT NULL, key TEXT NOT NULL, " +
        "descriptor TEXT NOT NULL, generated_at TEXT NOT NULL, PRIMARY KEY (layer, key));",
    );
    for (const [key, content] of [
      ["engineer", "I drive the code."],
      ["writer", "I write."],
    ] as const) {
      upsertIdentity(
        db,
        { id: `id-${key}`, layer: "persona", key, content, version: "1.0.0", metadata: null },
        NOW,
      );
    }

    const { exitCode } = await captured(() =>
      runDescriptorGenerateRoute(
        db,
        ["generate", "--layer", "persona"],
        new ReplayLlmProvider({ kind: "llm", responses: { descriptor: "A short descriptor." } }),
      ),
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(
      ledgerRows(db).map((row) => row.role),
      ["descriptor", "descriptor"],
      "one row per generated entity",
    );
  } finally {
    cleanup();
  }
});
