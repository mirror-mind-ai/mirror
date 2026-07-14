import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  openDatabaseCopyForWrite,
  openDatabaseReadOnly,
  type WritableDatabase,
  withTransaction,
} from "../../src/db/database.ts";

function tmpCopyPath(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-discipline-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seed(db: WritableDatabase): void {
  db.exec(
    "CREATE TABLE memories (id TEXT PRIMARY KEY, last_accessed_at TEXT);" +
      "CREATE TABLE memory_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "memory_id TEXT NOT NULL REFERENCES memories(id), accessed_at TEXT NOT NULL, " +
      "access_context TEXT);" +
      "INSERT INTO memories (id, last_accessed_at) VALUES ('m1', NULL);",
  );
}

test("opened connections carry Python's pragmas: busy_timeout=30000, foreign_keys=ON", () => {
  const ws = tmpCopyPath();
  try {
    const db = openDatabaseCopyForWrite(ws.dbPath);
    seed(db);
    assert.equal(db.prepare("PRAGMA busy_timeout").get()?.timeout, 30000);
    assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
    db.close();

    const readOnly = openDatabaseReadOnly(ws.dbPath);
    assert.equal(readOnly.prepare("PRAGMA busy_timeout").get()?.timeout, 30000);
    assert.equal(readOnly.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
    readOnly.close();
  } finally {
    ws.cleanup();
  }
});

test("foreign keys are enforced, not assumed: orphan access-log insert is refused", () => {
  const ws = tmpCopyPath();
  try {
    const db = openDatabaseCopyForWrite(ws.dbPath);
    seed(db);
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) " +
            "VALUES ('missing', 't', NULL)",
        )
        .run(),
    );
    db.close();
  } finally {
    ws.cleanup();
  }
});

test("withTransaction rolls back the first statement when a later one throws", () => {
  const ws = tmpCopyPath();
  try {
    const db = openDatabaseCopyForWrite(ws.dbPath);
    seed(db);
    assert.throws(() =>
      withTransaction(db, () => {
        db.prepare(
          "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) " +
            "VALUES ('m1', 't', NULL)",
        ).run();
        throw new Error("boom between statements");
      }),
    );
    const count = db.prepare("SELECT COUNT(*) AS c FROM memory_access_log").get()?.c;
    assert.equal(count, 0);
    db.close();
  } finally {
    ws.cleanup();
  }
});

test("a write under contention waits for busy_timeout and fails atomically, not instantly", () => {
  const ws = tmpCopyPath();
  try {
    const setup = openDatabaseCopyForWrite(ws.dbPath);
    seed(setup);
    setup.close();

    const holder = openDatabaseCopyForWrite(ws.dbPath);
    holder.exec("BEGIN IMMEDIATE");

    const contender = openDatabaseCopyForWrite(ws.dbPath, { busyTimeoutMs: 150 });
    const start = Date.now();
    assert.throws(
      () => contender.prepare("UPDATE memories SET last_accessed_at = 'x' WHERE id = 'm1'").run(),
      /locked|busy/i,
    );
    const waited = Date.now() - start;
    assert.ok(waited >= 100, `expected to wait ~150ms before failing, waited ${waited}ms`);

    holder.exec("ROLLBACK");
    contender.prepare("UPDATE memories SET last_accessed_at = 'x' WHERE id = 'm1'").run();
    const row = contender.prepare("SELECT last_accessed_at FROM memories WHERE id = 'm1'").get();
    assert.equal(row?.last_accessed_at, "x");
    holder.close();
    contender.close();
  } finally {
    ws.cleanup();
  }
});
