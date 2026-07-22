// Migrate-on-open — CV22.DS6.US3 (D2/D3).
//
// The front door's activation seam for TS-authored forward migrations on an
// *existing* database. Python's `get_connection` migrates on every open, but
// Python's MIGRATIONS list stops before the TS-only tail (017+), so Python
// physically cannot apply them; and `bootstrapDatabaseIfMissing` only runs on a
// *missing* file. Without this seam, an existing database never receives 017 —
// the column stays dormant, merely tolerated by `assertSchemaState`.
//
// Discipline (see this story's plan):
//   - D2: called before serving on BOTH read and write opens, but the steady
//     state is a single `_migrations` read — no lock, no backup — so the hot
//     path of an already-current database pays almost nothing.
//   - D3: the backup is conditional and owned here (not the per-write
//     `ensureBackup`), taken only once we have committed to applying a migration.
//   - A Python-behind database is DEFERRED to Python (matching the softened
//     guard): we never let TS silently apply a migration Python still owns.
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
import { KNOWN_MIGRATION_IDS, TS_AUTHORED_MIGRATION_IDS } from "./schemaState.ts";

const BACKUP_DIR_NAME = "backups";
const MIGRATION_BACKUP_FILE_NAME = "frontdoor-pre-migration-backup.db";

/** Where migrate-on-open snapshots the database before applying a migration.
 * A distinct name from the per-write backup so a migration snapshot never
 * clobbers (or is clobbered by) a routine pre-write snapshot. */
export function migrationBackupPathFor(dbPath: string): string {
  return join(dirname(dbPath), BACKUP_DIR_NAME, MIGRATION_BACKUP_FILE_NAME);
}

export interface MigrateOnOpenResult {
  /** True only when this call actually applied one or more migrations. */
  migrated: boolean;
  /** The TS-authored migration ids applied (empty unless `migrated`). */
  appliedIds: readonly string[];
  /** The pre-migration snapshot path, when a migration was applied. */
  backupPath?: string;
  /** True when work was declined because a Python migration is still pending. */
  deferredToPython?: boolean;
}

export interface MigrateOnOpenOptions extends OpenOptions, BootstrapLockOptions {}

const NOT_MIGRATED: MigrateOnOpenResult = { migrated: false, appliedIds: [] };
const DEFERRED: MigrateOnOpenResult = { migrated: false, appliedIds: [], deferredToPython: true };

interface PendingAssessment {
  tsAuthoredPending: string[];
  pythonPending: string[];
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

/** Split the pending known migrations into the TS-authored tail (which this seam
 * may apply) and any Python migration (whose presence defers the whole thing). */
function assessPending(applied: Set<string>): PendingAssessment {
  const pending = KNOWN_MIGRATION_IDS.filter((id) => !applied.has(id));
  return {
    tsAuthoredPending: pending.filter((id) => TS_AUTHORED_MIGRATION_IDS.has(id)),
    pythonPending: pending.filter((id) => !TS_AUTHORED_MIGRATION_IDS.has(id)),
  };
}

/** Decide from an assessment whether to migrate, defer, or no-op. */
function decision(assessment: PendingAssessment): "migrate" | "defer" | "none" {
  if (assessment.tsAuthoredPending.length === 0) return "none";
  if (assessment.pythonPending.length > 0) return "defer";
  return "migrate";
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
  if (!existsSync(dbPath)) return NOT_MIGRATED;

  // Cheap steady-state pre-check — no lock, no backup.
  const applied = appliedMigrationIds(dbPath, options);
  if (applied === null) return NOT_MIGRATED;
  switch (decision(assessPending(applied))) {
    case "none":
      return NOT_MIGRATED;
    case "defer":
      return DEFERRED;
    default:
      break;
  }

  // Slow path: serialize with concurrent openers and re-decide under the lock so
  // a race cannot double-apply or double-backup.
  const lock = acquireBootstrapLock(dbPath, options);
  try {
    const appliedNow = appliedMigrationIds(dbPath, options);
    if (appliedNow === null) return NOT_MIGRATED;
    const assessment = assessPending(appliedNow);
    switch (decision(assessment)) {
      case "none":
        return NOT_MIGRATED; // another opener migrated between the pre-check and the lock
      case "defer":
        return DEFERRED;
      default:
        break;
    }

    const backupPath = takeBackup(dbPath);
    const db = openDatabaseForBootstrap(dbPath, options);
    try {
      runMigrations(db);
    } finally {
      db.close();
    }
    return { migrated: true, appliedIds: assessment.tsAuthoredPending, backupPath };
  } finally {
    lock.release();
  }
}
