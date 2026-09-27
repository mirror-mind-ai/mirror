// Front-door routes for the DB safety tools (CV22.DS7.TS1): `backup` and
// `repair-encoding`. Argument handling mirrors the two Python argparse
// parsers closely enough that the exit codes and error lines match; the
// behavior itself lives in `#backup/zipBackup.ts` and
// `#repair/encodingRepair.ts`, graded by their goldens.
//
// `backup` never opens the database through the front door and never
// bootstraps one; its snapshot uses a read-only connection of its own. Since
// CR060, a backup that wrote no archive exits 1 whatever --silent says, with
// one stderr line that leads with the consequence -- Python exited 0 under
// --silent, which hid every failed session-end backup.
// `repair-encoding` reads through a plain read-only handle for the dry run
// (Python does not check the schema either — the scan is tolerant of old
// databases by design) and goes through the caller-supplied live-write seam
// for `--apply`, which adds the front door's own silent pre-write snapshot on
// top of the dated zip Python takes.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { BackupSnapshotError, createZipBackup } from "#backup/zipBackup.ts";
import { Zip64RequiredError } from "#backup/zipWriter.ts";
import { type Database, openDatabaseReadOnly, type WritableDatabase } from "#db/database.ts";
import {
  applyRepairs,
  renderApplyReport,
  renderScanReport,
  scanDatabase,
} from "#repair/encodingRepair.ts";
import { expandHome } from "#util/paths.ts";
import { MirrorHomeNotConfiguredError } from "./dbPath.ts";

const BACKUP_USAGE =
  "usage: backup [-h] [--silent] [--mirror-home MIRROR_HOME] [--backup-dir BACKUP_DIR]";
const REPAIR_USAGE =
  "usage: repair-encoding [-h] [--mirror-home MIRROR_HOME] [--apply] [--no-backup] [--limit LIMIT]";

interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  error: string | null;
}

/** argparse-shaped parsing: known flags, known valued options, nothing else. */
function parseArgs(
  args: readonly string[],
  spec: { flags: readonly string[]; valued: readonly string[] },
): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const unrecognized: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    if (spec.flags.includes(arg)) {
      flags.add(arg);
    } else if (spec.valued.includes(arg)) {
      const value = args[index + 1];
      if (value === undefined)
        return { flags, values, error: `argument ${arg}: expected one argument` };
      values.set(arg, value);
      index += 1;
    } else {
      unrecognized.push(arg);
    }
  }
  return {
    flags,
    values,
    error: unrecognized.length > 0 ? `unrecognized arguments: ${unrecognized.join(" ")}` : null,
  };
}

function usageError(usage: string, program: string, message: string): number {
  process.stderr.write(`${usage}\n${program}: error: ${message}\n`);
  return 2;
}

export interface SafetyToolsIo {
  /**
   * Resolve the database path from argv (`--db-path`, `--mirror-home`, env);
   * null when unconfigured and already reported. `backup` is handed a resolver
   * that throws `MirrorHomeNotConfiguredError` instead, so that failure is
   * reported once, in the backup's own words.
   */
  resolveDbPath: (args: readonly string[]) => string | null;
  /** The live-write seam for a resolved path: pre-write snapshot, schema guard, always-close. */
  withLiveWriteDb: (dbPath: string, write: (db: WritableDatabase) => number) => number;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  now?: () => Date;
  env?: Readonly<Record<string, string | undefined>>;
}

/** What `backup` answered, for the caller and the front-door log. */
export interface BackupOutcome {
  exitCode: number;
  /** `backup=<why>` when no archive was written: content-free, never a path or an argument. */
  detail?: string;
}

type BackupFailure = "home_unresolved" | "database_missing" | "snapshot_failed" | "write_failed";

/** An operating-system refusal (no space, no permission, a file in the way) rather than a bug. */
function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && typeof (error as NodeJS.ErrnoException).code === "string";
}

/** `backup [--silent] [--mirror-home PATH] [--backup-dir PATH] [--db-path PATH]`. */
export function runBackupRoute(argv: readonly string[], io: SafetyToolsIo): BackupOutcome {
  const args = argv.slice(1);
  const parsed = parseArgs(args, {
    flags: ["--silent"],
    valued: ["--mirror-home", "--backup-dir", "--db-path"],
  });
  if (parsed.error) return { exitCode: usageError(BACKUP_USAGE, "backup", parsed.error) };
  const silent = parsed.flags.has("--silent");
  const err = io.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  // CR060: --silent suppresses progress, never failure.
  const fail = (why: BackupFailure, reason: string): BackupOutcome => {
    err(`backup: no archive was written: ${reason}`);
    return { exitCode: 1, detail: `backup=${why}` };
  };

  let dbPath: string | null;
  try {
    dbPath = io.resolveDbPath(args);
  } catch (error) {
    if (error instanceof MirrorHomeNotConfiguredError)
      return fail("home_unresolved", error.message);
    throw error;
  }
  // A resolver that returns null has reported the failure itself.
  if (dbPath === null) return { exitCode: 1, detail: "backup=home_unresolved" };

  const explicitHome = parsed.values.get("--mirror-home");
  const explicitDir = parsed.values.get("--backup-dir");
  let archive: string | null;
  try {
    archive = createZipBackup({
      dbPath,
      mirrorHome: explicitHome === undefined ? dirname(dbPath) : expandHome(explicitHome),
      backupDir: explicitDir === undefined ? null : expandHome(explicitDir),
      silent,
      env: io.env ?? process.env,
      ...(io.now ? { now: io.now } : {}),
      ...(io.stdout ? { stdout: io.stdout } : {}),
      ...(io.stderr ? { stderr: io.stderr } : {}),
    });
  } catch (error) {
    // Expected failures are one line; anything else is a bug and keeps its stack.
    if (error instanceof BackupSnapshotError) return fail("snapshot_failed", error.message);
    if (isSystemError(error) || error instanceof Zip64RequiredError) {
      return fail("write_failed", error.message);
    }
    throw error;
  }
  if (archive === null) {
    // Without --silent, createZipBackup already said "Database not found" on stdout.
    if (!silent) return { exitCode: 1, detail: "backup=database_missing" };
    return fail("database_missing", `database not found: ${dbPath}`);
  }
  return { exitCode: 0 };
}

/** `repair-encoding [--mirror-home PATH] [--apply] [--no-backup] [--limit N] [--db-path PATH]`. */
export function runRepairEncodingRoute(argv: readonly string[], io: SafetyToolsIo): number {
  const args = argv.slice(1);
  const parsed = parseArgs(args, {
    flags: ["--apply", "--no-backup"],
    valued: ["--mirror-home", "--limit", "--db-path"],
  });
  if (parsed.error) return usageError(REPAIR_USAGE, "repair-encoding", parsed.error);
  const rawLimit = parsed.values.get("--limit");
  // argparse `type=int`: Python's int() accepts surrounding whitespace and a sign.
  if (rawLimit !== undefined && !/^\s*[+-]?\d+\s*$/.test(rawLimit)) {
    return usageError(
      REPAIR_USAGE,
      "repair-encoding",
      `argument --limit: invalid int value: '${rawLimit}'`,
    );
  }
  const limit = rawLimit === undefined ? 20 : Number.parseInt(rawLimit, 10);
  const apply = parsed.flags.has("--apply");
  const noBackup = parsed.flags.has("--no-backup");
  const out = io.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const err = io.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  const dbPath = io.resolveDbPath(args);
  if (dbPath === null) return 1;
  if (!existsSync(dbPath)) {
    err(`Database not found: ${dbPath}`);
    return 1;
  }

  const explicitHome = parsed.values.get("--mirror-home");
  const report = (db: Database) => {
    const hits = scanDatabase(db);
    out(renderScanReport({ dbPath, hits, limit }).replace(/\n$/, ""));
    return hits;
  };

  if (!apply) {
    const db = openDatabaseReadOnly(dbPath);
    try {
      report(db);
    } finally {
      db.close();
    }
    out("Dry-run only. Re-run with --apply to modify the database.");
    return 0;
  }

  return io.withLiveWriteDb(dbPath, (db) => {
    const hits = report(db);
    if (hits.length === 0) {
      out("No changes needed.");
      return 0;
    }
    if (!noBackup) {
      // Python: backup(silent=False, db_path, db_backup_path=<home>/backups,
      // mirror_home=<explicit or None>) -- the `Mirror home:` line appears
      // only when --mirror-home was passed.
      const created = createZipBackup({
        dbPath,
        mirrorHome: explicitHome === undefined ? null : expandHome(explicitHome),
        backupDir: join(dirname(dbPath), "backups"),
        silent: false,
        env: io.env ?? process.env,
        ...(io.now ? { now: io.now } : {}),
        stdout: out,
        stderr: err,
      });
      if (created === null) {
        err("Backup failed; aborting repair.");
        return 1;
      }
    }
    out(renderApplyReport(applyRepairs(db, hits)).replace(/\n$/, ""));
    return 0;
  });
}
