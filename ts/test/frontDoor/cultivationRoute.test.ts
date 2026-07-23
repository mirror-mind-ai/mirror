import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type ConsolidationRow,
  createConsolidation,
  getConsolidation,
} from "../../src/cultivation/consolidationStore.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  resolveProposalForReview,
  runConsolidateApply,
  runReject,
  runShadowApply,
} from "../../src/frontDoor/cultivationRoute.ts";
import { getIdentityContent } from "../../src/identity/identityRead.ts";
import { ReplayEmbeddingProvider } from "../../src/providers/embedding.ts";
import {
  createConsolidationsTable,
  createMemoriesTable,
  insertMemory,
} from "../helpers/cultivationSchema.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";
const VALID_EMBEDDING = Array(1536).fill(0.3);

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-cultivation-route-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createMemoriesTable(db);
  createConsolidationsTable(db);
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedConsolidation(
  db: WritableDatabase,
  overrides: Partial<ConsolidationRow> = {},
): ConsolidationRow {
  return createConsolidation(db, {
    id: "c1",
    action: "identity_update",
    proposal: "A pattern.",
    result: null,
    source_memory_ids: JSON.stringify(["m1"]),
    target_layer: "ego",
    target_key: "behavior",
    rationale: null,
    status: "pending",
    created_at: "2026-01-01T00:00:00.000000Z",
    reviewed_at: null,
    ...overrides,
  });
}

test("resolveProposalForReview: not_found, already_reviewed, pending", () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, { id: "c1", status: "accepted" });
    seedConsolidation(db, { id: "c2", status: "pending" });
    assert.deepEqual(resolveProposalForReview(db, "zzz"), { kind: "not_found", proposalId: "zzz" });
    assert.equal(resolveProposalForReview(db, "c1").kind, "already_reviewed");
    assert.equal(resolveProposalForReview(db, "c2").kind, "pending");
  } finally {
    db.close();
    cleanup();
  }
});

test("runReject: rejects a pending proposal and passes through not_found/already_reviewed", () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, { id: "c1" });
    seedConsolidation(db, { id: "c2", status: "rejected" });

    const rejected = runReject(db, "c1", NOW);
    assert.equal(rejected.kind, "rejected");
    assert.equal(getConsolidation(db, "c1")?.status, "rejected");

    assert.equal(runReject(db, "zzz", NOW).kind, "not_found");
    assert.equal(runReject(db, "c2", NOW).kind, "already_reviewed");
  } finally {
    db.close();
    cleanup();
  }
});

test("runConsolidateApply: identity_update applies through the allowlist", async () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, { target_layer: "ego", target_key: "behavior" });
    const outcome = await runConsolidateApply(
      db,
      "c1",
      null,
      { identityId: "id1", mergeMemoryId: "unused", nowIso: NOW },
      new ReplayEmbeddingProvider({ kind: "embedding", response: { embedding: VALID_EMBEDDING } }),
    );
    assert.equal(outcome.kind, "applied");
    assert.equal(getIdentityContent(db, "ego", "behavior"), "A pattern.");
  } finally {
    db.close();
    cleanup();
  }
});

test("runConsolidateApply: identity_update refused (non-allowlisted layer) writes nothing", async () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, { target_layer: "shadow", target_key: "profile" });
    const outcome = await runConsolidateApply(
      db,
      "c1",
      null,
      { identityId: "id1", mergeMemoryId: "unused", nowIso: NOW },
      new ReplayEmbeddingProvider({ kind: "embedding", response: { embedding: VALID_EMBEDDING } }),
    );
    assert.equal(outcome.kind, "identity_refused");
    assert.equal(getIdentityContent(db, "shadow", "profile"), null);
    assert.equal(getConsolidation(db, "c1")?.status, "pending");
  } finally {
    db.close();
    cleanup();
  }
});

test("runConsolidateApply: merge creates a memory via the embedding provider", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, { id: "m1", createdAt: "2026-01-01T00:00:00.000000Z", title: "Original" });
    seedConsolidation(db, { action: "merge", target_layer: null, target_key: null });
    const outcome = await runConsolidateApply(
      db,
      "c1",
      "distilled content",
      { identityId: "unused", mergeMemoryId: "merged1", nowIso: NOW },
      new ReplayEmbeddingProvider({ kind: "embedding", response: { embedding: VALID_EMBEDDING } }),
    );
    assert.equal(outcome.kind, "applied");
    assert.ok(outcome.kind === "applied" && outcome.merge?.mergedMemoryId === "merged1");
    const merged = db.prepare("SELECT content FROM memories WHERE id = ?").get("merged1");
    assert.equal(merged?.content, "distilled content");
  } finally {
    db.close();
    cleanup();
  }
});

test("runConsolidateApply: merge with a missing source memory reports merge_source_not_found, writes nothing", async () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, { action: "merge", source_memory_ids: JSON.stringify(["missing"]) });
    const outcome = await runConsolidateApply(
      db,
      "c1",
      null,
      { identityId: "unused", mergeMemoryId: "merged1", nowIso: NOW },
      new ReplayEmbeddingProvider({ kind: "embedding", response: { embedding: VALID_EMBEDDING } }),
    );
    assert.deepEqual(outcome, { kind: "merge_source_not_found" });
    assert.equal(getConsolidation(db, "c1")?.status, "pending");
  } finally {
    db.close();
    cleanup();
  }
});

test("runConsolidateApply: shadow_candidate advances readiness and accepts", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "m1",
      createdAt: "2026-01-01T00:00:00.000000Z",
      readinessState: "observed",
    });
    seedConsolidation(db, { action: "shadow_candidate", target_layer: null, target_key: null });
    const outcome = await runConsolidateApply(
      db,
      "c1",
      null,
      { identityId: "unused", mergeMemoryId: "unused", nowIso: NOW },
      new ReplayEmbeddingProvider({ kind: "embedding", response: { embedding: VALID_EMBEDDING } }),
    );
    assert.equal(outcome.kind, "applied");
    const row = db.prepare("SELECT readiness_state FROM memories WHERE id = ?").get("m1");
    assert.equal(row?.readiness_state, "candidate");
  } finally {
    db.close();
    cleanup();
  }
});

test("runConsolidateApply: an unrecognized action still marks accepted (Python's silent fallthrough), no other effect", async () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, { action: "shadow_observation", target_layer: null, target_key: null });
    const outcome = await runConsolidateApply(
      db,
      "c1",
      null,
      { identityId: "unused", mergeMemoryId: "unused", nowIso: NOW },
      new ReplayEmbeddingProvider({ kind: "embedding", response: { embedding: VALID_EMBEDDING } }),
    );
    assert.equal(outcome.kind, "applied");
    assert.equal(getConsolidation(db, "c1")?.status, "accepted");
  } finally {
    db.close();
    cleanup();
  }
});

test("runConsolidateApply: not_found / already_reviewed pass through", async () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, { id: "c1", status: "rejected" });
    const provider = new ReplayEmbeddingProvider({
      kind: "embedding",
      response: { embedding: VALID_EMBEDDING },
    });
    assert.equal(
      (
        await runConsolidateApply(
          db,
          "zzz",
          null,
          { identityId: "x", mergeMemoryId: "y", nowIso: NOW },
          provider,
        )
      ).kind,
      "not_found",
    );
    assert.equal(
      (
        await runConsolidateApply(
          db,
          "c1",
          null,
          { identityId: "x", mergeMemoryId: "y", nowIso: NOW },
          provider,
        )
      ).kind,
      "already_reviewed",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("runShadowApply: wrong_action refuses a non-shadow_observation proposal", () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, { action: "identity_update" });
    const outcome = runShadowApply(db, "c1", null, { id: "sid", nowIso: NOW });
    assert.equal(outcome.kind, "wrong_action");
  } finally {
    db.close();
    cleanup();
  }
});

test("runShadowApply: applies a shadow_observation, hardcoding the shadow layer", () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db, {
      action: "shadow_observation",
      target_layer: "shadow",
      target_key: "profile",
      proposal: "content",
    });
    const outcome = runShadowApply(db, "c1", null, { id: "sid", nowIso: NOW });
    assert.equal(outcome.kind, "applied");
    assert.equal(getIdentityContent(db, "shadow", "profile"), "content");
  } finally {
    db.close();
    cleanup();
  }
});
