// FTS5 integrity assertion for the database seam (CR021).
//
// `memories_fts` is an external-content FTS5 table kept in sync by triggers on
// `memories`. A write that fires those triggers can, in principle, leave the
// index inconsistent (the external-content "ghost row" failure mode). Nothing
// in the system ran FTS5's own integrity check; this exposes it so the
// write-parity harness can grade the FTS side-effect and a health surface can
// verify it.

import type { WritableDatabase } from "./database.ts";

/** Raised when the FTS5 integrity check reports a corrupt/inconsistent index. */
export class FtsIntegrityError extends Error {}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function tableExists(db: WritableDatabase, name: string): boolean {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  );
}

/**
 * Run FTS5's `integrity-check` for `ftsTable`, throwing `FtsIntegrityError` if
 * the index is inconsistent with its content table. A no-op when the table is
 * absent, so callers can invoke it unconditionally on any copy. Requires a
 * writable handle (the check is issued as an FTS5 command INSERT).
 */
export function assertFtsIntegrity(db: WritableDatabase, ftsTable = "memories_fts"): void {
  if (!IDENTIFIER.test(ftsTable)) {
    throw new FtsIntegrityError(`unsafe FTS table identifier: ${ftsTable}`);
  }
  if (!tableExists(db, ftsTable)) return;
  try {
    db.prepare(`INSERT INTO ${ftsTable}(${ftsTable}) VALUES('integrity-check')`).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FtsIntegrityError(`FTS integrity check failed for ${ftsTable}: ${message}`);
  }
}
