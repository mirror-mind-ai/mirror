// Front-door routes for the DB safety tools (CV22.DS7.TS1): `backup` and
// `repair-encoding`. Argument handling mirrors the two Python argparse
// parsers closely enough that the exit codes and error lines match; the
// behavior itself lives in `#backup/zipBackup.ts` and
// `#repair/encodingRepair.ts`, graded by their goldens.
//
// `backup` never opens the database and never bootstraps one: a missing file
// is "Database not found", exit 1 (0 under --silent), exactly like Python.
// `repair-encoding` reads through a plain read-only handle for the dry run
// (Python does not check the schema either — the scan is tolerant of old
// databases by design) and goes through the caller-supplied live-write seam
// for `--apply`, which adds the front door's own silent pre-write snapshot on
// top of the dated zip Python takes.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createZipBackup } from "#backup/zipBackup.ts";
import { type Database, openDatabaseReadOnly, type WritableDatabase } from "#db/database.ts";
import {
  applyRepairs,
  renderApplyReport,
  renderScanReport,
  scanDatabase,
} from "#repair/encodingRepair.ts";
import { expandHome } from "#util/paths.ts";

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
  /** Resolve the database path from argv (`--db-path`, `--mirror-home`, env); null when unconfigured (already reported). */
  resolveDbPath: (args: readonly string[]) => string | null;
  /** The live-write seam for a resolved path: pre-write snapshot, schema guard, always-close. */
  withLiveWriteDb: (dbPath: string, write: (db: WritableDatabase) => number) => number;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  now?: () => Date;
  env?: Readonly<Record<string, string | undefined>>;
}

/** `backup [--silent] [--mirror-home PATH] [--backup-dir PATH] [--db-path PATH]`. */
export function runBackupRoute(argv: readonly string[], io: SafetyToolsIo): number {
  const args = argv.slice(1);
  const parsed = parseArgs(args, {
    flags: ["--silent"],
    valued: ["--mirror-home", "--backup-dir", "--db-path"],
  });
  if (parsed.error) return usageError(BACKUP_USAGE, "backup", parsed.error);
  const silent = parsed.flags.has("--silent");

  const dbPath = io.resolveDbPath(args);
  if (dbPath === null) return silent ? 0 : 1;

  const explicitHome = parsed.values.get("--mirror-home");
  const explicitDir = parsed.values.get("--backup-dir");
  const archive = createZipBackup({
    dbPath,
    mirrorHome: explicitHome === undefined ? dirname(dbPath) : expandHome(explicitHome),
    backupDir: explicitDir === undefined ? null : expandHome(explicitDir),
    silent,
    env: io.env ?? process.env,
    ...(io.now ? { now: io.now } : {}),
    ...(io.stdout ? { stdout: io.stdout } : {}),
    ...(io.stderr ? { stderr: io.stderr } : {}),
  });
  // Python: `if result is None and not args.silent: sys.exit(1)` -- a silent
  // failure exits 0. Reproduced; recorded as a CR, not fixed here.
  return archive === null && !silent ? 1 : 0;
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
