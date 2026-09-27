// Dated zip backup of the memory database — port of `src/memory/cli/backup.py`
// (CV22.DS7.TS1). This is the archive `repair-encoding --apply` and
// `repair-journeys --apply` gate on; the front door's own fixed-name pre-write
// snapshot (`liveBackup.ts`) is a different, weaker property and stays as is.
//
// What the archive is (CR061, which replaced the raw copy DS7.TS1 reproduced):
//   - one member, `memory.db`: a consistent snapshot of the database as
//     committed at one instant, taken with `VACUUM INTO` from a read-only
//     connection, switched to WAL so a restore runs as the original did, and
//     checked with `PRAGMA quick_check` before it is published. The old raw
//     copy of `memory.db` plus its `-wal`/`-shm` could restore a torn pair,
//     and its `memory.db` alone lacked every row still in the WAL;
//   - the snapshot is taken in a private directory under the OS temp dir, never
//     in the backups directory, which may be a synced folder;
//   - the zip is staged beside its final name as
//     `memory_<stamp>.zip.<pid>-<12 hex>.partial` and renamed into place, so a
//     process killed mid-write never leaves a plausible archive, and two
//     backups in the same second never write into one file;
//   - owner-only (CR062): the archive is written 0600 from its first byte, a
//     directory the backup creates is 0700, and every `memory_*.zip` in the
//     directory is tightened to 0600. The directory itself keeps its mode:
//     REFERENCE.md's posture never mutates a pre-existing directory;
//   - the member is always named `memory.db` whatever the on-disk file is
//     called (the restore contract reads that name), and its DOS time is the
//     moment of capture;
//   - after writing, stranded staging whose process is gone is swept (the
//     shared rule in `staging.ts`), a pre-CR061 `.zip.partial` is removed as it
//     always was, and `memory_*.zip` archives older than 30 days by the stamp in
//     their NAME are deleted (unparseable names are left alone);
//   - stdout lines, the deprecated `BACKUP_DIR` warning, and `--silent`
//     printing nothing on success are Python's. `--silent` no longer hides
//     failure: the CLI exits 1 with one line when no archive was written
//     (CR060, `dbSafetyToolsRoute.ts`).

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { prepareArchiveSnapshot, snapshotDatabaseTo } from "#db/database.ts";
import { stagingToken, sweepAbandoned } from "./staging.ts";
import { writeZipArchive, type ZipEntryInput } from "./zipWriter.ts";

export const RETENTION_DAYS = 30;
const ARCHIVE_MEMBER = "memory.db";
/** A zip staged beside its final name: `<archive>.<pid>-<12 hex>.partial`. */
const ZIP_STAGING = /^memory_\d{8}_\d{6}\.zip\.(\d+)-[0-9a-f]{12}\.partial$/;
/** A zip staged before CR061 carried no process id, and is swept as it always was. */
const LEGACY_ZIP_STAGING = /^memory_.*\.zip\.partial$/;
/** A snapshot's private directory under the temp dir: `mirror-backup-<pid>-XXXXXX`. */
const SNAPSHOT_DIR_PREFIX = "mirror-backup-";
const SNAPSHOT_DIR = /^mirror-backup-(\d+)-[A-Za-z0-9]{6}$/;
const BACKUP_DIR_NAME = "backups";

export const DEPRECATED_BACKUP_DIR_WARNING =
  "warning: BACKUP_DIR is deprecated and no longer redirects backups. " +
  "Backups are written under <mirror_home>/backups. " +
  "Use --backup-dir <path> to choose a destination.";

export interface ZipBackupOptions {
  /** The database file to archive. Resolved by the caller (mirror home, env, `--db-path`). */
  dbPath: string;
  /** Printed as `Mirror home:` when given; `null` reproduces Python's `mirror_home=None` output. */
  mirrorHome: string | null;
  /** Explicit destination; `null` means `<dirname(dbPath)>/backups`. */
  backupDir: string | null;
  silent?: boolean;
  /** Process environment view, for the deprecated `BACKUP_DIR` warning. */
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  /** Where the snapshot's private directory is made; the OS temp dir by default. */
  tempDir?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

/** Python `f"{size / 1024:.0f}"`: round half to even, no decimals. */
export function formatKilobytes(sizeBytes: number): string {
  const kb = sizeBytes / 1024;
  const floor = Math.floor(kb);
  const fraction = kb - floor;
  if (fraction > 0.5) return String(floor + 1);
  if (fraction < 0.5) return String(floor);
  return String(floor % 2 === 0 ? floor : floor + 1);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** `datetime.now().strftime("%Y%m%d_%H%M%S")` in local time. */
export function archiveStamp(now: Date): string {
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** Parse `memory_YYYYMMDD_HHMMSS.zip` back into a local-time Date, or null. */
export function parseArchiveStamp(fileName: string): Date | null {
  const match = /^memory_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.zip$/.exec(fileName);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as number[];
  const date = new Date(year as number, (month as number) - 1, day, hour, minute, second);
  // strptime rejects impossible dates; so do we, by round-tripping.
  return archiveStamp(date) === fileName.slice("memory_".length, -".zip".length) ? date : null;
}

/** The snapshot could not be taken, or failed its check: nothing is published. */
export class BackupSnapshotError extends Error {
  constructor(detail: string) {
    super(`could not snapshot the database: ${detail}`);
    this.name = "BackupSnapshotError";
  }
}

/**
 * The archive's one member: a snapshot of the database as committed, taken in
 * a private directory under `tempDir` and removed whatever happens. The file is
 * created empty with mode 0600 before `VACUUM INTO` writes into it, so the copy
 * is owner-only from its first byte, and the member carries that mode, which is
 * the mode `unzip` restores it with.
 */
export function snapshotEntry(dbPath: string, tempDir: string, capturedAt: Date): ZipEntryInput {
  const dir = mkdtempSync(join(tempDir, `${SNAPSHOT_DIR_PREFIX}${process.pid}-`));
  try {
    const path = join(dir, ARCHIVE_MEMBER);
    writeFileSync(path, "", { mode: 0o600, flag: "wx" });
    try {
      snapshotDatabaseTo(dbPath, path);
    } catch (error) {
      throw new BackupSnapshotError(error instanceof Error ? error.message : String(error));
    }
    const check = prepareArchiveSnapshot(path);
    if (!check.ok) throw new BackupSnapshotError(`quick_check: ${check.verdict}`);
    return {
      name: ARCHIVE_MEMBER,
      data: readFileSync(path),
      mtime: capturedAt,
      mode: statSync(path).mode,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Write an archive through a staging file unique to this process and owner-only
 * from its first byte (CR062), then rename it into place. A process killed
 * mid-write never leaves a plausible archive, two writers never share a file,
 * and a failure removes the staging file before it propagates.
 */
export function publishArchive(archivePath: string, bytes: Uint8Array): void {
  const stagingPath = `${archivePath}.${stagingToken()}.partial`;
  try {
    writeFileSync(stagingPath, bytes, { mode: 0o600 });
    renameSync(stagingPath, archivePath);
  } catch (error) {
    rmSync(stagingPath, { force: true });
    throw error;
  }
}

/**
 * CR062, decision D2a: every archive Mirror named in this directory becomes
 * owner-only, including those written before this CR. The directory keeps its
 * mode: REFERENCE.md's posture never mutates a pre-existing directory, and on
 * the Navigator's install this one is a Dropbox folder. Best-effort: an
 * archive that cannot be tightened is not this backup's failure.
 */
function tightenArchives(backupDir: string): void {
  for (const name of readdirSync(backupDir)) {
    if (!/^memory_.*\.zip$/.test(name)) continue;
    try {
      chmodSync(join(backupDir, name), 0o600);
    } catch {
      // Left as it is; `runtime diagnose` reports loose permissions.
    }
  }
}

/** Staging left behind: pre-CR061 partials as always, the rest only when their writer is gone. */
function sweepStaging(backupDir: string, tempDir: string): void {
  for (const name of readdirSync(backupDir)) {
    if (!LEGACY_ZIP_STAGING.test(name)) continue;
    try {
      rmSync(join(backupDir, name));
    } catch {
      // A stranded file we cannot remove is not this run's failure.
    }
  }
  sweepAbandoned(backupDir, ZIP_STAGING);
  sweepAbandoned(tempDir, SNAPSHOT_DIR);
}

function sweepRetention(backupDir: string, keep: string, now: Date): number {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let removed = 0;
  for (const name of readdirSync(backupDir)) {
    if (name === keep || !/^memory_.*\.zip$/.test(name)) continue;
    const stamp = parseArchiveStamp(name);
    if (stamp === null || stamp.getTime() >= cutoff.getTime()) continue;
    try {
      rmSync(join(backupDir, name));
      removed += 1;
    } catch {
      // Same tolerance as the oracle's `except (ValueError, OSError): continue`.
    }
  }
  return removed;
}

/**
 * Create the dated archive and sweep old ones. Returns the archive path, or
 * `null` when the database does not exist (already reported on stdout unless
 * silent). Exit-code semantics belong to the CLI, as in Python.
 */
export function createZipBackup(options: ZipBackupOptions): string | null {
  const silent = options.silent ?? false;
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;
  const out = options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err = options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  if (options.backupDir === null && env.BACKUP_DIR) err(DEPRECATED_BACKUP_DIR_WARNING);
  const backupDir = options.backupDir ?? join(dirname(options.dbPath), BACKUP_DIR_NAME);

  if (!silent) {
    if (options.mirrorHome !== null) out(`Mirror home: ${options.mirrorHome}`);
    out(`Database: ${options.dbPath}`);
    out(`Backup dir: ${backupDir}`);
  }
  if (!existsSync(options.dbPath)) {
    if (!silent) out(`Database not found: ${options.dbPath}`);
    return null;
  }

  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const capturedAt = now();
  const archiveName = `memory_${archiveStamp(capturedAt)}.zip`;
  const archivePath = join(backupDir, archiveName);
  const tempDir = options.tempDir ?? tmpdir();
  const member = snapshotEntry(options.dbPath, tempDir, capturedAt);
  publishArchive(archivePath, writeZipArchive([member]));

  if (!silent)
    out(`Backup created: ${archiveName} (${formatKilobytes(statSync(archivePath).size)} KB)`);

  sweepStaging(backupDir, tempDir);
  const removed = sweepRetention(backupDir, archiveName, now());
  tightenArchives(backupDir);
  if (!silent && removed > 0)
    out(`Removed ${removed} backup(s) older than ${RETENTION_DAYS} days.`);

  return archivePath;
}
