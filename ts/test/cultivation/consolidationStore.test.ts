import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type ConsolidationRow,
  createConsolidation,
  getConsolidation,
  getMemoriesWithEmbeddingsForCultivation,
  getShadowCandidateMemories,
  listConsolidations,
  resolveProposalByIdOrPrefix,
  updateConsolidationStatus,
  updateMemoryReadinessState,
} from "../../src/cultivation/consolidationStore.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  createConsolidationsTable,
  createMemoriesTable,
  insertMemory,
} from "../helpers/cultivationSchema.ts";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-consolidation-store-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createMemoriesTable(db);
  createConsolidationsTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function makeConsolidation(overrides: Partial<ConsolidationRow> = {}): ConsolidationRow {
  return {
    id: "c1",
    action: "identity_update",
    proposal: "A pattern worth integrating.",
    result: null,
    source_memory_ids: JSON.stringify(["m1", "m2"]),
    target_layer: "ego",
    target_key: "behavior",
    rationale: "Recurring pattern across conversations.",
    status: "pending",
    created_at: "2026-01-01T00:00:00.000000Z",
    reviewed_at: null,
    ...overrides,
  };
}

function floatsToBytes(values: readonly number[]): Uint8Array {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => {
    buffer.writeFloatLE(value, index * 4);
  });
  return buffer;
}

test("createConsolidation + getConsolidation round-trip every column", () => {
  const { db, cleanup } = tempDb();
  try {
    const row = makeConsolidation();
    createConsolidation(db, row);
    assert.deepEqual(getConsolidation(db, "c1"), row);
    assert.equal(getConsolidation(db, "missing"), null);
  } finally {
    db.close();
    cleanup();
  }
});

test("updateConsolidationStatus: passing null result preserves the existing result (COALESCE)", () => {
  const { db, cleanup } = tempDb();
  try {
    createConsolidation(db, makeConsolidation({ result: "original result text" }));
    updateConsolidationStatus(db, "c1", "rejected", null, "2026-01-02T00:00:00.000000Z");
    const after = getConsolidation(db, "c1");
    assert.equal(after?.status, "rejected");
    assert.equal(after?.result, "original result text");
    assert.equal(after?.reviewed_at, "2026-01-02T00:00:00.000000Z");
  } finally {
    db.close();
    cleanup();
  }
});

test("updateConsolidationStatus: passing a result overwrites it", () => {
  const { db, cleanup } = tempDb();
  try {
    createConsolidation(db, makeConsolidation({ result: null }));
    updateConsolidationStatus(
      db,
      "c1",
      "accepted",
      "final accepted text",
      "2026-01-02T00:00:00.000000Z",
    );
    const after = getConsolidation(db, "c1");
    assert.equal(after?.status, "accepted");
    assert.equal(after?.result, "final accepted text");
  } finally {
    db.close();
    cleanup();
  }
});

test("listConsolidations orders by created_at DESC, filters by status, and respects limit", () => {
  const { db, cleanup } = tempDb();
  try {
    createConsolidation(
      db,
      makeConsolidation({ id: "c1", created_at: "2026-01-01T00:00:00.000000Z" }),
    );
    createConsolidation(
      db,
      makeConsolidation({
        id: "c2",
        status: "accepted",
        created_at: "2026-01-03T00:00:00.000000Z",
      }),
    );
    createConsolidation(
      db,
      makeConsolidation({ id: "c3", created_at: "2026-01-02T00:00:00.000000Z" }),
    );

    assert.deepEqual(
      listConsolidations(db).map((c) => c.id),
      ["c2", "c3", "c1"],
    );
    assert.deepEqual(
      listConsolidations(db, { status: "pending" }).map((c) => c.id),
      ["c3", "c1"],
    );
    assert.deepEqual(
      listConsolidations(db, { limit: 1 }).map((c) => c.id),
      ["c2"],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("resolveProposalByIdOrPrefix: exact id, unique prefix, first-match-wins (no ambiguous branch), not found", () => {
  const { db, cleanup } = tempDb();
  try {
    createConsolidation(
      db,
      makeConsolidation({ id: "aaaaaaaa-1111", created_at: "2026-01-02T00:00:00.000000Z" }),
    );
    createConsolidation(
      db,
      makeConsolidation({ id: "aaaaaaaa-2222", created_at: "2026-01-01T00:00:00.000000Z" }),
    );

    // Exact id.
    assert.equal(resolveProposalByIdOrPrefix(db, "aaaaaaaa-1111")?.id, "aaaaaaaa-1111");

    // Prefix shared by both -- first-match-wins in `listConsolidations`
    // (created_at DESC) order: aaaaaaaa-1111 sorts first.
    assert.equal(resolveProposalByIdOrPrefix(db, "aaaaaaaa")?.id, "aaaaaaaa-1111");

    // Not found.
    assert.equal(resolveProposalByIdOrPrefix(db, "zzzzzzzz"), null);
  } finally {
    db.close();
    cleanup();
  }
});

test("updateMemoryReadinessState advances only the targeted memory's readiness_state", () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "m1",
      createdAt: "2026-01-01T00:00:00.000000Z",
      readinessState: "candidate",
    });
    insertMemory(db, {
      id: "m2",
      createdAt: "2026-01-01T00:00:00.000000Z",
      readinessState: "candidate",
    });
    updateMemoryReadinessState(db, "m1", "acknowledged");
    const rows = db.prepare("SELECT id, readiness_state FROM memories ORDER BY id").all();
    assert.deepEqual(
      rows.map((r) => [r.id, r.readiness_state]),
      [
        ["m1", "acknowledged"],
        ["m2", "candidate"],
      ],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("getMemoriesWithEmbeddingsForCultivation: only embedded memories, DESC order, journey/layer filters pushed to SQL", () => {
  const { db, cleanup } = tempDb();
  try {
    const emb = floatsToBytes([1, 0, 0, 0]);
    insertMemory(db, {
      id: "m1",
      createdAt: "2026-01-01T00:00:00.000000Z",
      embedding: emb,
      journey: "journey-a",
      layer: "ego",
    });
    insertMemory(db, {
      id: "m2",
      createdAt: "2026-01-02T00:00:00.000000Z",
      embedding: emb,
      journey: "journey-b",
      layer: "self",
    });
    insertMemory(db, { id: "m3", createdAt: "2026-01-03T00:00:00.000000Z", embedding: null });

    const all = getMemoriesWithEmbeddingsForCultivation(db);
    assert.deepEqual(
      all.map((m) => m.id),
      ["m2", "m1"],
    );
    assert.equal(all[0].embedding_b64, Buffer.from(emb).toString("base64"));

    assert.deepEqual(
      getMemoriesWithEmbeddingsForCultivation(db, { journey: "journey-a" }).map((m) => m.id),
      ["m1"],
    );
    assert.deepEqual(
      getMemoriesWithEmbeddingsForCultivation(db, { layer: "self" }).map((m) => m.id),
      ["m2"],
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("getShadowCandidateMemories: layer=shadow OR type IN (tension,pattern), readiness filter, DESC, limit", () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "shadow-1",
      layer: "shadow",
      createdAt: "2026-01-01T00:00:00.000000Z",
      readinessState: "observed",
    });
    insertMemory(db, {
      id: "tension-1",
      layer: "ego",
      memoryType: "tension",
      createdAt: "2026-01-02T00:00:00.000000Z",
      readinessState: "candidate",
    });
    insertMemory(db, {
      id: "pattern-1",
      layer: "ego",
      memoryType: "pattern",
      createdAt: "2026-01-03T00:00:00.000000Z",
      readinessState: "acknowledged", // excluded by default readiness states
    });
    insertMemory(db, {
      id: "irrelevant-1",
      layer: "ego",
      memoryType: "insight",
      createdAt: "2026-01-04T00:00:00.000000Z",
      readinessState: "observed",
    });

    assert.deepEqual(
      getShadowCandidateMemories(db).map((m) => m.id),
      ["tension-1", "shadow-1"],
    );
    assert.deepEqual(
      getShadowCandidateMemories(db, { readinessStates: ["acknowledged"] }).map((m) => m.id),
      ["pattern-1"],
    );
    assert.equal(getShadowCandidateMemories(db, { limit: 1 }).length, 1);
  } finally {
    db.close();
    cleanup();
  }
});
