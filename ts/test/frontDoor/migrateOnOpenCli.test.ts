import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";
import { migrationBackupPathFor } from "../../src/db/migrateOnOpen.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";
import { frontDoorLogPath } from "../../src/frontDoor/frontDoorLog.ts";
import { createJourney } from "../../src/journey/journeyWrite.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.000000Z";

/** A pre-017 legacy DB copy: identity table with no `parent_journey` column, the
 * migration ledger seeded up to 016 (017 pending), and a child journey whose
 * parent lives only in JSON metadata — the exact state migrate-on-open activates. */
function legacyDbCopy(): { tmpDir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-moo-cli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  db.exec("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const insert = db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, 't')");
  for (const id of KNOWN_MIGRATION_IDS) {
    if (id !== "017_journey_parent_column") insert.run(id);
  }
  createJourney(
    db,
    { id: "j-parent", slug: "parent", content: "# Parent\n**Status:** active" },
    NOW,
  );
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
  return { tmpDir, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("front door read command migrate-on-opens a legacy DB, serves it, and logs the event", () => {
  const ws = legacyDbCopy();
  try {
    const result = spawnFrontDoor(["journeys", "--db-path", ws.dbPath]);

    // The command still serves normally.
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /parent/);
    assert.match(result.stdout, /child/);

    // Migrate-on-open applied 017 and backfilled the column from JSON.
    const db = openDatabaseReadOnly(ws.dbPath);
    try {
      const ledger = (db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map(
        (row) => row.id,
      );
      assert.ok(ledger.includes("017_journey_parent_column"), "017 applied on open");
      const cols = (db.prepare('PRAGMA table_info("identity")').all() as { name: string }[]).map(
        (row) => row.name,
      );
      assert.ok(cols.includes("parent_journey"), "column created on open");
      const child = db
        .prepare("SELECT parent_journey FROM identity WHERE key = ?")
        .get("child") as { parent_journey: string | null };
      assert.equal(child.parent_journey, "parent", "column backfilled from JSON");
    } finally {
      db.close();
    }

    // A pre-migration backup was taken.
    assert.ok(existsSync(migrationBackupPathFor(ws.dbPath)), "pre-migration backup exists");

    // The migration is observable in the redacted front-door log.
    const log = readFileSync(frontDoorLogPath(ws.dbPath), "utf8");
    assert.match(log, /migrate_on_open/);
    assert.match(log, /017_journey_parent_column/);
  } finally {
    ws.cleanup();
  }
});

test("front door second open of a now-current DB does not re-migrate or re-backup", () => {
  const ws = legacyDbCopy();
  try {
    assert.equal(spawnFrontDoor(["journeys", "--db-path", ws.dbPath]).status, 0);
    rmSync(migrationBackupPathFor(ws.dbPath), { force: true });

    const second = spawnFrontDoor(["journeys", "--db-path", ws.dbPath]);

    assert.equal(second.status, 0, second.stderr);
    assert.ok(
      !existsSync(migrationBackupPathFor(ws.dbPath)),
      "no second backup once the DB is already current",
    );
  } finally {
    ws.cleanup();
  }
});
