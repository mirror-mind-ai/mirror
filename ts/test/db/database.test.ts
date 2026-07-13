import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { CopyOnlyGuardError } from "../../src/db/copyGuard.ts";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";

function seedTempDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-db-"));
  const path = join(dir, "fixture.db");
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE memories (id TEXT PRIMARY KEY, n INTEGER)");
  const insert = db.prepare("INSERT INTO memories (id, n) VALUES (?, ?)");
  insert.run("a", 1);
  insert.run("b", 2);
  insert.run("c", 3);
  db.close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("openDatabaseReadOnly returns rows in query order", () => {
  const { path, cleanup } = seedTempDb();
  const db = openDatabaseReadOnly(path);
  try {
    const rows = db.prepare("SELECT id, n FROM memories ORDER BY n").all();
    assert.deepEqual(rows, [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
      { id: "c", n: 3 },
    ]);
  } finally {
    db.close();
    cleanup();
  }
});

test("openDatabaseReadOnly get returns a single parameterized row", () => {
  const { path, cleanup } = seedTempDb();
  const db = openDatabaseReadOnly(path);
  try {
    const row = db.prepare("SELECT id, n FROM memories WHERE id = ?").get("b");
    assert.deepEqual(row, { id: "b", n: 2 });
  } finally {
    db.close();
    cleanup();
  }
});

test("openDatabaseReadOnly rejects writes", () => {
  const { path, cleanup } = seedTempDb();
  const db = openDatabaseReadOnly(path);
  try {
    assert.throws(() => db.prepare("INSERT INTO memories (id, n) VALUES (?, ?)").all("d", 4), {
      message: /readonly|read-only|ERR_SQLITE/i,
    });
  } finally {
    db.close();
    cleanup();
  }
});

function tempWriteCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-wp-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("openDatabaseCopyForWrite creates, mutates, and reads a copy under tmp/", () => {
  const { dbPath, cleanup } = tempWriteCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    db.exec("CREATE TABLE memories (id TEXT PRIMARY KEY, use_count INTEGER)");
    db.prepare("INSERT INTO memories (id, use_count) VALUES (?, ?)").run("m1", 1);
    db.prepare("UPDATE memories SET use_count = use_count + 1 WHERE id = ?").run("m1");
    const row = db.prepare("SELECT id, use_count FROM memories WHERE id = ?").get("m1");
    assert.deepEqual(row, { id: "m1", use_count: 2 });
  } finally {
    db.close();
    cleanup();
  }
});

test("openDatabaseCopyForWrite refuses a live memory.db and non-tmp paths", () => {
  assert.throws(() => openDatabaseCopyForWrite("/home/x/.mirror/memory.db"), CopyOnlyGuardError);
  assert.throws(() => openDatabaseCopyForWrite("/home/x/other.db"), CopyOnlyGuardError);
});
