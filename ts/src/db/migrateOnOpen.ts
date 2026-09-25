// Migrate-on-open — CV22.DS6.US3 (D2/D3).
//
// The front door's activation seam for forward migrations on an *existing*
// database. `bootstrapDatabaseIfMissing` only runs on a *missing* file, so
// without this seam an existing database never receives a new migration -- the
// column stays dormant, merely tolerated by `assertSchemaState`.
//
// CV22.DS10.TS5 made TypeScript the SOLE custodian (D-025). The seam was built
// for two engines: Python's MIGRATIONS list stopped at 016, so this applied
// only the TS-authored tail and DEFERRED whenever a Python-authored migration
// was pending, rather than let TypeScript silently apply work Python still
// owned. That deferral was honest while Python existed. Its verdict was not --
// `runtime migrate` printed `nothing pending`, exit 0, and the updater's
// migrate stage passed on a database with pending work nothing had applied.
//
// There is no second engine to defer to now, so the split is gone and every
// pending known migration is applied here. What remains as `declined` is
// structural and cannot be resolved by another engine: a file with no
// `_migrations` table, or a database carrying migrations this core does not
// know. Those fail loudly.
//
// Discipline (see this story's plan):
//   - D2: called before serving on BOTH read and write opens, but the steady
//     state is a single `_migrations` read -- no lock, no backup -- so the hot
//     path of an already-current database pays almost nothing.
//   - D3: the backup is conditional and owned here (not the per-write
//     `openLiveWriteDatabase` snapshot), taken only once we have committed to applying a migration.
//   - Backup-first, then lock, then idempotent `runMigrations`; the pending set
//     is re-checked under the lock so concurrent openers cannot double-apply or
//     double-backup (the loser sees nothing pending and no-ops).

import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import { acquireBootstrapLock, type BootstrapLockOptions } from "./bootstrapLock.ts";
import {
  type OpenOptions,
  openDatabaseForBootstrap,
  openDatabaseReadOnly,
  snapshotDatabaseTo,
} from "./database.ts";
import { runMigrations } from "./migrations.ts";
import { KNOWN_MIGRATION_IDS } from "./schemaState.ts";

const BACKUP_DIR_NAME = "backups";
const MIGRATION_BACKUP_FILE_NAME = "frontdoor-pre-migration-backup.db";

/** Where migrate-on-open snapshots the database before applying a migration.
 * A distinct name from the per-write backup so a migration snapshot never
 * clobbers (or is clobbered by) a routine pre-write snapshot. */
export function migrationBackupPathFor(dbPath: string): string {
  return join(dirname(dbPath), BACKUP_DIR_NAME, MIGRATION_BACKUP_FILE_NAME);
}

/**
 * What migrate-on-open did. THREE verdicts, not two (CV22.DS10.TS5, D-025).
 *
 * `declined` used to be `deferredToPython`, and it was honest while Python
 * existed: the work was real, and another engine could do it. What was not
 * honest was the VERDICT -- `runMigrate` reported `nothing pending` with exit
 * 0, and the updater read that as a passing stage on a database with pending
 * work nothing had applied.
 *
 * After this story there is nothing to defer to, so a decline is structural:
 * the file is not a Mirror database, or it carries migrations this core does
 * not know. Both are real refusals that must fail loudly rather than pass
 * quietly, on the one command whose job is to leave the database correct after
 * an update.
 */
export type MigrateVerdict = "applied" | "nothing_pending" | "declined";

export interface MigrateOnOpenResult {
  /** Which of the three things happened. */
  verdict: MigrateVerdict;
  /** True only when this call actually applied one or more migrations. */
  migrated: boolean;
  /** The migration ids applied (empty unless `migrated`). */
  appliedIds: readonly string[];
  /** The pre-migration snapshot path, when a migration was applied. */
  backupPath?: string;
  /** Why the work was declined, when it was. Never empty for `declined`. */
  declinedReason?: string;
}

export interface MigrateOnOpenOptions extends OpenOptions, BootstrapLockOptions {}

const NOTHING_PENDING: MigrateOnOpenResult = {
  verdict: "nothing_pending",
  migrated: false,
  appliedIds: [],
};

function declined(reason: string): MigrateOnOpenResult {
  return { verdict: "declined", migrated: false, appliedIds: [], declinedReason: reason };
}

/**
 * Read the applied migration ids. Returns `null` when the database has no
 * `_migrations` table — i.e. it is not a bootstrapped Mirror database. That is
 * `assertSchemaState`'s error to raise, not ours: migrate-on-open simply
 * declines rather than trying to bootstrap an unknown file.
 */
function appliedMigrationIds(dbPath: string, options: OpenOptions): Set<string> | null {
  const db = openDatabaseReadOnly(dbPath, options);
  try {
    const rows = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
    return new Set(rows.map((row) => row.id));
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * The known migrations this database has not applied, in order.
 *
 * No split any more. Until CV22.DS10.TS5 this separated the TS-authored tail
 * from Python-authored ids and declined the whole thing whenever a Python one
 * was pending -- correct while Python could still apply them. TypeScript
 * carries all seventeen and is the only engine left, so every pending known
 * migration is simply pending.
 */
function pendingMigrations(applied: Set<string>): string[] {
  return KNOWN_MIGRATION_IDS.filter((id) => !applied.has(id));
}

/** Migrations the database carries that this core does not know about. */
function unknownMigrations(applied: Set<string>): string[] {
  const known = new Set(KNOWN_MIGRATION_IDS);
  return [...applied].filter((id) => !known.has(id)).sort();
}

function takeBackup(dbPath: string): string {
  const backupPath = migrationBackupPathFor(dbPath);
  mkdirSync(dirname(backupPath), { recursive: true, mode: 0o700 });
  rmSync(backupPath, { force: true });
  snapshotDatabaseTo(dbPath, backupPath);
  chmodSync(backupPath, 0o600);
  return backupPath;
}

/**
 * Apply pending TS-authored forward migrations to an existing `dbPath`, backup
 * first and under the cross-process bootstrap lock. Cheap and side-effect-free
 * unless a TS-authored migration is genuinely pending with no Python migration
 * behind it. Safe to call on every open. See the module header for the full
 * contract.
 */
export function ensureMigratedOnOpen(
  dbPath: string,
  options: MigrateOnOpenOptions = {},
): MigrateOnOpenResult {
  // A missing file is not this seam's business: `bootstrapDatabaseIfMissing`
  // owns creation, and `runMigrate` reports the absence with its own message.
  if (!existsSync(dbPath)) return NOTHING_PENDING;

  // Cheap steady-state pre-check — no lock, no backup.
  const applied = appliedMigrationIds(dbPath, options);
  if (applied === null) {
    return declined("database has no _migrations table — not a bootstrapped Mirror database");
  }
  const unknown = unknownMigrations(applied);
  if (unknown.length > 0) {
    // The database is AHEAD of this core. Applying anything now would write
    // with older code against a newer schema; declining is the safe answer,
    // and saying so is the honest one.
    return declined(
      `database carries migrations this core does not know (${unknown.join(", ")}) — update this Mirror installation`,
    );
  }
  if (pendingMigrations(applied).length === 0) return NOTHING_PENDING;

  // Slow path: serialize with concurrent openers and re-decide under the lock so
  // a race cannot double-apply or double-backup.
  const lock = acquireBootstrapLock(dbPath, options);
  try {
    const appliedNow = appliedMigrationIds(dbPath, options);
    if (appliedNow === null) {
      return declined("database has no _migrations table — not a bootstrapped Mirror database");
    }
    const pending = pendingMigrations(appliedNow);
    // Another opener migrated between the pre-check and the lock.
    if (pending.length === 0) return NOTHING_PENDING;

    const backupPath = takeBackup(dbPath);
    const db = openDatabaseForBootstrap(dbPath, options);
    try {
      runMigrations(db);
    } finally {
      db.close();
    }
    return { verdict: "applied", migrated: true, appliedIds: pending, backupPath };
  } finally {
    lock.release();
  }
}
