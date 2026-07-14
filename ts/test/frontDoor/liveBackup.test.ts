import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sha256File } from "../../src/db/backupGate.ts";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";
import { backupPathFor, ensureBackup, restoreFromBackup } from "../../src/frontDoor/liveBackup.ts";

function walDb(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-livebackup-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("CREATE TABLE identity (id TEXT PRIMARY KEY, content TEXT NOT NULL)");
  db.prepare("INSERT INTO identity (id, content) VALUES (?, ?)").run("base", "# Base");
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("ensureBackup captures committed WAL content that a raw file copy would miss", () => {
  const ws = walDb();
  try {
    // Hold a writer open so the commit below stays in the -wal sidecar.
    const writer = openDatabaseCopyForWrite(ws.dbPath);
    writer.prepare("INSERT INTO identity (id, content) VALUES (?, ?)").run("in-wal", "# WAL");
    assert.ok(existsSync(`${ws.dbPath}-wal`), "test setup: WAL sidecar must exist");

    const backup = ensureBackup(ws.dbPath);
    writer.close();

    const restored = openDatabaseReadOnly(backup.path);
    const row = restored.prepare("SELECT content FROM identity WHERE id = ?").get("in-wal");
    restored.close();
    assert.equal(row?.content, "# WAL");
    assert.equal(backup.sha256, sha256File(backup.path));
    assert.equal(backup.path, backupPathFor(ws.dbPath));
  } finally {
    ws.cleanup();
  }
});

test("ensureBackup writes under backups/ with owner-only permissions", () => {
  const ws = walDb();
  try {
    const backup = ensureBackup(ws.dbPath);
    assert.match(backup.path, /backups\/frontdoor-pre-write-backup\.db$/);
    if (process.platform !== "win32") {
      assert.equal(statSync(backup.path).mode & 0o777, 0o600);
      assert.equal(statSync(join(backup.path, "..")).mode & 0o777, 0o700);
    }
  } finally {
    ws.cleanup();
  }
});

test("restoreFromBackup brings the pre-write state back and clears stale sidecars", () => {
  const ws = walDb();
  try {
    const backup = ensureBackup(ws.dbPath);

    const mutator = openDatabaseCopyForWrite(ws.dbPath);
    mutator.prepare("UPDATE identity SET content = ? WHERE id = ?").run("# Corrupted", "base");
    mutator.close();

    restoreFromBackup(backup, ws.dbPath);
    assert.ok(!existsSync(`${ws.dbPath}-wal`));
    assert.ok(!existsSync(`${ws.dbPath}-shm`));

    const db = openDatabaseReadOnly(ws.dbPath);
    const row = db.prepare("SELECT content FROM identity WHERE id = ?").get("base");
    db.close();
    assert.equal(row?.content, "# Base");
  } finally {
    ws.cleanup();
  }
});

test("restoreFromBackup refuses a tampered backup", () => {
  const ws = walDb();
  try {
    const backup = ensureBackup(ws.dbPath);
    const tampered = { ...backup, sha256: "0".repeat(64) };
    assert.throws(() => restoreFromBackup(tampered, ws.dbPath), /hash does not match/);
  } finally {
    ws.cleanup();
  }
});
