// Pre-write backup and restore for the front door's sanctioned live writes.
//
// Every routed live write takes a fresh snapshot first; `openDatabaseForWrite`
// refuses to open without a hash-verified record of it. The snapshot is taken
// with `VACUUM INTO` (WAL-correct — see `snapshotDatabaseTo`), stored under the
// mirror home's `backups/` directory (the same convention the Python backup
// tooling uses), and permission-tightened to owner-only.
//
// Overwrite-window semantics, stated plainly: the backup file has a FIXED name
// and is replaced before EVERY write, so it always holds the state immediately
// before the most recent routed write — and nothing older. If a write corrupts
// data and another routed write runs before anyone notices, the corrupted
// state becomes the backed-up state. The backup is a last-write undo, not an
// archive; scheduled archives remain `mm-backup`'s job.
//
// Concurrent writers (CV22.DS10.TS5, finding F21). Until F21 every writer
// removed the fixed file and recreated it in place with `VACUUM INTO`, with no
// coordination. Two writers at the same instant broke each other: the second
// `VACUUM INTO` found the tables the first was still creating ("table
// conversations already exists"), or one removed the file the other was still
// writing ("disk I/O error"), and the losing write was aborted. Claude Code
// runs its two prompt hooks at once and both write, so the Navigator walk lost
// two injections in three prompts; Pi had been losing turns in daily use.
//
// So each writer now snapshots into a staging file of its own, the gate
// verifies THAT file -- which no other writer can touch -- and only then is it
// promoted to the fixed name by an atomic rename. The fixed name keeps its
// meaning (the state before the most recently promoted write) and can no
// longer be observed half-written. Under true concurrency "the most recent
// write" is whichever promoted last; nothing stronger was ever true.

import { randomBytes } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BackupRecord, requireBackup, sha256File } from "#db/backupGate.ts";
import { openDatabaseForWrite, snapshotDatabaseTo, type WritableDatabase } from "#db/database.ts";

const BACKUP_DIR_NAME = "backups";
const BACKUP_FILE_NAME = "frontdoor-pre-write-backup.db";

/** Where the pre-write backup for a given live database lives. */
export function backupPathFor(dbPath: string): string {
  return join(dirname(dbPath), BACKUP_DIR_NAME, BACKUP_FILE_NAME);
}

/**
 * Open the live database for ONE routed write, behind a verified pre-write
 * snapshot. The only sanctioned way to open a live `memory.db` for writing.
 *
 * 1. Snapshot into a staging file unique to this process and call
 *    (WAL-correct via `VACUUM INTO`; owner-only: 0700 dir, 0600 file).
 * 2. The backup gate verifies the staging file's hash, and the database opens.
 * 3. The staging file is promoted to the fixed name by an atomic rename.
 *
 * A failure at any step aborts the write and removes the staging file, so a
 * failed snapshot never leaves a half-written file under the fixed name.
 */
export function openLiveWriteDatabase(dbPath: string): WritableDatabase {
  const backupPath = backupPathFor(dbPath);
  mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
  const staging = `${backupPath}.${process.pid}-${randomBytes(6).toString("hex")}.staging`;
  let db: WritableDatabase | null = null;
  try {
    snapshotDatabaseTo(dbPath, staging);
    chmodSync(staging, 0o600);
    db = openDatabaseForWrite(dbPath, { path: staging, sha256: sha256File(staging) });
    renameSync(staging, backupPath);
    return db;
  } catch (error) {
    db?.close();
    throw error;
  } finally {
    // A no-op after the rename; the cleanup when anything before it failed.
    rmSync(staging, { force: true });
  }
}

/**
 * Restore the live database from a verified pre-write backup: re-verify the
 * record's hash, copy the snapshot over the live file, and remove stale
 * `-wal`/`-shm` sidecars so SQLite cannot replay post-backup pages over the
 * restored state. Callers must ensure nothing holds the database open.
 */
export function restoreFromBackup(backup: BackupRecord, dbPath: string): void {
  requireBackup(backup);
  copyFileSync(backup.path, dbPath);
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  chmodSync(dbPath, 0o600);
}
