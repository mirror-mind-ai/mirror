import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { consolidateScan, shadowScan } from "../../src/cultivation/scan.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { embeddingToBytes } from "../../src/db/decode.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { ReplayLlmProvider } from "../../src/providers/llm.ts";
import {
  createConsolidationsTable,
  createMemoriesTable,
  insertMemory,
} from "../helpers/cultivationSchema.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-scan-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createMemoriesTable(db);
  createConsolidationsTable(db);
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedIds(...ids: string[]): () => string {
  let call = 0;
  return () => ids[call++] as string;
}

test("consolidateScan clusters embedded memories, proposes, and stores one Consolidation per cluster", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "m1",
      createdAt: "2026-01-01T00:00:00.000000Z",
      embedding: embeddingToBytes([1, 0, 0, 0]),
    });
    insertMemory(db, {
      id: "m2",
      createdAt: "2026-01-02T00:00:00.000000Z",
      embedding: embeddingToBytes([0.95, 0.05, 0, 0]),
    });
    insertMemory(db, { id: "m3", createdAt: "2026-01-03T00:00:00.000000Z", embedding: null }); // no embedding, excluded

    const provider = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        consolidation: JSON.stringify({
          action: "identity_update",
          target_layer: "ego",
          target_key: "behavior",
          proposed_content: "A pattern worth integrating.",
          rationale: "seen twice",
        }),
      },
    });

    const result = await consolidateScan(db, {
      provider,
      id: seedIds("c1"),
      nowIso: () => NOW,
    });

    assert.equal(result.memoriesScanned, 2);
    assert.equal(result.clusters.length, 1);
    assert.equal(result.proposalsCreated.length, 1);
    // The read is `ORDER BY created_at DESC` (matching Python), so m2 (later)
    // sorts first and becomes the cluster seed; m1 joins it.
    assert.deepEqual(result.proposalsCreated[0]?.source_memory_ids, JSON.stringify(["m2", "m1"]));
    assert.equal(result.proposalsCreated[0]?.status, "pending");

    const stored = db.prepare("SELECT COUNT(*) AS n FROM consolidations").get();
    assert.equal(stored?.n, 1);
  } finally {
    db.close();
    cleanup();
  }
});

test("consolidateScan returns early with no provider call when there are no embedded memories", async () => {
  const { db, cleanup } = tempDb();
  try {
    const provider = new ReplayLlmProvider({ kind: "llm", responses: {} });
    const result = await consolidateScan(db, {
      provider,
      id: seedIds("unused"),
      nowIso: () => NOW,
    });
    assert.deepEqual(result, { memoriesScanned: 0, clusters: [], proposalsCreated: [] });
    assert.equal(provider.calls.length, 0);
  } finally {
    db.close();
    cleanup();
  }
});

test("consolidateScan caps proposals at `limit`, proposing for only the first N clusters", async () => {
  const { db, cleanup } = tempDb();
  try {
    // Two independent clusters (m1/m2 and m3/m4), far apart from each other.
    insertMemory(db, {
      id: "m1",
      createdAt: "2026-01-01T00:00:00.000000Z",
      embedding: embeddingToBytes([1, 0, 0, 0]),
    });
    insertMemory(db, {
      id: "m2",
      createdAt: "2026-01-02T00:00:00.000000Z",
      embedding: embeddingToBytes([0.95, 0.05, 0, 0]),
    });
    insertMemory(db, {
      id: "m3",
      createdAt: "2026-01-03T00:00:00.000000Z",
      embedding: embeddingToBytes([0, 1, 0, 0]),
    });
    insertMemory(db, {
      id: "m4",
      createdAt: "2026-01-04T00:00:00.000000Z",
      embedding: embeddingToBytes([0, 0.95, 0.05, 0]),
    });

    const provider = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        consolidation: JSON.stringify({ action: "merge", proposed_content: "distilled" }),
      },
    });

    const result = await consolidateScan(db, {
      provider,
      limit: 1,
      id: seedIds("c1", "c2"),
      nowIso: () => NOW,
    });
    // Mirrors Python's own order: `clusters = clusters[:limit]` runs BEFORE
    // proposing, so the reported cluster list is already capped -- only one
    // cluster is exposed and only one proposal call is made.
    assert.equal(result.clusters.length, 1);
    assert.equal(result.proposalsCreated.length, 1);
    assert.equal(provider.calls.length, 1);
  } finally {
    db.close();
    cleanup();
  }
});

test("consolidateScan skips a cluster whose proposal is invalid (disallowed action), storing nothing for it", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "m1",
      createdAt: "2026-01-01T00:00:00.000000Z",
      embedding: embeddingToBytes([1, 0, 0, 0]),
    });
    insertMemory(db, {
      id: "m2",
      createdAt: "2026-01-02T00:00:00.000000Z",
      embedding: embeddingToBytes([0.95, 0.05, 0, 0]),
    });

    const provider = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        consolidation: JSON.stringify({ action: "delete_everything", proposed_content: "x" }),
      },
    });

    const result = await consolidateScan(db, {
      provider,
      id: seedIds("unused"),
      nowIso: () => NOW,
    });
    assert.equal(result.clusters.length, 1);
    assert.equal(result.proposalsCreated.length, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM consolidations").get()?.n, 0);
  } finally {
    db.close();
    cleanup();
  }
});

test("shadowScan proposes over the full candidate pool and stores each observation, hardcoding shadow/profile", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "s1",
      layer: "shadow",
      createdAt: "2026-01-01T00:00:00.000000Z",
      readinessState: "observed",
    });
    upsertIdentity(
      db,
      {
        id: "seed",
        layer: "shadow",
        key: "profile",
        content: "Existing pattern.",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );

    const provider = new ReplayLlmProvider({
      kind: "llm",
      responses: {
        shadow_scan: JSON.stringify([
          {
            title: "Pattern A",
            observation: "Recurring avoidance.",
            memory_ids: ["s1"],
            evidence_note: "3x",
          },
        ]),
      },
    });

    const result = await shadowScan(db, { provider, id: seedIds("obs-1"), nowIso: () => NOW });
    assert.equal(result.candidatesConsidered, 1);
    assert.equal(result.proposalsCreated.length, 1);
    assert.equal(result.proposalsCreated[0]?.target_layer, "shadow");
    assert.equal(result.proposalsCreated[0]?.target_key, "profile");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM consolidations").get()?.n, 1);
  } finally {
    db.close();
    cleanup();
  }
});

test("shadowScan makes no provider call and stores nothing when there are no shadow-candidate memories", async () => {
  const { db, cleanup } = tempDb();
  try {
    const provider = new ReplayLlmProvider({ kind: "llm", responses: {} });
    const result = await shadowScan(db, { provider, id: seedIds("unused"), nowIso: () => NOW });
    assert.deepEqual(result, { candidatesConsidered: 0, proposalsCreated: [] });
    assert.equal(provider.calls.length, 0);
  } finally {
    db.close();
    cleanup();
  }
});
