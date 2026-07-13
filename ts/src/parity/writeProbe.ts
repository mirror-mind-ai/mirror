// Write-probe application for the DS4 write-parity harness.
//
// A probe applies a deterministic write to a DB *copy* and reports the resulting
// state of its target rows as `MutatedRow[]`, ready for `evaluateWriteProbe`.
// This is the DB-touching layer; the pure state-diff core stays in
// `writeParity.ts`. Integer columns are normalized (safe bigint -> number) so a
// TS snapshot and a Python-oracle JSON fixture hash identically.

import type { WritableDatabase } from "../db/database.ts";
import type { MutatedRow, WriteCell } from "./writeParity.ts";

/** A deterministic write plus the target rows whose post-write state is graded. */
export interface WriteProbe {
  label: string;
  table: string;
  idColumn: string;
  columns: string[];
  targetIds: string[];
  /** Mutate the copy. `frozenNowMs` stamps any time-based write deterministically. */
  apply(db: WritableDatabase, frozenNowMs: number): void;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Probe identifiers (table/columns) are interpolated into SQL, so they must be
 * trusted. Probes are internal harness definitions, never user input, but we
 * still fail closed on anything but a plain identifier.
 */
function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`unsafe SQL identifier in write probe: ${name}`);
  }
}

/** Normalize a driver cell so a safe integer never differs from a JSON number. */
function normalizeCell(value: unknown): WriteCell {
  if (value === null) return null;
  if (typeof value === "bigint") {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  throw new Error(`unsupported write-parity cell type: ${typeof value}`);
}

/** Read the target rows' snapshot columns as normalized `MutatedRow[]`. */
export function snapshotRows(db: WritableDatabase, probe: WriteProbe): MutatedRow[] {
  assertIdentifier(probe.table);
  assertIdentifier(probe.idColumn);
  for (const column of probe.columns) {
    assertIdentifier(column);
  }
  const columnList = [probe.idColumn, ...probe.columns].join(", ");
  const statement = db.prepare(
    `SELECT ${columnList} FROM ${probe.table} WHERE ${probe.idColumn} = ?`,
  );
  return probe.targetIds.map((id) => {
    const row = statement.get(id);
    if (row === undefined) {
      throw new Error(`write-parity target row not found: ${probe.table}.${probe.idColumn}=${id}`);
    }
    const cells: Record<string, WriteCell> = {};
    for (const column of probe.columns) {
      cells[column] = normalizeCell(row[column]);
    }
    return { id: String(row[probe.idColumn]), cells };
  });
}

/** Apply a probe to a writable copy under a frozen now, then snapshot the result. */
export function applyWriteProbe(
  db: WritableDatabase,
  probe: WriteProbe,
  frozenNowMs: number,
): MutatedRow[] {
  probe.apply(db, frozenNowMs);
  return snapshotRows(db, probe);
}
