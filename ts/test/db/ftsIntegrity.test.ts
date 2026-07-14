import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { assertFtsIntegrity, FtsIntegrityError } from "../../src/db/ftsIntegrity.ts";

function ftsDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fts-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const db = openDatabaseCopyForWrite(join(tmpDir, "copy.db"));
  db.exec(
    "CREATE TABLE memories (id TEXT PRIMARY KEY, title TEXT, content TEXT, context TEXT);" +
      "CREATE VIRTUAL TABLE memories_fts USING fts5(title, content, context, " +
      "content=memories, content_rowid=rowid);" +
      "CREATE TRIGGER memories_fts_ai AFTER INSERT ON memories BEGIN " +
      "INSERT INTO memories_fts(rowid, title, content, context) " +
      "VALUES (new.rowid, new.title, new.content, COALESCE(new.context, '')); END;",
  );
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("assertFtsIntegrity passes for a consistent external-content FTS index", () => {
  const { db, cleanup } = ftsDb();
  try {
    db.prepare("INSERT INTO memories (id, title, content, context) VALUES (?, ?, ?, ?)").run(
      "m1",
      "Alpha",
      "body",
      null,
    );
    assert.doesNotThrow(() => assertFtsIntegrity(db));
  } finally {
    db.close();
    cleanup();
  }
});

test("assertFtsIntegrity is a no-op when the FTS table is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fts-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const db = openDatabaseCopyForWrite(join(tmpDir, "copy.db"));
  db.exec("CREATE TABLE memories (id TEXT PRIMARY KEY)");
  try {
    assert.doesNotThrow(() => assertFtsIntegrity(db));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertFtsIntegrity rejects an unsafe table identifier", () => {
  const { db, cleanup } = ftsDb();
  try {
    assert.throws(() => assertFtsIntegrity(db, "fts; DROP TABLE memories"), FtsIntegrityError);
  } finally {
    db.close();
    cleanup();
  }
});
