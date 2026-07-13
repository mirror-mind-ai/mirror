// Write-parity core for the DS4 deterministic-write strangler.
//
// The read harness (`realDbCopyParity.ts`) grades *ordered ids* from a read. A
// write mutates rows, so this module grades a *state transition*: the mutated
// rows produced by the Python oracle are compared against the mutated rows
// produced by the TS core, by hashing a canonical serialization. Evidence is
// redacted by default (label, row count, hashes, match) — never raw cell values,
// matching the DS2.TS3 privacy posture. The copy-only guard that keeps writes off
// the live database is a db-seam concern and lives in `db/copyGuard.ts`.

import { createHash } from "node:crypto";

/** A SQLite-storable scalar as seen after a deterministic write. */
export type WriteCell = string | number | bigint | boolean | null;

/** One mutated row: its id plus the columns the write touched. */
export interface MutatedRow {
  id: string;
  cells: Record<string, WriteCell>;
}

/** Redacted verdict for one write probe (Python oracle vs TS core). */
export interface WriteProbeParityResult {
  label: string;
  mutatedRowCount: number;
  pythonStateHash: string;
  tsStateHash: string;
  match: boolean;
  /** Present only when sensitive debug is explicitly requested. */
  pythonState?: MutatedRow[];
  tsState?: MutatedRow[];
}

const UNIT = "\u001f";
const RECORD = "\u001e";

/**
 * Serialize a cell to a canonical, type-tagged string so structurally distinct
 * values (e.g. the number `3` and the string `"3"`, or `null`) never collide.
 */
function serializeCell(value: WriteCell): string {
  if (value === null) return "\u0000null";
  if (typeof value === "bigint") return `i${value.toString()}`;
  if (typeof value === "number") return `n${Object.is(value, -0) ? "0" : String(value)}`;
  if (typeof value === "boolean") return `b${value ? "1" : "0"}`;
  return `s${value}`;
}

function canonicalRow(row: MutatedRow): string {
  const cells = Object.keys(row.cells)
    .sort()
    .map((key) => `${key}=${serializeCell(row.cells[key])}`)
    .join(UNIT);
  return `${row.id}${UNIT}${cells}`;
}

/**
 * Hash a set of mutated rows independent of row and column ordering, so parity
 * reflects the resulting state rather than iteration order.
 */
export function stateHash(rows: readonly MutatedRow[]): string {
  const canonical = [...rows]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(canonicalRow)
    .join(RECORD);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Grade one write probe: PASS when the Python and TS mutations are identical. */
export function evaluateWriteProbe(
  label: string,
  pythonRows: readonly MutatedRow[],
  tsRows: readonly MutatedRow[],
  options: { includeSensitiveDebug?: boolean } = {},
): WriteProbeParityResult {
  const pythonStateHash = stateHash(pythonRows);
  const tsStateHash = stateHash(tsRows);
  const match = pythonStateHash === tsStateHash;
  return {
    label,
    mutatedRowCount: pythonRows.length,
    pythonStateHash,
    tsStateHash,
    match,
    ...(options.includeSensitiveDebug
      ? { pythonState: [...pythonRows], tsState: [...tsRows] }
      : {}),
  };
}

/** Render an ordered, redacted verdict for a set of write probes. */
export function renderRedactedWriteReport(results: readonly WriteProbeParityResult[]): string {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`probe: ${result.label}`);
    lines.push(`mutated_row_count: ${result.mutatedRowCount}`);
    lines.push(`python_state_hash: ${result.pythonStateHash}`);
    lines.push(`ts_state_hash: ${result.tsStateHash}`);
    lines.push(`match: ${result.match ? "true" : "false"}`);
    lines.push("");
  }
  const passed = results.every((result) => result.match);
  lines.push(`overall_match: ${passed ? "true" : "false"}`);
  return `${lines.join("\n")}\n`;
}
