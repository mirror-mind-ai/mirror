// Backup gate for destructive write-parity runs.
//
// The copy-only guard (`copyGuard.ts`) keeps writes off the live database; this
// gate adds the second half of the discipline: a hash-verified backup of the
// source must exist before any destructive apply. The harness refuses to run if
// the recorded backup is missing or its bytes have changed, so a parity run is
// always recoverable.

import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";

/** Raised when the required pre-write backup is missing or altered. */
export class BackupGateError extends Error {}

/** A recorded backup: a file path and the sha256 of its bytes when recorded. */
export interface BackupRecord {
  path: string;
  sha256: string;
}

/** Hash a file's bytes as lowercase-hex sha256. */
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Require a present, hash-verified backup before any destructive apply. The
 * recorded path must be a regular file — a symlinked backup could be
 * redirected after verification, so indirection is refused (CR030).
 */
export function requireBackup(backup: BackupRecord | undefined): void {
  if (!backup?.path) {
    throw new BackupGateError("no backup recorded before a destructive write");
  }
  let isRegularFile: boolean;
  try {
    isRegularFile = lstatSync(backup.path).isFile();
  } catch {
    throw new BackupGateError(`recorded backup is missing: ${backup.path}`);
  }
  if (!isRegularFile) {
    throw new BackupGateError(`recorded backup is not a regular file: ${backup.path}`);
  }
  if (sha256File(backup.path) !== backup.sha256) {
    throw new BackupGateError("recorded backup hash does not match the backup file");
  }
}
