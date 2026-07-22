import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { MIGRATIONS, runMigrations } from "../../src/db/migrations.ts";
import { createSchema } from "../../src/db/schema.ts";
import { buildSchemaInventory } from "../../src/db/schemaInventory.ts";
import { SCHEMA_INVENTORY_SNAPSHOT } from "../../src/db/schemaInventorySnapshot.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";
import { diffTsInventoryAgainstSnapshot } from "../../src/db/schemaTsDivergence.ts";

function freshDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-migrations-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const db = openDatabaseCopyForWrite(join(tmpDir, "fresh.db"));
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function appliedMigrationIds(db: WritableDatabase): string[] {
  return (db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id);
}

// --- CV22.DS6.US2: migration 017 backfills the parent_journey column ---

test("migration 017 backfills parent_journey from JSON metadata for journey rows only", () => {
  const { db, cleanup } = freshDb();
  try {
    createSchema(db); // modern schema, incl. the parent_journey column (all NULL)
    const insert = db.prepare(
      "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at, metadata, parent_journey) " +
        "VALUES (?, ?, ?, ?, '1.0.0', 't', 't', ?, NULL)",
    );
    // A Python-written child journey: JSON carries the parent, column is NULL.
    insert.run("j1", "journey", "child", "# Child", JSON.stringify({ parent_journey: "root" }));
    // A root journey with no parent, and a non-journey row that must be ignored.
    insert.run("j2", "journey", "root", "# Root", null);
    insert.run("e1", "ego", "behavior", "# Ego", JSON.stringify({ parent_journey: "nope" }));

    runMigrations(db); // 017 runs migrateJourneyParentColumn and backfills

    const parentOf = (key: string) =>
      (
        db.prepare("SELECT parent_journey FROM identity WHERE key = ?").get(key) as {
          parent_journey: string | null;
        }
      ).parent_journey;
    assert.equal(parentOf("child"), "root", "journey child backfilled from JSON");
    assert.equal(parentOf("root"), null, "parentless journey stays NULL");
    assert.equal(parentOf("behavior"), null, "non-journey row is never backfilled");
  } finally {
    db.close();
    cleanup();
  }
});

// --- Track A: fresh-DB ledger completeness (extends TS1) ---

test("runMigrations then createSchema on a fresh DB records exactly the KNOWN_MIGRATION_IDS", () => {
  const { db, cleanup } = freshDb();
  try {
    runMigrations(db);
    createSchema(db);
    const applied = new Set(appliedMigrationIds(db));
    assert.deepEqual([...applied].sort(), [...KNOWN_MIGRATION_IDS].sort());
    assert.equal(applied.size, KNOWN_MIGRATION_IDS.length);
  } finally {
    db.close();
    cleanup();
  }
});

test("MIGRATIONS list matches KNOWN_MIGRATION_IDS order exactly", () => {
  assert.deepEqual(
    MIGRATIONS.map(([id]) => id),
    KNOWN_MIGRATION_IDS,
  );
});

test("fresh DB schema (migrations + createSchema) still matches TS1's committed snapshot (regression guard)", () => {
  const { db, cleanup } = freshDb();
  try {
    runMigrations(db);
    createSchema(db);
    const inventory = buildSchemaInventory(db);
    const problems = diffTsInventoryAgainstSnapshot(inventory, SCHEMA_INVENTORY_SNAPSHOT);
    assert.deepEqual(
      problems,
      [],
      `migrations + createSchema regressed the schema beyond the enumerated TS-only additions:\n${problems.join("\n")}`,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("runMigrations is idempotent: running twice does not throw or duplicate ledger rows", () => {
  const { db, cleanup } = freshDb();
  try {
    runMigrations(db);
    createSchema(db);
    assert.doesNotThrow(() => runMigrations(db));
    const rows = appliedMigrationIds(db);
    const counts = new Map<string, number>();
    for (const id of rows) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of counts) assert.equal(count, 1, `${id} recorded ${count} times`);
  } finally {
    db.close();
    cleanup();
  }
});

// --- Partial-failure resumability ---
//
// migrations.py's module docstring documents the contract: a migration that
// fails leaves earlier migrations committed and recorded, and a retry resumes
// from exactly that point. Proven here via a real partial ledger (no mocking
// needed for this half). The complementary half -- a failing migration's own
// writes are rolled back, not just left uncommitted -- is guaranteed by
// construction: runMigrations wraps each migration in `withTransaction`
// (database.ts), whose rollback-on-throw semantics are already independently
// proven in connectionDiscipline.test.ts ("withTransaction rolls back the
// first statement when a later one throws"). MIGRATIONS is an exported
// `const` (immutable binding), so injecting a mock failure the way the Python
// test monkeypatches its module-level MIGRATIONS is not available here
// without a production signature change -- not worth making for this alone.

test("runMigrations resumes from a partial ledger without reapplying earlier migrations", () => {
  const { db, cleanup } = freshDb();
  try {
    runMigrations(db);
    createSchema(db);

    const prefix = MIGRATIONS.slice(0, 8).map(([id]) => id);
    const placeholders = prefix.map(() => "?").join(",");
    db.prepare(`DELETE FROM _migrations WHERE id NOT IN (${placeholders})`).run(...prefix);
    assert.deepEqual(appliedMigrationIds(db).sort(), [...prefix].sort());

    assert.doesNotThrow(() => runMigrations(db));
    assert.deepEqual(appliedMigrationIds(db).sort(), [...KNOWN_MIGRATION_IDS].sort());
  } finally {
    db.close();
    cleanup();
  }
});
