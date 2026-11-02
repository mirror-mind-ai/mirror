// Migrate a home on request — CV24.DS5.
//
// A host that embeds this core (Mirror Desktop 0.3) shows the person DS1's
// migration report, asks, and only then calls `migrateHome` with the pending
// list it showed. The call applies exactly that list, or refuses and changes
// nothing. This is the call Desktop's last 0.3 phase will run against a real,
// long-lived home, so it carries the custody the decision "A host migrates a
// home only behind a verified, retained backup" records:
//
//   - The backup gets a name never reused:
//     `backups/pre-migration-<last applied id>-<UTC stamp>-<random>.db`, 0600.
//     `ensureMigratedOnOpen` overwrites one fixed name instead.
//   - Nothing migrates until the backup is verified: prepared as WAL and
//     quick_checked (`prepareArchiveSnapshot`), hashed, and read by the
//     migration report as the same pending list the live home has.
//   - The core never deletes it.
//
// All of it runs under the bootstrap lock, with the ledger re-read under the
// lock, so a concurrent migration applies once. Like every CV24 call, it reads
// only the path it is given. `ensureMigratedOnOpen` and the CLI are unchanged.

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { acquireBootstrapLock } from "./bootstrapLock.ts";
import {
  openDatabaseForBootstrap,
  prepareArchiveSnapshot,
  snapshotDatabaseTo,
} from "./database.ts";
import { inspectMigrationState, type MigrationReport } from "./migrationReport.ts";
import { runMigrations } from "./migrations.ts";
import { createSchema } from "./schema.ts";

export type MigrateHomeRejection =
  | "nothing_pending"
  | "pending_changed"
  | "not_migratable"
  | "backup_failed";

export class MigrateHomeRejectedError extends Error {
  readonly reason: MigrateHomeRejection;
  /** The report the refusal was decided on. */
  readonly report: MigrationReport;

  constructor(reason: MigrateHomeRejection, report: MigrationReport, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.reason = reason;
    this.report = report;
  }
}

export interface MigrationBackup {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface MigrateHomeReceipt {
  appliedIds: string[];
  backup: MigrationBackup;
  before: MigrationReport;
  after: MigrationReport;
}

function sameList(a: readonly string[], b: unknown): boolean {
  return Array.isArray(b) && a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Refuse unless `report` is pending with exactly `expected`. */
function decide(report: MigrationReport, expected: unknown): void {
  if (report.state === "current") throw new MigrateHomeRejectedError("nothing_pending", report);
  if (report.state !== "pending") throw new MigrateHomeRejectedError("not_migratable", report);
  if (!sameList(report.pending, expected))
    throw new MigrateHomeRejectedError("pending_changed", report);
}

function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Take the backup and verify it as a pre-image of `before`, or remove it and refuse. */
function verifiedBackup(dbPath: string, before: MigrationReport): MigrationBackup {
  const lastApplied = before.applied[before.applied.length - 1] ?? "none";
  const dir = join(dirname(dbPath), "backups");
  const path = join(
    dir,
    `pre-migration-${lastApplied}-${stamp(new Date())}-${randomBytes(6).toString("hex")}.db`,
  );
  const fail = (detail: string): never => {
    for (const file of [path, `${path}-wal`, `${path}-shm`]) rmSync(file, { force: true });
    throw new MigrateHomeRejectedError("backup_failed", before, detail);
  };
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    snapshotDatabaseTo(dbPath, path);
    chmodSync(path, 0o600);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  const prepared = prepareArchiveSnapshot(path);
  if (!prepared.ok) return fail(`quick_check: ${prepared.verdict}`);
  const image = inspectMigrationState(path);
  // The report's read-only open leaves empty sidecars beside a WAL file; this
  // file is private to this call, so they are removed to leave one file.
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
  if (image.state !== "pending" || !sameList(before.pending, image.pending)) {
    return fail(`the backup reads as ${image.state}, not the live home's pending list`);
  }
  return {
    path,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    sizeBytes: statSync(path).size,
  };
}

/** Apply exactly `expectedPending` to the home at `dbPath`, behind a verified backup. */
export function migrateHome(
  dbPath: string,
  request: { expectedPending: readonly string[] },
): MigrateHomeReceipt {
  const expected = request?.expectedPending;
  // Cheap pre-check without the lock: most refusals need nothing more.
  decide(inspectMigrationState(dbPath), expected);

  const lock = acquireBootstrapLock(dbPath);
  try {
    // Re-decided under the lock: another process may have migrated meanwhile.
    const before = inspectMigrationState(dbPath);
    decide(before, expected);
    const backup = verifiedBackup(dbPath, before);
    const db = openDatabaseForBootstrap(dbPath);
    try {
      runMigrations(db);
      createSchema(db);
    } finally {
      db.close();
    }
    return {
      appliedIds: [...before.pending],
      backup,
      before,
      after: inspectMigrationState(dbPath),
    };
  } finally {
    lock.release();
  }
}
