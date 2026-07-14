import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { applyJourneySetPath } from "../../src/frontDoor/journeyWriteRoute.ts";
import { createJourney } from "../../src/journey/journeyWrite.ts";

const NOW = "2026-06-23T12:00:00.123000Z";
const LATER = "2026-06-24T00:00:00.000000Z";

function workspace(): { tmpDir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-jwr-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    tmpDir,
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seedJourney(db: WritableDatabase): void {
  db.exec(
    "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
      "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
      "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key))",
  );
  createJourney(db, { id: "j-1", slug: "demo", content: "# Demo", icon: "star" }, NOW);
}

test("applyJourneySetPath normalizes the path and sets project_path, preserving other metadata", () => {
  const ws = workspace();
  const db = openDatabaseCopyForWrite(ws.dbPath);
  try {
    seedJourney(db);
    const resolved = applyJourneySetPath(db, "demo", ws.tmpDir, LATER);
    assert.equal(resolved, realpathSync(ws.tmpDir));
    const row = db.prepare("SELECT updated_at, metadata FROM identity WHERE key = ?").get("demo");
    const meta = JSON.parse(row?.metadata as string);
    assert.equal(meta.project_path, realpathSync(ws.tmpDir));
    assert.equal(meta.icon, "star"); // createJourney's metadata preserved
    assert.equal(row?.updated_at, LATER);
  } finally {
    db.close();
    ws.cleanup();
  }
});

test("applyJourneySetPath throws for a missing journey", () => {
  const ws = workspace();
  const db = openDatabaseCopyForWrite(ws.dbPath);
  try {
    seedJourney(db);
    assert.throws(() => applyJourneySetPath(db, "nope", ws.tmpDir, NOW), /journey not found/);
  } finally {
    db.close();
    ws.cleanup();
  }
});
