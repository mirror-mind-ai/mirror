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

import { chmodSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BackupRecord, requireBackup, sha256File } from "../db/backupGate.ts";
import { snapshotDatabaseTo } from "../db/database.ts";

const BACKUP_DIR_NAME = "backups";
const BACKUP_FILE_NAME = "frontdoor-pre-write-backup.db";

/** Where the pre-write backup for a given live database lives. */
export function backupPathFor(dbPath: string): string {
  return join(dirname(dbPath), BACKUP_DIR_NAME, BACKUP_FILE_NAME);
}

/**
 * Snapshot the live DB into `<home>/backups/` and return its verified record.
 * WAL-correct via `VACUUM INTO`; owner-only permissions (0700 dir, 0600 file).
 */
export function ensureBackup(dbPath: string): BackupRecord {
  const backupPath = backupPathFor(dbPath);
  mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
  rmSync(backupPath, { force: true });
  snapshotDatabaseTo(dbPath, backupPath);
  chmodSync(backupPath, 0o600);
  return { path: backupPath, sha256: sha256File(backupPath) };
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
