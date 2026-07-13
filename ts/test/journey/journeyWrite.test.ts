import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { createJourney, journeyMetadata, setProjectPath } from "../../src/journey/journeyWrite.ts";

const NOW = "2026-06-23T12:00:00.123456Z";
const LATER = "2026-06-24T09:30:00.500000Z";

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-jw-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seedIdentity(db: WritableDatabase): void {
  db.exec(
    "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
      "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
      "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key))",
  );
}

test("journeyMetadata keeps only non-empty trimmed fields", () => {
  assert.deepEqual(journeyMetadata({ icon: " star ", parentJourney: "", color: "blue" }), {
    icon: "star",
    color: "blue",
  });
});

test("createJourney inserts an identity row with sorted, non-ASCII metadata JSON", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    createJourney(
      db,
      { id: "j-1", slug: "demo", content: "# Demo", icon: "🚀", color: "blue" },
      NOW,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT id, layer, key, content, version, created_at, updated_at, metadata " +
            "FROM identity WHERE key = ?",
        )
        .get("demo"),
      {
        id: "j-1",
        layer: "journey",
        key: "demo",
        content: "# Demo",
        version: "1.0.0",
        created_at: NOW,
        updated_at: NOW,
        // sort_keys => color before icon; ensure_ascii=False => raw 🚀
        metadata: '{"color": "blue", "icon": "🚀"}',
      },
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("createJourney stores null metadata when no fields are set", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    createJourney(db, { id: "j-1", slug: "bare", content: "# Bare" }, NOW);
    assert.equal(
      db.prepare("SELECT metadata FROM identity WHERE key = ?").get("bare")?.metadata,
      null,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("setProjectPath updates project_path in place and re-serializes with defaults", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seedIdentity(db);
    // create_journey stores sorted JSON: {"icon": "star", "project_path": "/old"}
    createJourney(
      db,
      { id: "j-1", slug: "demo", content: "# Demo", projectPath: "/old", icon: "star" },
      NOW,
    );
    setProjectPath(db, "demo", "/new/resolved", LATER);
    assert.deepEqual(
      db.prepare("SELECT metadata, updated_at FROM identity WHERE key = ?").get("demo"),
      { metadata: '{"icon": "star", "project_path": "/new/resolved"}', updated_at: LATER },
    );
  } finally {
    db.close();
    cleanup();
  }
});
