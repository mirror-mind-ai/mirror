import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BackupGateError, type BackupRecord, sha256File } from "../../src/db/backupGate.ts";
import { openDatabaseCopyForWrite, openDatabaseForWrite } from "../../src/db/database.ts";

function workspace(): { tmpDir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-livewrite-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return { tmpDir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Create a seeded DB via the copy-legal opener, then return a live-named copy + backup. */
function liveDbWithBackup(tmpDir: string): { livePath: string; backup: BackupRecord } {
  const seedPath = join(tmpDir, "seed.db");
  const seeded = openDatabaseCopyForWrite(seedPath);
  seeded.exec("CREATE TABLE t (id TEXT)");
  seeded.close();
  const livePath = join(tmpDir, "memory.db"); // basename the copy guard rejects
  const backupPath = join(tmpDir, "memory.db.backup");
  copyFileSync(seedPath, livePath);
  copyFileSync(seedPath, backupPath);
  return { livePath, backup: { path: backupPath, sha256: sha256File(backupPath) } };
}

test("openDatabaseForWrite opens a live memory.db (with a backup) that the copy guard rejects", () => {
  const ws = workspace();
  try {
    const { livePath, backup } = liveDbWithBackup(ws.tmpDir);
    // The copy guard refuses the live basename...
    assert.throws(() => openDatabaseCopyForWrite(livePath), /memory\.db/);
    // ...but the sanctioned live-write seam allows it with a verified backup.
    const db = openDatabaseForWrite(livePath, backup);
    db.prepare("INSERT INTO t (id) VALUES (?)").run("x");
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM t").get()?.c, 1);
    db.close();
  } finally {
    ws.cleanup();
  }
});

test("openDatabaseForWrite fails closed without a valid backup", () => {
  const ws = workspace();
  try {
    const { livePath, backup } = liveDbWithBackup(ws.tmpDir);
    assert.throws(
      () => openDatabaseForWrite(livePath, undefined as unknown as BackupRecord),
      BackupGateError,
    );
    assert.throws(
      () => openDatabaseForWrite(livePath, { path: backup.path, sha256: "deadbeef" }),
      BackupGateError,
    );
  } finally {
    ws.cleanup();
  }
});
