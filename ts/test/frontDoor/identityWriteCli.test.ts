import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "../helpers/identitySchema.ts";

function identityDbCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fdcli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function frontDoor(dbPath: string, args: string[]): { status: number | null; stdout: string } {
  return spawnFrontDoor([...args, "--db-path", dbPath]);
}

test("front door `identity set` writes to the live DB via TS (create, then update)", () => {
  const { dbPath, cleanup } = identityDbCopy();
  try {
    const created = frontDoor(dbPath, ["identity", "set", "ego", "probe", "--content", "# One"]);
    assert.equal(created.status, 0);
    assert.match(created.stdout, /ego\/probe created/);

    const updated = frontDoor(dbPath, ["identity", "set", "ego", "probe", "--content", "# Two"]);
    assert.equal(updated.status, 0);
    assert.match(updated.stdout, /ego\/probe updated/);

    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get("ego", "probe");
    db.close();
    assert.equal(row?.content, "# Two");
    // The pre-write backup was taken under the home's backups/ convention.
    assert.ok(existsSync(join(dbPath, "..", "backups", "frontdoor-pre-write-backup.db")));
  } finally {
    cleanup();
  }
});

test("front door rejects an empty `identity set` content without writing", () => {
  const { dbPath, cleanup } = identityDbCopy();
  try {
    const result = frontDoor(dbPath, ["identity", "set", "ego", "probe", "--content", "   "]);
    assert.equal(result.status, 1);
    const db = openDatabaseReadOnly(dbPath);
    const count = db.prepare("SELECT COUNT(*) AS c FROM identity").get()?.c;
    db.close();
    assert.equal(count, 0);
  } finally {
    cleanup();
  }
});
