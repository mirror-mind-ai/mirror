// Driver seam for the Mirror Mind TypeScript core.
//
// This is the ONLY module allowed to import `node:sqlite`. The rest of the core
// depends on the `Database` interface below, never on the driver directly, so a
// future swap to another driver (e.g. better-sqlite3) rewrites only this file.
// `node:sqlite` is still experimental and emits an ExperimentalWarning to stderr;
// that is non-fatal and stays out of stdout.

import { DatabaseSync } from "node:sqlite";

import { assertCopyTarget } from "./copyGuard.ts";

/** A SQLite-storable value. Mirrored here so callers don't import driver types. */
export type SqlValue = null | number | bigint | string | Uint8Array;

/** One result row, keyed by column name. */
export type Row = Record<string, unknown>;

/** A prepared read query. */
export interface PreparedQuery {
  all(...params: SqlValue[]): Row[];
  get(...params: SqlValue[]): Row | undefined;
}

/** A read handle over a SQLite file. */
export interface Database {
  prepare(sql: string): PreparedQuery;
  close(): void;
}

/**
 * Open a SQLite file read-only. The handle can prepare and run read queries;
 * any write rejects at the driver level, keeping the database-as-seam contract
 * safe against the authors' live `memory.db`.
 */
export function openDatabaseReadOnly(path: string): Database {
  const driver = new DatabaseSync(path, { readOnly: true });
  return {
    prepare(sql: string): PreparedQuery {
      const statement = driver.prepare(sql);
      return {
        // `node:sqlite` returns null-prototype row objects. Normalize to plain
        // objects so the seam's row shape is driver-independent and predictable
        // for every consumer (and for strict equality in tests).
        all: (...params: SqlValue[]): Row[] =>
          (statement.all(...params) as Row[]).map((row) => ({ ...row })),
        get: (...params: SqlValue[]): Row | undefined => {
          const row = statement.get(...params) as Row | undefined;
          return row === undefined ? undefined : { ...row };
        },
      };
    },
    close: (): void => {
      driver.close();
    },
  };
}

/** A prepared query that can also execute a write. */
export interface WritablePreparedQuery extends PreparedQuery {
  run(...params: SqlValue[]): void;
}

/** A writable handle over a SQLite *copy*. */
export interface WritableDatabase extends Database {
  prepare(sql: string): WritablePreparedQuery;
  exec(sql: string): void;
}

/**
 * Open a SQLite file for writing — permitted ONLY for a copy. `assertCopyTarget`
 * runs first and throws before the driver touches the file if the path is a live
 * `memory.db` or is not under a `tmp/` directory. This is how DS4 mutates state
 * during parity proofs without ever risking the authors' real database.
 */
export function openDatabaseCopyForWrite(path: string): WritableDatabase {
  assertCopyTarget(path);
  const driver = new DatabaseSync(path);
  return {
    prepare(sql: string): WritablePreparedQuery {
      const statement = driver.prepare(sql);
      return {
        all: (...params: SqlValue[]): Row[] =>
          (statement.all(...params) as Row[]).map((row) => ({ ...row })),
        get: (...params: SqlValue[]): Row | undefined => {
          const row = statement.get(...params) as Row | undefined;
          return row === undefined ? undefined : { ...row };
        },
        run: (...params: SqlValue[]): void => {
          statement.run(...params);
        },
      };
    },
    exec: (sql: string): void => {
      driver.exec(sql);
    },
    close: (): void => {
      driver.close();
    },
  };
}
