import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { type BackupRecord, sha256File } from "#db/backupGate.ts";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { backupPathFor, openLiveWriteDatabase, restoreFromBackup } from "#frontDoor/liveBackup.ts";

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

/** One routed write that changes nothing, so the snapshot is the whole effect. */
function snapshotViaLiveWrite(dbPath: string): BackupRecord {
  openLiveWriteDatabase(dbPath).close();
  const path = backupPathFor(dbPath);
  return { path, sha256: sha256File(path) };
}

test("the pre-write snapshot captures committed WAL content that a raw file copy would miss", () => {
  const ws = walDb();
  try {
    // Hold a writer open so the commit below stays in the -wal sidecar.
    const writer = openDatabaseCopyForWrite(ws.dbPath);
    writer.prepare("INSERT INTO identity (id, content) VALUES (?, ?)").run("in-wal", "# WAL");
    assert.ok(existsSync(`${ws.dbPath}-wal`), "test setup: WAL sidecar must exist");

    const backup = snapshotViaLiveWrite(ws.dbPath);
    writer.close();

    const restored = openDatabaseReadOnly(backup.path);
    const row = restored.prepare("SELECT content FROM identity WHERE id = ?").get("in-wal");
    restored.close();
    assert.equal(row?.content, "# WAL");
  } finally {
    ws.cleanup();
  }
});

test("the pre-write snapshot lands under backups/ with owner-only permissions", () => {
  const ws = walDb();
  try {
    const backup = snapshotViaLiveWrite(ws.dbPath);
    assert.match(backup.path, /backups\/frontdoor-pre-write-backup\.db$/);
    if (process.platform !== "win32") {
      assert.equal(statSync(backup.path).mode & 0o777, 0o600);
      assert.equal(statSync(join(backup.path, "..")).mode & 0o777, 0o700);
    }
  } finally {
    ws.cleanup();
  }
});

test("a live write leaves exactly one file in backups/, the fixed one", () => {
  // F21: every writer snapshots into a staging file of its own and promotes
  // it by rename. A staging file that outlives its write is disk space the
  // user never sees -- tens of megabytes each, on a real database.
  const ws = walDb();
  try {
    snapshotViaLiveWrite(ws.dbPath);
    snapshotViaLiveWrite(ws.dbPath);
    assert.deepEqual(readdirSync(dirname(backupPathFor(ws.dbPath))), [
      "frontdoor-pre-write-backup.db",
    ]);
  } finally {
    ws.cleanup();
  }
});

test("a snapshot that cannot be taken aborts the write and leaves nothing behind", () => {
  const ws = walDb();
  try {
    const missing = join(dirname(ws.dbPath), "absent.db");
    assert.throws(() => openLiveWriteDatabase(missing));
    const backups = dirname(backupPathFor(missing));
    assert.deepEqual(existsSync(backups) ? readdirSync(backups) : [], []);
  } finally {
    ws.cleanup();
  }
});

test("restoreFromBackup brings the pre-write state back and clears stale sidecars", () => {
  const ws = walDb();
  try {
    const backup = snapshotViaLiveWrite(ws.dbPath);

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
    const backup = snapshotViaLiveWrite(ws.dbPath);
    const tampered = { ...backup, sha256: "0".repeat(64) };
    assert.throws(() => restoreFromBackup(tampered, ws.dbPath), /hash does not match/);
  } finally {
    ws.cleanup();
  }
});

// --- CV22.DS10.TS5 handoff review, finding N4 --------------------------------
//
// F21's fix accepted one residue: a process killed between its snapshot and
// its rename leaves `backups/<fixed>.<pid>-<hex>.staging`, the size of the
// database, and nothing removed it or reported it. The write gate now sweeps a
// staging file whose writer is gone -- its process no longer runs AND the file
// is older than any snapshot takes -- before taking its own.

/** A pid that ran and has exited: spawnSync returns only after the child is reaped. */
function deadPid(): number {
  const { pid } = spawnSync(process.execPath, ["-e", ""]);
  assert.ok(pid, "test setup: a child process ran");
  return pid as number;
}

function stagingFile(dbPath: string, pid: number, ageMs: number): string {
  const path = `${backupPathFor(dbPath)}.${pid}-${"ab".repeat(6)}.staging`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "a snapshot whose writer was killed");
  const then = (Date.now() - ageMs) / 1000;
  utimesSync(path, then, then);
  return path;
}

test("a write sweeps staging files left by writers that are gone, and nothing else (N4)", () => {
  const ws = walDb();
  try {
    const hour = 60 * 60 * 1000;
    const abandoned = stagingFile(ws.dbPath, deadPid(), hour);
    const recent = stagingFile(ws.dbPath, deadPid(), 1000);
    const ownerAlive = stagingFile(ws.dbPath, process.ppid, hour);
    const unrelated = join(dirname(backupPathFor(ws.dbPath)), "keep-me.staging");
    writeFileSync(unrelated, "not the gate's");

    openLiveWriteDatabase(ws.dbPath).close();

    assert.ok(!existsSync(abandoned), "a dead writer's old staging file is swept");
    assert.ok(existsSync(recent), "a file younger than any snapshot takes is left alone");
    assert.ok(existsSync(ownerAlive), "a live process's staging file is left alone");
    assert.ok(existsSync(unrelated), "a file the gate did not name is left alone");
    assert.ok(existsSync(backupPathFor(ws.dbPath)), "and the write still took its snapshot");
  } finally {
    ws.cleanup();
  }
});
