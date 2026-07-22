import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { bootstrapDatabase } from "../../src/db/bootstrap.ts";
import { openDatabaseForBootstrap } from "../../src/db/database.ts";
import { ensureMigratedOnOpen, migrationBackupPathFor } from "../../src/db/migrateOnOpen.ts";
import { createJourney } from "../../src/journey/journeyWrite.ts";
import { regressToPre017 } from "../helpers/legacyDb.ts";

const NOW = "2026-01-01T00:00:00Z";

function tmpDbPath(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-migrate-on-open-"));
  return {
    dbPath: join(dir, "memory.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function deleteMigrationRow(dbPath: string, id: string): void {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    db.prepare("DELETE FROM _migrations WHERE id = ?").run(id);
  } finally {
    db.close();
  }
}

function migrationIds(dbPath: string): string[] {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    return (db.prepare("SELECT id FROM _migrations ORDER BY id").all() as { id: string }[]).map(
      (row) => row.id,
    );
  } finally {
    db.close();
  }
}

function columnExists(dbPath: string, table: string, column: string): boolean {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    return (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).some(
      (row) => row.name === column,
    );
  } finally {
    db.close();
  }
}

function readParentColumn(dbPath: string, key: string): string | null {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    const row = db.prepare("SELECT parent_journey FROM identity WHERE key = ?").get(key) as
      | { parent_journey: string | null }
      | undefined;
    return row ? row.parent_journey : null;
  } finally {
    db.close();
  }
}

// A1 — migrate-on-open activates the TS-only migration Python cannot apply.
test("migrate-on-open applies pending TS-authored 017 to a legacy DB, backs it up, and backfills the column from JSON", () => {
  const ws = tmpDbPath();
  try {
    const db = bootstrapDatabase(ws.dbPath);
    createJourney(
      db,
      {
        id: "id-child",
        slug: "child",
        content: "# Child\n**Status:** active",
        parentJourney: "parent",
      },
      NOW,
    );
    db.close();
    regressToPre017(ws.dbPath);

    assert.ok(
      !columnExists(ws.dbPath, "identity", "parent_journey"),
      "precondition: column dropped",
    );
    assert.ok(
      !migrationIds(ws.dbPath).includes("017_journey_parent_column"),
      "precondition: 017 pending",
    );
    assert.ok(!existsSync(migrationBackupPathFor(ws.dbPath)), "precondition: no migration backup");

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.migrated, true);
    assert.deepEqual(result.appliedIds, ["017_journey_parent_column"]);
    assert.ok(existsSync(migrationBackupPathFor(ws.dbPath)), "a pre-migration backup was taken");
    assert.ok(columnExists(ws.dbPath, "identity", "parent_journey"), "017 re-created the column");
    assert.ok(migrationIds(ws.dbPath).includes("017_journey_parent_column"), "017 recorded");
    assert.equal(readParentColumn(ws.dbPath, "child"), "parent", "column backfilled from JSON");
  } finally {
    ws.cleanup();
  }
});

// A2 — idempotent: an already-current DB is not re-migrated or backed up.
test("migrate-on-open is a no-op on an already-migrated DB — no re-apply, no backup", () => {
  const ws = tmpDbPath();
  try {
    bootstrapDatabase(ws.dbPath).close();
    const before = migrationIds(ws.dbPath);
    rmSync(migrationBackupPathFor(ws.dbPath), { force: true });

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.migrated, false);
    assert.ok(!existsSync(migrationBackupPathFor(ws.dbPath)), "no backup on a no-op open");
    assert.deepEqual(migrationIds(ws.dbPath), before, "ledger unchanged");
  } finally {
    ws.cleanup();
  }
});

// A5 — a DB behind the Python baseline defers to Python; migrate-on-open declines
// even though a TS-authored migration is also pending.
test("migrate-on-open defers to Python when a required Python migration is missing — no migrate, no backup", () => {
  const ws = tmpDbPath();
  try {
    bootstrapDatabase(ws.dbPath).close();
    regressToPre017(ws.dbPath); // 017 (TS-authored) pending
    deleteMigrationRow(ws.dbPath, "007_create_identity_descriptors"); // and a Python migration pending

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.migrated, false);
    assert.equal(result.deferredToPython, true);
    assert.ok(!existsSync(migrationBackupPathFor(ws.dbPath)), "no backup when deferring to Python");
    assert.ok(
      !columnExists(ws.dbPath, "identity", "parent_journey"),
      "017 was not applied while a Python migration is pending",
    );
    assert.ok(
      !migrationIds(ws.dbPath).includes("007_create_identity_descriptors"),
      "the Python migration was not silently applied by TS",
    );
  } finally {
    ws.cleanup();
  }
});
