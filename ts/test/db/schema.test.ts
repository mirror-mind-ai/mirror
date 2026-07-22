import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { assertFtsIntegrity } from "../../src/db/ftsIntegrity.ts";
import { createSchema } from "../../src/db/schema.ts";
import { buildSchemaInventory, type SchemaInventory } from "../../src/db/schemaInventory.ts";
import { SCHEMA_INVENTORY_SNAPSHOT } from "../../src/db/schemaInventorySnapshot.ts";
import { diffTsInventoryAgainstSnapshot } from "../../src/db/schemaTsDivergence.ts";

function freshDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-schema-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const db = openDatabaseCopyForWrite(join(tmpDir, "fresh.db"));
  createSchema(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Compare a TS-created inventory to the committed Python snapshot through the
 * enumerated TS ⊇ Python divergence (CV22.DS6.US2): the snapshot plus exactly
 * the `identity.parent_journey` column and its index, nothing else. Any
 * unlisted drift, in either direction, is a failure.
 */
function assertMatchesSnapshot(actual: SchemaInventory, expected: SchemaInventory): void {
  const problems = diffTsInventoryAgainstSnapshot(actual, expected);
  assert.deepEqual(
    problems,
    [],
    `schema diverged from the Python snapshot beyond the enumerated TS-only additions:\n${problems.join("\n")}`,
  );
}

// --- Structural parity against the committed Python oracle ---

test("createSchema produces a database structurally identical to the Python snapshot", () => {
  const { db, cleanup } = freshDb();
  try {
    const inventory = buildSchemaInventory(db);
    assertMatchesSnapshot(inventory, SCHEMA_INVENTORY_SNAPSHOT);
  } finally {
    db.close();
    cleanup();
  }
});

// --- Idempotency and populated-DB no-op (QA condition) ---

test("createSchema is idempotent: running it twice does not throw or duplicate objects", () => {
  const { db, cleanup } = freshDb();
  try {
    assert.doesNotThrow(() => createSchema(db));
    const inventory = buildSchemaInventory(db);
    assertMatchesSnapshot(inventory, SCHEMA_INVENTORY_SNAPSHOT);
  } finally {
    db.close();
    cleanup();
  }
});

test("createSchema against a populated database leaves existing data untouched", () => {
  const { db, cleanup } = freshDb();
  try {
    db.prepare("INSERT INTO conversations (id, started_at, interface) VALUES (?, ?, ?)").run(
      "conv-1",
      "2026-07-23T00:00:00Z",
      "cli",
    );
    assert.doesNotThrow(() => createSchema(db));
    assert.deepEqual(
      db.prepare("SELECT id, started_at, interface FROM conversations WHERE id = 'conv-1'").get(),
      { id: "conv-1", started_at: "2026-07-23T00:00:00Z", interface: "cli" },
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM conversations").get()?.c, 1);
  } finally {
    db.close();
    cleanup();
  }
});

// --- FTS functional probe, including diacritic/non-ASCII terms (AI-engineer
// condition) — external-content triggers must reflect writes correctly, and
// the default `unicode61` tokenizer's accent handling must not silently
// diverge. ---

function insertMemory(db: WritableDatabase, id: string, title: string, content: string): void {
  db.prepare(
    "INSERT INTO memories (id, memory_type, title, content, created_at) " +
      "VALUES (?, 'insight', ?, ?, '2026-07-23T00:00:00Z')",
  ).run(id, title, content);
}

function ftsMatches(db: WritableDatabase, query: string): string[] {
  return (
    db
      .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rowid")
      .all(query) as { rowid: number }[]
  ).map((row) => String(row.rowid));
}

test("FTS reflects insert/update/delete on memories, including accented (PT) content", () => {
  const { db, cleanup } = freshDb();
  try {
    // Title is intentionally unaffected by the later UPDATE, so "café" (in
    // the title) remains a legitimate match throughout — the probe checks
    // the CONTENT-only term ("código") to prove the old value is actually
    // dropped, not merely that an unrelated still-present field still hits.
    insertMemory(db, "m1", "Café da manhã", "Uma memória sobre café e código.");
    assertFtsIntegrity(db);

    // Accented term matches with the accent present.
    assert.ok(ftsMatches(db, "café").length === 1, "expected accented query to match");
    // unicode61's default remove_diacritics=1 normalizes common accented
    // Latin characters, so the unaccented query also matches — asserting the
    // observed default behavior explicitly, not merely assuming it.
    assert.ok(
      ftsMatches(db, "cafe").length === 1,
      "expected unaccented query to match via unicode61 default diacritics removal",
    );
    assert.ok(ftsMatches(db, "código").length === 1, "expected content-only term to match");

    db.prepare("UPDATE memories SET content = ? WHERE id = ?").run(
      "Nada a ver com a bebida quente.",
      "m1",
    );
    assertFtsIntegrity(db);
    assert.equal(ftsMatches(db, "código").length, 0, "old content-only term must no longer match");
    assert.equal(
      ftsMatches(db, "café").length,
      1,
      "title match is unaffected by the content update",
    );
    assert.equal(ftsMatches(db, "bebida").length, 1, "updated content must match");

    db.prepare("DELETE FROM memories WHERE id = ?").run("m1");
    assertFtsIntegrity(db);
    assert.equal(ftsMatches(db, "bebida").length, 0, "deleted row must not match");
    assert.equal(ftsMatches(db, "café").length, 0, "deleted row's title must not match either");
  } finally {
    db.close();
    cleanup();
  }
});

// --- CHECK constraint enforcement (database-architect condition) — proves
// the constraint captured only in normalized sql text is actually live, not
// merely present as text. ---

test("CHECK constraint on builder_refinement_stories.status rejects an invalid value", () => {
  const { db, cleanup } = freshDb();
  try {
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO builder_refinement_stories " +
              "(id, journey, display_code, title, status, created_at, updated_at) " +
              "VALUES ('rs-1', 'j', 'RS001', 't', 'bogus', 'now', 'now')",
          )
          .run(),
      /CHECK/i,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("CHECK constraint on builder_refinement_stories.status accepts a valid value", () => {
  const { db, cleanup } = freshDb();
  try {
    assert.doesNotThrow(() =>
      db
        .prepare(
          "INSERT INTO builder_refinement_stories " +
            "(id, journey, display_code, title, status, created_at, updated_at) " +
            "VALUES ('rs-1', 'j', 'RS001', 't', 'draft', 'now', 'now')",
        )
        .run(),
    );
  } finally {
    db.close();
    cleanup();
  }
});

// --- Partial-index enforcement (database-architect condition) ---

test("partial unique index enforces one active exploratory story per journey", () => {
  const { db, cleanup } = freshDb();
  try {
    const insertActive = (id: string) =>
      db
        .prepare(
          "INSERT INTO exploratory_stories (id, journey, status, created_at, updated_at) " +
            "VALUES (?, 'j', 'active', 'now', 'now')",
        )
        .run(id);
    insertActive("story-1");
    assert.throws(() => insertActive("story-2"), /unique/i);

    // A second archived story for the same journey is fine — the index is
    // partial (WHERE status = 'active'), not a blanket per-journey unique.
    assert.doesNotThrow(() =>
      db
        .prepare(
          "INSERT INTO exploratory_stories (id, journey, status, created_at, updated_at) " +
            "VALUES ('story-3', 'j', 'archived', 'now', 'now')",
        )
        .run(),
    );
  } finally {
    db.close();
    cleanup();
  }
});
