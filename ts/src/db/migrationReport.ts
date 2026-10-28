// The migration report — CV24.DS1, the first piece of an embeddable core.
//
// Mirror Desktop hosts this core in its own process and must be able to ask
// what state a database is in before anything changes it, so it can ask the
// person first. Every open through the front door runs `ensureMigratedOnOpen`,
// which answers that question by migrating. This report answers it by reading.
//
// Two properties are the point of it:
//
//   - **It never migrates, backs up or locks.** It opens read-only and reads the
//     ledger. On a WAL database a read-only open still creates `-wal` and
//     `-shm` beside the file and cannot remove them; that is SQLite's, true of
//     every reader, and the only trace the report leaves.
//   - **It reads the path it is given.** No environment variable is consulted,
//     because the shell that starts a host may export another home's
//     `MIRROR_HOME`, and a report that followed it would read the wrong home.
//
// It shares its three readers with `ensureMigratedOnOpen`, so what it calls
// pending is exactly what an open would apply, and its order of verdicts is the
// open's: no ledger, then unknown migrations, then pending.

import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { packageVersion } from "#runtime/version.ts";
import { appliedMigrationIds, pendingMigrations, unknownMigrations } from "./migrateOnOpen.ts";

/**
 * - `missing`: no file at the path.
 * - `not_mirror`: the file has no readable `_migrations` ledger.
 * - `current`: every migration this core knows is applied, and nothing else.
 * - `pending`: some known migrations are not applied; opening would apply them.
 * - `ahead`: the database carries migrations this core does not know; opening
 *   would decline, and this core must not write to it.
 */
export type MigrationState = "missing" | "not_mirror" | "current" | "pending" | "ahead";

export interface MigrationReport {
  state: MigrationState;
  /** The path that was read, exactly as given. */
  dbPath: string;
  /** Applied migration ids, sorted. Empty unless the ledger was read. */
  applied: string[];
  /** Known migrations not applied, in the order an open would apply them. */
  pending: string[];
  /** Applied ids this core does not know, sorted. */
  unknown: string[];
  /** The version of the core that read the database, or null outside a package. */
  coreVersion: string | null;
}

const CORE_VERSION = packageVersion(dirname(fileURLToPath(import.meta.url)));

/** Report the migration state of the database at `dbPath`, changing nothing. */
export function inspectMigrationState(dbPath: string): MigrationReport {
  const empty = { dbPath, applied: [], pending: [], unknown: [], coreVersion: CORE_VERSION };
  if (!existsSync(dbPath)) return { state: "missing", ...empty };

  let applied: Set<string> | null;
  try {
    applied = appliedMigrationIds(dbPath);
  } catch {
    // The open itself failed: whatever the file is, it is not a Mirror database
    // this core can read.
    applied = null;
  }
  if (applied === null) return { state: "not_mirror", ...empty };

  const pending = pendingMigrations(applied);
  const unknown = unknownMigrations(applied);
  const state: MigrationState =
    unknown.length > 0 ? "ahead" : pending.length > 0 ? "pending" : "current";
  return {
    state,
    dbPath,
    applied: [...applied].sort(),
    pending,
    unknown,
    coreVersion: CORE_VERSION,
  };
}
