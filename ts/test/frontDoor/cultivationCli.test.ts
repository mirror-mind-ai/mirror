import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";
import { embeddingToBytes } from "../../src/db/decode.ts";
import {
  createConsolidationsTable,
  createMemoriesTable,
  insertMemory,
} from "../helpers/cultivationSchema.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "../helpers/identitySchema.ts";

function cultivationDbCopy(): { tmpDir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-cultivationcli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  createMemoriesTable(db);
  createConsolidationsTable(db);
  db.close();
  return { tmpDir, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function insertConsolidation(
  dbPath: string,
  row: {
    id: string;
    action: string;
    proposal: string;
    sourceMemoryIds: string[];
    targetLayer?: string | null;
    targetKey?: string | null;
    rationale?: string | null;
    status?: string;
    createdAt: string;
  },
): void {
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    db.prepare(
      "INSERT INTO consolidations (id, action, proposal, source_memory_ids, target_layer, target_key, rationale, status, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      row.id,
      row.action,
      row.proposal,
      JSON.stringify(row.sourceMemoryIds),
      row.targetLayer ?? null,
      row.targetKey ?? null,
      row.rationale ?? null,
      row.status ?? "pending",
      row.createdAt,
    );
  } finally {
    db.close();
  }
}

function consolidationStatus(dbPath: string, id: string): string | undefined {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const row = db.prepare("SELECT status FROM consolidations WHERE id = ?").get(id);
    return row?.status as string | undefined;
  } finally {
    db.close();
  }
}

// --- consolidate list / reject -------------------------------------------------

test("front door `consolidate list` prints 'No consolidations found.' on an empty database", () => {
  const ws = cultivationDbCopy();
  try {
    const result = spawnFrontDoor(["consolidate", "list", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "No consolidations found.\n");
  } finally {
    ws.cleanup();
  }
});

test("front door `consolidate list` prints a populated row", () => {
  const ws = cultivationDbCopy();
  try {
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "identity_update",
      proposal: "A pattern.",
      sourceMemoryIds: ["m1"],
      targetLayer: "ego",
      targetKey: "behavior",
      rationale: "seen twice",
      createdAt: "2026-01-15T00:00:00.000000Z",
    });
    const result = spawnFrontDoor(["consolidate", "list", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(
      result.stdout,
      "⏳ [abcd1234] 2026-01-15  🧬 identity_update → ego/behavior  (1 memories)\n   seen twice\n",
    );
  } finally {
    ws.cleanup();
  }
});

test("front door `consolidate reject` on an unknown id errors to stderr, exit 1", () => {
  const ws = cultivationDbCopy();
  try {
    const result = spawnFrontDoor(["consolidate", "reject", "zzz", "--db-path", ws.dbPath]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), "Error: proposal 'zzz' not found.");
  } finally {
    ws.cleanup();
  }
});

test("front door `consolidate reject` rejects a pending proposal", () => {
  const ws = cultivationDbCopy();
  try {
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "identity_update",
      proposal: "A pattern.",
      sourceMemoryIds: ["m1"],
      createdAt: "2026-01-15T00:00:00.000000Z",
    });
    const result = spawnFrontDoor([
      "consolidate",
      "reject",
      "abcd1234ef56",
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "Proposal [abcd1234] rejected. Source memories unchanged.\n");
    assert.equal(consolidationStatus(ws.dbPath, "abcd1234ef56"), "rejected");
  } finally {
    ws.cleanup();
  }
});

// --- consolidate apply (deterministic actions -- unconditional route) ---------

function writeValidEmbeddingFixture(ws: { tmpDir: string }): string {
  const embeddingPath = join(ws.tmpDir, "embedding.json");
  writeFileSync(
    embeddingPath,
    JSON.stringify({ kind: "embedding", response: { embedding: Array(1536).fill(0.1) } }),
  );
  return embeddingPath;
}

test("front door `consolidate apply` (identity_update) writes through the allowlist", () => {
  const ws = cultivationDbCopy();
  try {
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "identity_update",
      proposal: "A surfaced pattern.",
      sourceMemoryIds: ["m1"],
      targetLayer: "ego",
      targetKey: "behavior",
      createdAt: "2026-01-15T00:00:00.000000Z",
    });
    // `apply` is gated as a WHOLE on the embedding replay config (routing.ts),
    // even for a deterministic action -- the fixture must still exist and be
    // valid (a merge on a DIFFERENT proposal in the same process could need
    // it), it's just not consumed for THIS action.
    const result = spawnFrontDoor(
      ["consolidate", "apply", "abcd1234ef56", "--db-path", ws.dbPath],
      {
        MIRROR_TS_EXTERNAL_ROUTES: "1",
        MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY: writeValidEmbeddingFixture(ws),
      },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /✓ Updated identity: ego\/behavior/);
    assert.match(result.stdout, /marked as accepted/);
  } finally {
    ws.cleanup();
  }
});

test("front door `consolidate apply` (identity_update) REFUSES a non-allowlisted layer, no write, exit 1", () => {
  const ws = cultivationDbCopy();
  try {
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "identity_update",
      proposal: "An injected pattern.",
      sourceMemoryIds: ["m1"],
      targetLayer: "persona",
      targetKey: "profile",
      createdAt: "2026-01-15T00:00:00.000000Z",
    });
    const result = spawnFrontDoor(
      ["consolidate", "apply", "abcd1234ef56", "--db-path", ws.dbPath],
      {
        MIRROR_TS_EXTERNAL_ROUTES: "1",
        MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY: writeValidEmbeddingFixture(ws),
      },
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Refusing identity_update to layer 'persona': not in the consolidation allowlist/,
    );
    assert.equal(consolidationStatus(ws.dbPath, "abcd1234ef56"), "pending");
  } finally {
    ws.cleanup();
  }
});

test("front door `consolidate apply` without the DS7.US3 replay gate routes to Python, per the front-door log", () => {
  const ws = cultivationDbCopy();
  try {
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "identity_update",
      proposal: "An injected pattern.",
      sourceMemoryIds: ["m1"],
      targetLayer: "persona",
      targetKey: "profile",
      createdAt: "2026-01-15T00:00:00.000000Z",
    });
    // No env gate set -- routing.ts must send this to Python. The stdout/
    // stderr TEXT is not a reliable discriminator here: Python's own
    // `apply_consolidation_identity_update` carries the identical allowlist
    // message (the port is byte-exact), so both engines legitimately produce
    // the same refusal. The routing DECISION, recorded in the front-door log,
    // is the reliable signal that TS did not serve this command.
    spawnFrontDoor(["consolidate", "apply", "abcd1234ef56", "--db-path", ws.dbPath]);
    const logContent = readFileSync(join(ws.tmpDir, "front-door.log"), "utf8");
    assert.match(logContent, /\tpython\t/);
  } finally {
    ws.cleanup();
  }
});

// --- consolidate apply (merge, replay-gated embedding) ------------------------

test("front door `consolidate apply` (merge) creates a merged memory via the replay embedding provider", () => {
  const ws = cultivationDbCopy();
  try {
    const db = openDatabaseCopyForWrite(ws.dbPath);
    insertMemory(db, { id: "m1", createdAt: "2026-01-01T00:00:00.000000Z", title: "Original" });
    db.close();
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "merge",
      proposal: "distilled content",
      sourceMemoryIds: ["m1"],
      createdAt: "2026-01-15T00:00:00.000000Z",
    });

    const embeddingPath = join(ws.tmpDir, "embedding.json");
    writeFileSync(
      embeddingPath,
      JSON.stringify({ kind: "embedding", response: { embedding: Array(1536).fill(0.1) } }),
    );

    const result = spawnFrontDoor(
      ["consolidate", "apply", "abcd1234ef56", "--db-path", ws.dbPath],
      {
        MIRROR_TS_EXTERNAL_ROUTES: "1",
        MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY: embeddingPath,
      },
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /✓ Created merged memory: \[\w+\] \[merged\] Original/);

    const readDb = openDatabaseReadOnly(ws.dbPath);
    try {
      const mergedCount = readDb
        .prepare("SELECT COUNT(*) AS n FROM memories WHERE content = ?")
        .get("distilled content");
      assert.equal(mergedCount?.n, 1);
    } finally {
      readDb.close();
    }
  } finally {
    ws.cleanup();
  }
});

// --- shadow list / show / reject / apply --------------------------------------

test("front door `shadow show` prints the empty-layer message", () => {
  const ws = cultivationDbCopy();
  try {
    const result = spawnFrontDoor(["shadow", "show", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(
      result.stdout,
      "The structural shadow layer is empty.\n" +
        "Run 'python -m memory shadow scan' to surface candidate observations.\n",
    );
  } finally {
    ws.cleanup();
  }
});

test("front door `shadow apply` writes the shadow layer and advances readiness", () => {
  const ws = cultivationDbCopy();
  try {
    const db = openDatabaseCopyForWrite(ws.dbPath);
    insertMemory(db, {
      id: "s1",
      layer: "shadow",
      createdAt: "2026-01-01T00:00:00.000000Z",
      readinessState: "candidate",
    });
    db.close();
    insertConsolidation(ws.dbPath, {
      id: "obs12345abc",
      action: "shadow_observation",
      proposal: "A confirmed pattern.",
      sourceMemoryIds: ["s1"],
      targetLayer: "shadow",
      targetKey: "profile",
      createdAt: "2026-01-15T00:00:00.000000Z",
    });

    const result = spawnFrontDoor(["shadow", "apply", "obs12345abc", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /✓ Shadow layer updated: shadow\/profile/);
    assert.match(result.stdout, /accepted and recorded with provenance/);

    const show = spawnFrontDoor(["shadow", "show", "--db-path", ws.dbPath]);
    assert.match(show.stdout, /A confirmed pattern\./);
  } finally {
    ws.cleanup();
  }
});

test("front door `shadow apply` on a non-shadow_observation proposal refuses loudly, exit 1", () => {
  const ws = cultivationDbCopy();
  try {
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "identity_update",
      proposal: "x",
      sourceMemoryIds: ["m1"],
      createdAt: "2026-01-15T00:00:00.000000Z",
    });
    const result = spawnFrontDoor(["shadow", "apply", "abcd1234ef56", "--db-path", ws.dbPath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use mm-consolidate for non-shadow proposals\./);
  } finally {
    ws.cleanup();
  }
});

// --- scan (replay-gated) -------------------------------------------------------

test("front door `consolidate scan` clusters and proposes under the replay gate", () => {
  const ws = cultivationDbCopy();
  try {
    const db = openDatabaseCopyForWrite(ws.dbPath);
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
    db.close();

    const llmPath = join(ws.tmpDir, "llm.json");
    writeFileSync(
      llmPath,
      JSON.stringify({
        kind: "llm",
        responses: {
          consolidation: JSON.stringify({ action: "merge", proposed_content: "distilled" }),
        },
      }),
    );

    const result = spawnFrontDoor(["consolidate", "scan", "--db-path", ws.dbPath], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_CULTIVATION_LLM_REPLAY: llmPath,
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Scanning 2 memories/);
    assert.match(result.stdout, /Found 1 cluster\(s\)/);
    assert.match(result.stdout, /1 proposal\(s\) created with status='pending'\./);

    const readDb = openDatabaseReadOnly(ws.dbPath);
    try {
      assert.equal(readDb.prepare("SELECT COUNT(*) AS n FROM consolidations").get()?.n, 1);
    } finally {
      readDb.close();
    }
  } finally {
    ws.cleanup();
  }
});

test("front door `shadow scan` proposes over the candidate pool under the replay gate", () => {
  const ws = cultivationDbCopy();
  try {
    const db = openDatabaseCopyForWrite(ws.dbPath);
    insertMemory(db, { id: "s1", layer: "shadow", createdAt: "2026-01-01T00:00:00.000000Z" });
    db.close();

    const llmPath = join(ws.tmpDir, "llm.json");
    writeFileSync(
      llmPath,
      JSON.stringify({
        kind: "llm",
        responses: {
          shadow_scan: JSON.stringify([
            { title: "Pattern A", observation: "Recurring avoidance.", memory_ids: ["s1"] },
          ]),
        },
      }),
    );

    const result = spawnFrontDoor(["shadow", "scan", "--db-path", ws.dbPath], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_CULTIVATION_LLM_REPLAY: llmPath,
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Found 1 shadow-candidate memories/);
    assert.match(result.stdout, /1 observation\(s\) created with status='pending'\./);
  } finally {
    ws.cleanup();
  }
});

// --- backup gating + redaction --------------------------------------------------

test("front door cultivation writes are backup-gated: a pre-write backup file is produced", () => {
  const ws = cultivationDbCopy();
  try {
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "identity_update",
      proposal: "x",
      sourceMemoryIds: ["m1"],
      createdAt: "2026-01-15T00:00:00.000000Z",
    });
    spawnFrontDoor(["consolidate", "reject", "abcd1234ef56", "--db-path", ws.dbPath]);
    const backupContent = readFileSync(join(ws.tmpDir, "backups", "frontdoor-pre-write-backup.db"));
    assert.ok(backupContent.length > 0);
  } finally {
    ws.cleanup();
  }
});

test("front door redaction: the front-door log never contains proposal content, rationale, or identity content", () => {
  const ws = cultivationDbCopy();
  try {
    const secretProposal = "SECRET-PROPOSAL-should-never-be-logged";
    const secretRationale = "SECRET-RATIONALE-should-never-be-logged";
    insertConsolidation(ws.dbPath, {
      id: "abcd1234ef56",
      action: "identity_update",
      proposal: secretProposal,
      sourceMemoryIds: ["m1"],
      targetLayer: "ego",
      targetKey: "behavior",
      rationale: secretRationale,
      createdAt: "2026-01-15T00:00:00.000000Z",
    });
    spawnFrontDoor(["consolidate", "apply", "abcd1234ef56", "--db-path", ws.dbPath], {
      MIRROR_TS_EXTERNAL_ROUTES: "1",
      MIRROR_TS_CULTIVATION_EMBEDDING_REPLAY: "/nonexistent-unused-for-this-action.json",
    });
    const logContent = readFileSync(join(ws.tmpDir, "front-door.log"), "utf8");
    assert.doesNotMatch(logContent, new RegExp(secretProposal));
    assert.doesNotMatch(logContent, new RegExp(secretRationale));
    assert.match(logContent, /\bconsolidate\t/);
  } finally {
    ws.cleanup();
  }
});
