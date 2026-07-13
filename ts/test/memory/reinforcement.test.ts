import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { logAccess, logUse } from "../../src/memory/reinforcement.ts";

const NOW_ISO = "2026-06-23T12:00:00.123456Z";

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-reinf-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seed(db: WritableDatabase): void {
  db.exec("CREATE TABLE memories (id TEXT PRIMARY KEY, last_accessed_at TEXT, use_count INTEGER)");
  db.exec(
    "CREATE TABLE memory_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id TEXT, accessed_at TEXT, access_context TEXT)",
  );
  db.prepare("INSERT INTO memories (id, last_accessed_at, use_count) VALUES (?, ?, ?)").run(
    "m1",
    "2020-01-01T00:00:00",
    3,
  );
}

test("logAccess appends an access-log row and caches last_accessed_at", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    logAccess(db, "m1", NOW_ISO, "retrieval");
    assert.equal(
      db.prepare("SELECT last_accessed_at FROM memories WHERE id = ?").get("m1")?.last_accessed_at,
      NOW_ISO,
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT memory_id, accessed_at, access_context FROM memory_access_log WHERE memory_id = ?",
        )
        .get("m1"),
      { memory_id: "m1", accessed_at: NOW_ISO, access_context: "retrieval" },
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("logAccess stores a null context", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    logAccess(db, "m1", NOW_ISO, null);
    assert.equal(
      db.prepare("SELECT access_context FROM memory_access_log WHERE memory_id = ?").get("m1")
        ?.access_context,
      null,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("logUse increments use_count by one", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    seed(db);
    logUse(db, "m1");
    assert.equal(db.prepare("SELECT use_count FROM memories WHERE id = ?").get("m1")?.use_count, 4);
  } finally {
    db.close();
    cleanup();
  }
});
