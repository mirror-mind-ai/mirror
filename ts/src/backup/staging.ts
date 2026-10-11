// The staging rule every Mirror backup writer shares (CR061).
//
// A writer stages its output under a name carrying its process id and a random
// token, then promotes it with an atomic rename, so two writers can never write
// into one file. A staging entry is abandoned -- and may be removed -- only when
// BOTH hold: the process it names no longer runs, AND it is older than any
// snapshot takes. Either test alone could remove an entry still being written:
// a reused pid, a slow disk. Housekeeping never stands between a user and a
// backup: any error leaves the entry where it is.
//
// Extracted from `liveBackup.ts` (finding N4), where the pre-write snapshot
// introduced it, so the dated archive follows the same rule rather than a copy
// of it that could drift.

import { randomBytes } from "node:crypto";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/** Older than any snapshot takes: `VACUUM INTO` of a real home runs in well under a second. */
export const ABANDONED_AFTER_MS = 10 * 60 * 1000;

/** `<pid>-<12 hex>`: unique to this process and this call. */
export function stagingToken(): string {
  return `${process.pid}-${randomBytes(6).toString("hex")}`;
}

/** Does a process with this id still run? */
export function processRuns(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists and belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Remove the entries of `dir` that `pattern` matches -- its first capture group
 * is the writer's pid -- whose writer is gone. An entry may be a file or a
 * directory; a directory is removed with its contents.
 */
export function sweepAbandoned(dir: string, pattern: RegExp, now = Date.now()): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const match = pattern.exec(entry);
    if (!match) continue;
    const path = join(dir, entry);
    try {
      if (now - statSync(path).mtimeMs < ABANDONED_AFTER_MS) continue;
      if (processRuns(Number(match[1]))) continue;
      rmSync(path, { recursive: true, force: true });
    } catch {
      // Left for the next backup.
    }
  }
}
