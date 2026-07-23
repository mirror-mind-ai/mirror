import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  applyIdentityUpdate,
  applyMerge,
  applyShadowApply,
  applyShadowCandidate,
  rejectConsolidation,
} from "../../src/cultivation/applyActions.ts";
import {
  type ConsolidationRow,
  createConsolidation,
  getConsolidation,
} from "../../src/cultivation/consolidationStore.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { getIdentityContent, listAllIdentity } from "../../src/identity/identityRead.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { ReplayEmbeddingProvider } from "../../src/providers/embedding.ts";
import {
  createConsolidationsTable,
  createMemoriesTable,
  insertMemory,
} from "../helpers/cultivationSchema.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";
const VALID_EMBEDDING = Array(1536).fill(0.2);

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-apply-actions-"));
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
  const row: ConsolidationRow = {
    id: "c1",
    action: "identity_update",
    proposal: "A recurring pattern worth integrating.",
    result: null,
    source_memory_ids: JSON.stringify(["m1", "m2"]),
    target_layer: "ego",
    target_key: "behavior",
    rationale: "seen across three conversations",
    status: "pending",
    created_at: "2026-01-01T00:00:00.000000Z",
    reviewed_at: null,
    ...overrides,
  };
  return createConsolidation(db, row);
}

function seedSourceMemories(
  db: WritableDatabase,
  ids: string[],
  readinessState = "observed",
): void {
  for (const id of ids) {
    insertMemory(db, { id, createdAt: "2026-01-01T00:00:00.000000Z", readinessState });
  }
}

test("rejectConsolidation sets status=rejected without touching source memories or identity", () => {
  const { db, cleanup } = tempDb();
  try {
    seedConsolidation(db);
    seedSourceMemories(db, ["m1", "m2"]);
    rejectConsolidation(db, "c1", NOW);
    const after = getConsolidation(db, "c1");
    assert.equal(after?.status, "rejected");
    assert.equal(after?.reviewed_at, NOW);
    const rows = db.prepare("SELECT readiness_state FROM memories ORDER BY id").all();
    assert.deepEqual(
      rows.map((r) => r.readiness_state),
      ["observed", "observed"],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("applyIdentityUpdate: allowed target (ego) writes identity, advances readiness, and accepts", () => {
  const { db, cleanup } = tempDb();
  try {
    const consolidation = seedConsolidation(db, { target_layer: "ego", target_key: "behavior" });
    seedSourceMemories(db, ["m1", "m2"]);

    const outcome = applyIdentityUpdate(db, consolidation, consolidation.proposal, {
      id: "new-identity-id",
      nowIso: NOW,
    });

    assert.deepEqual(outcome, {
      kind: "applied",
      targetLayer: "ego",
      targetKey: "behavior",
      sourceMemoryIds: ["m1", "m2"],
    });
    assert.equal(getIdentityContent(db, "ego", "behavior"), consolidation.proposal);
    const rows = db.prepare("SELECT id, readiness_state FROM memories ORDER BY id").all();
    assert.deepEqual(
      rows.map((r) => [r.id, r.readiness_state]),
      [
        ["m1", "acknowledged"],
        ["m2", "acknowledged"],
      ],
    );
    const after = getConsolidation(db, "c1");
    assert.equal(after?.status, "accepted");
    assert.equal(after?.result, consolidation.proposal);
  } finally {
    db.close();
    cleanup();
  }
});

test("applyIdentityUpdate: refused target (shadow) writes NOTHING -- no identity, no readiness, no status change", () => {
  const { db, cleanup } = tempDb();
  try {
    const consolidation = seedConsolidation(db, { target_layer: "shadow", target_key: "profile" });
    seedSourceMemories(db, ["m1", "m2"]);
    const identityBefore = listAllIdentity(db);

    const outcome = applyIdentityUpdate(db, consolidation, consolidation.proposal, {
      id: "would-be-id",
      nowIso: NOW,
    });

    assert.equal(outcome.kind, "refused");
    assert.equal(
      (outcome as { kind: "refused"; message: string }).message,
      "Refusing identity_update to layer 'shadow': not in the consolidation allowlist ['ego', 'self'].",
    );
    // No identity write at all.
    assert.deepEqual(listAllIdentity(db), identityBefore);
    // No readiness advance.
    const rows = db.prepare("SELECT readiness_state FROM memories ORDER BY id").all();
    assert.deepEqual(
      rows.map((r) => r.readiness_state),
      ["observed", "observed"],
    );
    // No consolidation status change -- still pending.
    assert.equal(getConsolidation(db, "c1")?.status, "pending");
  } finally {
    db.close();
    cleanup();
  }
});

test("applyIdentityUpdate: missing target_layer/target_key is reported without any write", () => {
  const { db, cleanup } = tempDb();
  try {
    const consolidation = seedConsolidation(db, { target_layer: null, target_key: null });
    const outcome = applyIdentityUpdate(db, consolidation, consolidation.proposal, {
      id: "x",
      nowIso: NOW,
    });
    assert.deepEqual(outcome, { kind: "missing_target" });
    assert.equal(getConsolidation(db, "c1")?.status, "pending");
  } finally {
    db.close();
    cleanup();
  }
});

test("applyShadowCandidate advances source memories to 'candidate' and accepts", () => {
  const { db, cleanup } = tempDb();
  try {
    const consolidation = seedConsolidation(db, {
      action: "shadow_candidate",
      target_layer: null,
      target_key: null,
    });
    seedSourceMemories(db, ["m1", "m2"]);
    const outcome = applyShadowCandidate(db, consolidation, consolidation.proposal, NOW);
    assert.deepEqual(outcome, { sourceMemoryIds: ["m1", "m2"] });
    const rows = db.prepare("SELECT readiness_state FROM memories ORDER BY id").all();
    assert.deepEqual(
      rows.map((r) => r.readiness_state),
      ["candidate", "candidate"],
    );
    assert.equal(getConsolidation(db, "c1")?.status, "accepted");
  } finally {
    db.close();
    cleanup();
  }
});

test("applyShadowApply creates the shadow/profile row when absent", () => {
  const { db, cleanup } = tempDb();
  try {
    const consolidation = seedConsolidation(db, {
      action: "shadow_observation",
      target_layer: "shadow",
      target_key: "profile",
    });
    seedSourceMemories(db, ["m1", "m2"]);
    const outcome = applyShadowApply(db, consolidation, "A confirmed pattern.", {
      id: "shadow-row-id",
      nowIso: NOW,
    });
    assert.deepEqual(outcome, { targetKey: "profile", sourceMemoryIds: ["m1", "m2"] });
    assert.equal(getIdentityContent(db, "shadow", "profile"), "A confirmed pattern.");
    const rows = db.prepare("SELECT readiness_state FROM memories ORDER BY id").all();
    assert.deepEqual(
      rows.map((r) => r.readiness_state),
      ["acknowledged", "acknowledged"],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("applyShadowApply appends with the \\n\\n---\\n\\n separator when a shadow row already exists", () => {
  const { db, cleanup } = tempDb();
  try {
    upsertIdentity(
      db,
      {
        id: "seed",
        layer: "shadow",
        key: "profile",
        content: "Existing confirmed pattern.",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );
    const consolidation = seedConsolidation(db, {
      action: "shadow_observation",
      target_layer: "shadow",
      target_key: "profile",
    });
    applyShadowApply(db, consolidation, "A newly confirmed pattern.", {
      id: "unused",
      nowIso: NOW,
    });
    assert.equal(
      getIdentityContent(db, "shadow", "profile"),
      "Existing confirmed pattern.\n\n---\n\nA newly confirmed pattern.",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("applyShadowApply HARDCODES layer='shadow' regardless of any layer-like value in the proposal", () => {
  const { db, cleanup } = tempDb();
  try {
    // Even if target_layer were somehow something else entirely, the write
    // must land on shadow -- the function never reads consolidation.target_layer.
    const consolidation = seedConsolidation(db, {
      action: "shadow_observation",
      target_layer: "persona", // adversarial: not 'shadow', must be ignored
      target_key: "profile",
    });
    applyShadowApply(db, consolidation, "content", { id: "x", nowIso: NOW });
    assert.equal(getIdentityContent(db, "shadow", "profile"), "content");
    assert.equal(getIdentityContent(db, "persona", "profile"), null);
  } finally {
    db.close();
    cleanup();
  }
});

test("applyShadowApply defaults target_key to 'profile' when absent", () => {
  const { db, cleanup } = tempDb();
  try {
    const consolidation = seedConsolidation(db, {
      action: "shadow_observation",
      target_layer: "shadow",
      target_key: null,
    });
    const outcome = applyShadowApply(db, consolidation, "content", { id: "x", nowIso: NOW });
    assert.equal(outcome.targetKey, "profile");
    assert.equal(getIdentityContent(db, "shadow", "profile"), "content");
  } finally {
    db.close();
    cleanup();
  }
});

// --- applyMerge (Slice B) -----------------------------------------------------

test("applyMerge creates a merged memory titled/layered/journeyed from the FIRST source, marks originals integrated, and accepts", async () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "m1",
      createdAt: "2026-01-01T00:00:00.000000Z",
      memoryType: "insight",
      layer: "self",
      title: "Original insight",
      journey: "journey-a",
      readinessState: "observed",
    });
    insertMemory(db, {
      id: "m2",
      createdAt: "2026-01-01T00:00:00.000000Z",
      readinessState: "observed",
    });
    const consolidation = seedConsolidation(db, {
      action: "merge",
      target_layer: null,
      target_key: null,
      source_memory_ids: JSON.stringify(["m1", "m2"]),
    });
    const provider = new ReplayEmbeddingProvider({
      kind: "embedding",
      response: { embedding: VALID_EMBEDDING },
    });

    const outcome = await applyMerge(db, consolidation, "A distilled, sharper memory.", {
      embeddingProvider: provider,
      id: "merged-id",
      nowIso: NOW,
    });

    assert.deepEqual(outcome, {
      kind: "merged",
      mergedMemoryId: "merged-id",
      sourceMemoryIds: ["m1", "m2"],
    });

    const merged = db.prepare("SELECT * FROM memories WHERE id = ?").get("merged-id");
    assert.equal(merged?.title, "[merged] Original insight");
    assert.equal(merged?.memory_type, "insight");
    assert.equal(merged?.layer, "self");
    assert.equal(merged?.journey, "journey-a");
    assert.equal(merged?.content, "A distilled, sharper memory.");
    assert.equal(merged?.context, "Merged from: m1, m2");
    assert.equal(merged?.relevance_score, 1.0);
    assert.ok(merged?.embedding instanceof Uint8Array);
    assert.ok(JSON.parse(merged?.metadata as string).embedding_model);

    const sourceRows = db
      .prepare("SELECT id, readiness_state FROM memories WHERE id IN ('m1','m2') ORDER BY id")
      .all();
    assert.deepEqual(
      sourceRows.map((r) => [r.id, r.readiness_state]),
      [
        ["m1", "integrated"],
        ["m2", "integrated"],
      ],
    );
    // The merged memory itself must stay 'observed' -- only sources transition.
    assert.equal(merged?.readiness_state, "observed");

    assert.equal(getConsolidation(db, "c1")?.status, "accepted");
    assert.equal(getConsolidation(db, "c1")?.result, "A distilled, sharper memory.");
  } finally {
    db.close();
    cleanup();
  }
});

test("applyMerge reports source_not_found and writes nothing when the first source memory is missing", async () => {
  const { db, cleanup } = tempDb();
  try {
    const consolidation = seedConsolidation(db, {
      action: "merge",
      source_memory_ids: JSON.stringify(["missing-id"]),
    });
    const provider = new ReplayEmbeddingProvider({
      kind: "embedding",
      response: { embedding: VALID_EMBEDDING },
    });

    const outcome = await applyMerge(db, consolidation, "content", {
      embeddingProvider: provider,
      id: "would-be-id",
      nowIso: NOW,
    });

    assert.deepEqual(outcome, { kind: "source_not_found" });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memories").get()?.n, 0);
    assert.equal(getConsolidation(db, "c1")?.status, "pending");
  } finally {
    db.close();
    cleanup();
  }
});
