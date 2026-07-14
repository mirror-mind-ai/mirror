// Write-probe application for the DS4 write-parity harness.
//
// A probe applies a deterministic write to a DB *copy* and reports the resulting
// state of its target rows as `MutatedRow[]`, ready for `evaluateWriteProbe`.
// This is the DB-touching layer; the pure state-diff core stays in
// `writeParity.ts`.
//
// A probe declares one or more `SnapshotSpec`s, so a single write that touches
// several tables (e.g. `log_access` updates `memories` and inserts into
// `memory_access_log`) is graded as one state transition. Snapshots select rows
// by a `WHERE ... IN` clause rather than by known id, so newly INSERTed rows are
// captured too. Row ids are namespaced by table (`table:key`) so states from
// different tables never collide. Integer columns are normalized (safe bigint ->
// number) so a TS snapshot and a Python-oracle JSON fixture hash identically.

import type { WritableDatabase } from "../db/database.ts";
import type { MutatedRow, WriteCell } from "./writeParity.ts";

/** One table's contribution to a probe's snapshot. */
export interface SnapshotSpec {
  table: string;
  /** Column identifying each row; namespaced into `MutatedRow.id` as `table:key`. */
  keyColumn: string;
  /** Columns whose values are compared. */
  columns: string[];
  /** Restrict the snapshot to rows where this column is in `selectorValues`. */
  selectorColumn: string;
  selectorValues: string[];
}

/** A deterministic write plus the multi-table snapshot whose state is graded. */
export interface WriteProbe {
  label: string;
  snapshots: SnapshotSpec[];
  /**
   * Mutate the copy. Any time-based write is stamped from a frozen clock the
   * probe closes over (the oracle's `now_iso`), so the transition is
   * deterministic without threading a clock argument through the seam.
   */
  apply(db: WritableDatabase): void;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Snapshot identifiers (table/columns) are interpolated into SQL, so they must
 * be trusted. Probes are internal harness definitions, never user input, but we
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

function snapshotSpec(db: WritableDatabase, spec: SnapshotSpec): MutatedRow[] {
  assertIdentifier(spec.table);
  assertIdentifier(spec.keyColumn);
  assertIdentifier(spec.selectorColumn);
  for (const column of spec.columns) {
    assertIdentifier(column);
  }
  if (spec.selectorValues.length === 0) {
    return [];
  }
  const selectColumns = [spec.keyColumn, ...spec.columns].join(", ");
  const placeholders = spec.selectorValues.map(() => "?").join(", ");
  const statement = db.prepare(
    `SELECT ${selectColumns} FROM ${spec.table} ` +
      `WHERE ${spec.selectorColumn} IN (${placeholders}) ORDER BY ${spec.keyColumn}`,
  );
  return statement.all(...spec.selectorValues).map((row) => {
    const cells: Record<string, WriteCell> = {};
    for (const column of spec.columns) {
      cells[column] = normalizeCell(row[column]);
    }
    return { id: `${spec.table}:${String(row[spec.keyColumn])}`, cells };
  });
}

/** Read every snapshot spec's rows as normalized, table-namespaced `MutatedRow[]`. */
export function snapshotState(db: WritableDatabase, probe: WriteProbe): MutatedRow[] {
  return probe.snapshots.flatMap((spec) => snapshotSpec(db, spec));
}

/** Apply a probe to a writable copy, then snapshot the resulting state. */
export function applyWriteProbe(db: WritableDatabase, probe: WriteProbe): MutatedRow[] {
  probe.apply(db);
  return snapshotState(db, probe);
}
