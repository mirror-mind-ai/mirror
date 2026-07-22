// Bootstrap authority — CV22.DS6.TS3.
//
// TS equivalent of Python's `src/memory/db/connection.py::get_connection`.
// Composes TS1's `createSchema` and TS2's `runMigrations` behind the
// cross-process bootstrap lock (`bootstrapLock.ts`) and Python's exact pragma
// ordering, so a TS-only process can create and migrate `memory.db` safely —
// including under concurrent bootstrap attempts from multiple processes.
//
// Pragma ordering matches Python precisely and is load-bearing:
//   connect -> busy_timeout -> foreign_keys -> WAL -> run_migrations -> SCHEMA
// `journal_mode=WAL` must be set outside any transaction and before
// migrations run (each migration commits via `withTransaction`; switching
// journal mode inside a transaction is refused by SQLite).

import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { acquireBootstrapLock, type BootstrapLockOptions } from "./bootstrapLock.ts";
import { type OpenOptions, openDatabaseForBootstrap, type WritableDatabase } from "./database.ts";
import { runMigrations } from "./migrations.ts";
import { createSchema } from "./schema.ts";

export interface BootstrapOptions extends OpenOptions, BootstrapLockOptions {}

function ensureWalMode(db: WritableDatabase): void {
  const row = db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string } | undefined;
  const current = (row?.journal_mode ?? "").toLowerCase();
  if (current !== "wal") {
    db.exec("PRAGMA journal_mode=WAL");
  }
}

/** Owner-only posture (0600) for the database file and its WAL sidecars. A
 * missing sidecar (e.g. no writes have happened yet) is not an error. */
function chmodOwnerOnly(dbPath: string): void {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      chmodSync(path, 0o600);
    } catch {
      // Sidecar absent, or filesystem does not support POSIX modes — Python's
      // own posture is best-effort here too (`contextlib.suppress(OSError)`).
    }
  }
}

/**
 * Bootstrap `dbPath`: create the parent directory (owner-only if we create
 * it — an existing directory is never mutated, matching Python), acquire the
 * cross-process lock, apply pragma discipline, run migrations, and create any
 * missing schema. Idempotent and safe to call repeatedly — every step it
 * composes (pragmas, `runMigrations`, `createSchema`) is a no-op against an
 * already-current database.
 *
 * Returns the open, bootstrapped connection — callers should use it directly
 * rather than reopening, exactly as Python's `get_connection` returns the
 * connection it just bootstrapped.
 */
export function bootstrapDatabase(
  dbPath: string,
  options: BootstrapOptions = {},
): WritableDatabase {
  const parentDir = dirname(dbPath);
  const parentPreexisting = existsSync(parentDir);
  mkdirSync(parentDir, { recursive: true });
  if (!parentPreexisting) {
    try {
      chmodSync(parentDir, 0o700);
    } catch {
      // Best-effort, matching Python's `contextlib.suppress(OSError)`.
    }
  }

  const lock = acquireBootstrapLock(dbPath, options);
  let db: WritableDatabase;
  try {
    db = openDatabaseForBootstrap(dbPath, options);
    // busy_timeout + foreign_keys are already applied by openDatabaseForBootstrap
    // (shared `applyConnectionPragmas`); WAL is bootstrap-specific because it
    // must run outside a transaction and only needs setting once per file.
    ensureWalMode(db);
    runMigrations(db);
    createSchema(db);
  } finally {
    lock.release();
  }

  chmodOwnerOnly(dbPath);
  return db;
}

/**
 * Ensure a bootstrapped database exists at `dbPath` (CV22.DS6.TS4). When the
 * file is absent, create and migrate it through {@link bootstrapDatabase} under
 * the cross-process lock, then close the connection so the caller can reopen in
 * the exact mode it needs — read-only serving, or the backup-gated live-write
 * seam. When the file already exists this is a cheap `existsSync` no-op, so the
 * per-command hot path never pays for a lock acquire.
 *
 * This is the front door's first-run seam: it replaces the DS2/DS3 stopgap that
 * delegated a missing database to Python to bootstrap. Concurrency-safe by
 * construction — the underlying bootstrap is lock-guarded and idempotent, so
 * even if the file appears between the check here and the call, the work is a
 * safe no-op rather than a double-apply.
 */
export function bootstrapDatabaseIfMissing(dbPath: string, options: BootstrapOptions = {}): void {
  if (existsSync(dbPath)) return;
  bootstrapDatabase(dbPath, options).close();
}
