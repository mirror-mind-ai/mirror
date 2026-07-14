import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";
import { createJourney } from "../../src/journey/journeyWrite.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "../helpers/identitySchema.ts";

function journeyDbCopy(): { tmpDir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-jwcli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  createJourney(db, { id: "j-1", slug: "demo", content: "# Demo" }, "2026-06-23T12:00:00.000000Z");
  db.close();
  return { tmpDir, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function frontDoor(args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnFrontDoor(args);
}

test("front door `journey set-path` writes the normalized project_path via TS", () => {
  const ws = journeyDbCopy();
  try {
    const result = frontDoor(["journey", "set-path", "demo", ws.tmpDir, "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), realpathSync(ws.tmpDir));

    const db = openDatabaseReadOnly(ws.dbPath);
    const row = db.prepare("SELECT metadata FROM identity WHERE key = ?").get("demo");
    db.close();
    const meta = JSON.parse(row?.metadata as string);
    assert.equal(meta.project_path, realpathSync(ws.tmpDir));
  } finally {
    ws.cleanup();
  }
});

test("front door `journey set-path` on a missing journey exits 1 without writing", () => {
  const ws = journeyDbCopy();
  try {
    const result = frontDoor(["journey", "set-path", "nope", ws.tmpDir, "--db-path", ws.dbPath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /journey 'nope' not found/);
  } finally {
    ws.cleanup();
  }
});
