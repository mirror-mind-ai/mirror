// Dated zip backup of the memory database — port of `src/memory/cli/backup.py`
// (CV22.DS7.TS1). This is the archive `repair-encoding --apply` and
// `repair-journeys --apply` gate on; the front door's own fixed-name pre-write
// snapshot (`liveBackup.ts`) is a different, weaker property and stays as is.
//
// Behavior reproduced exactly, including what a later CR may change:
//   - the archive is a RAW copy of `memory.db` plus its `-wal`/`-shm` sidecars
//     when present, taken without a read lock (Python does the same);
//   - it is staged as `memory_<stamp>.zip.partial` and renamed into place, so
//     a process killed mid-write never leaves a plausible 0-byte archive;
//   - the member is always named `memory.db` whatever the on-disk file is
//     called (the restore contract reads that name);
//   - after writing, stranded `.partial` files are swept and `memory_*.zip`
//     archives older than 30 days by the stamp in their NAME are deleted
//     (unparseable names are left alone);
//   - stdout lines, the deprecated `BACKUP_DIR` warning, and `--silent`
//     printing nothing are all Python's; `--silent` also hides failure (the
//     CLI exits 0 then — recorded as a CR, not fixed here).

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { entryFromFile, writeZipArchive, type ZipEntryInput } from "./zipWriter.ts";

export const RETENTION_DAYS = 30;
const ARCHIVE_MEMBER = "memory.db";
const SIDECAR_SUFFIXES = ["-wal", "-shm"] as const;
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

function collectEntries(dbPath: string): ZipEntryInput[] {
  const entries = [entryFromFile(dbPath, ARCHIVE_MEMBER, readFileSync(dbPath))];
  for (const suffix of SIDECAR_SUFFIXES) {
    const sidecar = join(dirname(dbPath), `${basename(dbPath)}${suffix}`);
    if (existsSync(sidecar)) {
      entries.push(entryFromFile(sidecar, `${ARCHIVE_MEMBER}${suffix}`, readFileSync(sidecar)));
    }
  }
  return entries;
}

function sweepRetention(backupDir: string, keep: string, now: Date): number {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let removed = 0;
  for (const name of readdirSync(backupDir)) {
    if (/^memory_.*\.zip\.partial$/.test(name)) {
      try {
        rmSync(join(backupDir, name));
      } catch {
        // A stranded file we cannot remove is not this run's failure.
      }
    }
  }
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

  mkdirSync(backupDir, { recursive: true });
  const archiveName = `memory_${archiveStamp(now())}.zip`;
  const archivePath = join(backupDir, archiveName);
  const stagingPath = join(backupDir, `${archiveName}.partial`);
  try {
    writeFileSync(stagingPath, writeZipArchive(collectEntries(options.dbPath)));
    renameSync(stagingPath, archivePath);
  } catch (error) {
    rmSync(stagingPath, { force: true });
    throw error;
  }

  if (!silent)
    out(`Backup created: ${archiveName} (${formatKilobytes(statSync(archivePath).size)} KB)`);

  const removed = sweepRetention(backupDir, archiveName, now());
  if (!silent && removed > 0)
    out(`Removed ${removed} backup(s) older than ${RETENTION_DAYS} days.`);

  return archivePath;
}
