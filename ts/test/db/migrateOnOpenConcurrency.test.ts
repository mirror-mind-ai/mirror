import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { sha256File } from "../../src/db/backupGate.ts";
import { bootstrapDatabase } from "../../src/db/bootstrap.ts";
import { openDatabaseReadOnly } from "../../src/db/database.ts";
import { ensureMigratedOnOpen, migrationBackupPathFor } from "../../src/db/migrateOnOpen.ts";
import { restoreFromBackup } from "../../src/frontDoor/liveBackup.ts";
import { createJourney } from "../../src/journey/journeyWrite.ts";
import { regressToPre017 } from "../helpers/legacyDb.ts";

const NOW = "2026-01-01T00:00:00Z";
const WORKER = join(import.meta.dirname, "migrateOnOpenConcurrencyWorker.ts");
const CONCURRENT_PROCESSES = 8;

/** A bootstrapped DB with a child journey (parent in JSON only), rolled back to
 * the pre-017 legacy state so exactly one migration is pending. */
function buildLegacyDb(dir: string): string {
  const dbPath = join(dir, "memory.db");
  const db = bootstrapDatabase(dbPath);
  createJourney(
    db,
    {
      id: "j-child",
      slug: "child",
      content: "# Child\n**Status:** active",
      parentJourney: "parent",
    },
    NOW,
  );
  db.close();
  regressToPre017(dbPath);
  return dbPath;
}

function runWorker(
  dbPath: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, dbPath], {
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function migrationIds(dbPath: string): string[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return (db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
      (row) => row.id,
    );
  } finally {
    db.close();
  }
}

function parentColumn(dbPath: string, key: string): string | null {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const row = db.prepare("SELECT parent_journey FROM identity WHERE key = ?").get(key) as
      | { parent_journey: string | null }
      | undefined;
    return row ? row.parent_journey : null;
  } finally {
    db.close();
  }
}

// A6 — N real concurrent processes migrate-on-opening the same legacy DB.
test("N concurrent processes migrate-on-open the same legacy DB: exactly one migrates, no double-apply, no double-backup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-moo-race-"));
  try {
    const dbPath = buildLegacyDb(dir);

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_PROCESSES }, () => runWorker(dbPath)),
    );

    for (const result of results) {
      assert.equal(result.code, 0, `worker failed: ${result.stderr}`);
    }
    const outcomes = results.map((result) => result.stdout);
    const migratedCount = outcomes.filter((outcome) => outcome === "migrated").length;
    assert.equal(
      migratedCount,
      1,
      `exactly one process should apply the migration; got ${JSON.stringify(outcomes)}`,
    );

    // Final state is correct and uncorrupted regardless of who won the race.
    const ids = migrationIds(dbPath);
    assert.ok(ids.includes("017_journey_parent_column"), "017 applied once");
    assert.equal(new Set(ids).size, ids.length, "no duplicate _migrations rows");
    assert.equal(parentColumn(dbPath, "child"), "parent", "column backfilled from JSON");
    assert.ok(existsSync(migrationBackupPathFor(dbPath)), "the single migration took a backup");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A6 — crash safety: the pre-migration backup is a valid restore point, and
// migrate-on-open re-applies cleanly after restoring it (the operational runbook
// for a crash between backup and commit).
test("the pre-migration backup captures the pre-017 state and migrate-on-open re-applies after a restore", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-moo-restore-"));
  try {
    const dbPath = buildLegacyDb(dir);

    const first = ensureMigratedOnOpen(dbPath);
    assert.equal(first.migrated, true);
    const backupPath = migrationBackupPathFor(dbPath);
    assert.ok(existsSync(backupPath), "a pre-migration backup was taken");

    // The backup predates the migration: no 017, no column.
    const backup = openDatabaseReadOnly(backupPath);
    try {
      const ids = (backup.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
        (row) => row.id,
      );
      assert.ok(!ids.includes("017_journey_parent_column"), "backup is pre-migration");
      const cols = (
        backup.prepare('PRAGMA table_info("identity")').all() as { name: string }[]
      ).map((row) => row.name);
      assert.ok(!cols.includes("parent_journey"), "backup has no parent_journey column");
    } finally {
      backup.close();
    }

    // Simulate a crash that lost the migration: restore the pre-migration backup.
    restoreFromBackup({ path: backupPath, sha256: sha256File(backupPath) }, dbPath);
    assert.ok(!migrationIds(dbPath).includes("017_journey_parent_column"), "restored to pre-017");

    // Re-running migrate-on-open resumes cleanly.
    const resumed = ensureMigratedOnOpen(dbPath);
    assert.equal(resumed.migrated, true);
    assert.ok(migrationIds(dbPath).includes("017_journey_parent_column"), "017 re-applied");
    assert.equal(parentColumn(dbPath, "child"), "parent", "column backfilled again");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
