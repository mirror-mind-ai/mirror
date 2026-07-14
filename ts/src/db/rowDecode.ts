// Row decoding helpers for the database seam (CR010).
//
// `Row` is `Record<string, unknown>`, so every consumer would otherwise cast
// columns with `as string` and hope. These helpers centralize the unsafety and
// fail with a clear, column-named error when a column has an unexpected shape,
// turning a silent wrong-type bug into an actionable one.

import type { Row } from "./database.ts";

function describe(value: unknown): string {
  return value === null ? "null" : typeof value;
}

/** Require a non-null string column, or throw naming the column and actual type. */
export function requireString(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`row column "${column}": expected string, got ${describe(value)}`);
  }
  return value;
}

/** A string column that may be null/absent (returned as null), else validated. */
export function optionalString(row: Row, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`row column "${column}": expected string or null, got ${describe(value)}`);
  }
  return value;
}

/** A numeric column that may be null/absent; bigint is narrowed to number. */
export function optionalNumber(row: Row, column: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "number") {
    throw new Error(`row column "${column}": expected number or null, got ${describe(value)}`);
  }
  return value;
}
