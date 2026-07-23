import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "../helpers/identitySchema.ts";

function journeyDbCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journeyupdatecli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function frontDoor(
  dbPath: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  return spawnFrontDoor([...args, "--db-path", dbPath]);
}

test("front door `journey update` creates then updates journey_path via TS, always reporting 'updated'", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  try {
    const created = frontDoor(dbPath, ["journey", "update", "demo", "First path content"]);
    assert.equal(created.status, 0);
    assert.match(created.stderr, /Journey path 'demo' updated\./);

    const updated = frontDoor(dbPath, ["journey", "update", "demo", "Second path content"]);
    assert.equal(updated.status, 0);
    assert.match(updated.stderr, /Journey path 'demo' updated\./);

    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = 'journey_path' AND key = 'demo'")
      .get();
    db.close();
    assert.equal(row?.content, "Second path content");
  } finally {
    cleanup();
  }
});

test("front door `journey update` does not require the journey slug to already exist", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  try {
    const result = frontDoor(dbPath, ["journey", "update", "no-such-journey", "Some content"]);
    assert.equal(result.status, 0);
    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare(
        "SELECT content FROM identity WHERE layer = 'journey_path' AND key = 'no-such-journey'",
      )
      .get();
    db.close();
    assert.equal(row?.content, "Some content");
  } finally {
    cleanup();
  }
});

test("front door `journey update` reads content from stdin when given '-'", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  try {
    const result = spawnFrontDoor(
      ["journey", "update", "demo", "-", "--db-path", dbPath],
      {},
      "Piped content\n",
    );
    assert.equal(result.status, 0);
    const db = openDatabaseReadOnly(dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = 'journey_path' AND key = 'demo'")
      .get();
    db.close();
    assert.equal(row?.content, "Piped content\n");
  } finally {
    cleanup();
  }
});

test("front door `journey update` requires both a slug and content", () => {
  const { dbPath, cleanup } = journeyDbCopy();
  try {
    const result = frontDoor(dbPath, ["journey", "update", "demo"]);
    assert.equal(result.status, 2);
  } finally {
    cleanup();
  }
});
