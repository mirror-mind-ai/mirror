import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { createMemoryRow, getMemorySourceForMerge } from "../../src/memory/memoryWrite.ts";
import { createMemoriesTable, insertMemory } from "../helpers/cultivationSchema.ts";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-memory-write-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createMemoriesTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("createMemoryRow inserts every column with the documented defaults", () => {
  const { db, cleanup } = tempDb();
  try {
    createMemoryRow(db, {
      id: "m1",
      memoryType: "insight",
      layer: "ego",
      title: "T",
      content: "C",
      createdAt: "2026-01-01T00:00:00.000000Z",
      embedding: new Uint8Array([1, 2, 3, 4]),
    });
    const row = db.prepare("SELECT * FROM memories WHERE id = ?").get("m1");
    assert.equal(row?.conversation_id, null);
    assert.equal(row?.context, null);
    assert.equal(row?.journey, null);
    assert.equal(row?.persona, null);
    assert.equal(row?.tags, null);
    assert.equal(row?.relevance_score, 1.0);
    assert.equal(row?.metadata, null);
    assert.equal(row?.use_count, 0);
    assert.equal(row?.readiness_state, "observed");
    assert.equal(row?.last_accessed_at, null);
    assert.deepEqual(Array.from(row?.embedding as Uint8Array), [1, 2, 3, 4]);
  } finally {
    db.close();
    cleanup();
  }
});

test("createMemoryRow accepts every override explicitly", () => {
  const { db, cleanup } = tempDb();
  try {
    createMemoryRow(db, {
      id: "m2",
      conversationId: null,
      memoryType: "decision",
      layer: "self",
      title: "T2",
      content: "C2",
      context: "ctx",
      journey: "j1",
      persona: "writer",
      tags: JSON.stringify(["a", "b"]),
      createdAt: "2026-01-02T00:00:00.000000Z",
      relevanceScore: 0.5,
      embedding: new Uint8Array([9, 9, 9, 9]),
      metadata: JSON.stringify({ x: 1 }),
      useCount: 3,
      readinessState: "candidate",
    });
    const row = db.prepare("SELECT * FROM memories WHERE id = ?").get("m2");
    assert.equal(row?.context, "ctx");
    assert.equal(row?.journey, "j1");
    assert.equal(row?.persona, "writer");
    assert.equal(row?.tags, JSON.stringify(["a", "b"]));
    assert.equal(row?.relevance_score, 0.5);
    assert.equal(row?.metadata, JSON.stringify({ x: 1 }));
    assert.equal(row?.use_count, 3);
    assert.equal(row?.readiness_state, "candidate");
  } finally {
    db.close();
    cleanup();
  }
});

test("getMemorySourceForMerge returns memory_type/layer/title/journey, and null when absent", () => {
  const { db, cleanup } = tempDb();
  try {
    insertMemory(db, {
      id: "m1",
      createdAt: "2026-01-01T00:00:00.000000Z",
      memoryType: "insight",
      layer: "ego",
      title: "Original",
      journey: "journey-a",
    });
    assert.deepEqual(getMemorySourceForMerge(db, "m1"), {
      memory_type: "insight",
      layer: "ego",
      title: "Original",
      journey: "journey-a",
    });
    assert.equal(getMemorySourceForMerge(db, "missing"), null);
  } finally {
    db.close();
    cleanup();
  }
});
