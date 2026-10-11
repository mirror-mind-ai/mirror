// Cross-process bootstrap lock — CV22.DS6.TS3.
//
// TS equivalent of Python's sibling `.bootstrap.lock` + `fcntl.flock(LOCK_EX)`
// (`src/memory/db/connection.py::_bootstrap_lock`). Serializes the bootstrap
// phase (pragma discipline + migrations + schema DDL) for one database path
// across concurrent *processes*.
//
// Zero-dependency by design (Navigator decision, CV22.DS6.TS3 plan): no native
// `flock` addon, because CV22's endgame is a single-language npm package. The
// primitive is an atomic exclusive link: the holder's record is written to a
// file only it names, then `link()`ed to the lock path, which fails with
// `EEXIST` while any lock is there. Every POSIX and Windows filesystem Node
// targets treats that as atomic -- exactly one caller wins a given path.
//
// Why link and not `O_CREAT|O_EXCL` (CR084). Creating the lock file and then
// writing its record were two syscalls, and between them the lock existed
// EMPTY. A contender that read it then took "unreadable" as abandonment,
// removed the live holder's lock, and took its own: two holders, two migration
// runs, two backups racing on one path. It surfaced as migrateOnOpenConcurrency's
// intermittent red, on CI three times. With the record in place before the path
// exists, no live holder's lock is ever unreadable -- so unreadable content is no
// longer evidence of abandonment, and ages out by the file's mtime instead.
//
// The one honest gap against `fcntl.flock`: an OS-level flock is released
// automatically when its holding process dies, no matter how. A lock *file*
// is not — it survives a crash unless something notices and removes it. This
// module's accepted parity equivalent (Navigator decision) is stale-lock
// reclamation: a lock is considered abandoned, and safe to reclaim, when its
// recorded holder process is no longer alive (`process.kill(pid, 0)` failing
// with ESRCH) or its record is older than `staleMs`. Reclamation is a trust
// decision, not a hard guarantee — see the security review recorded in this
// story's plan: prefer waiting too long over breaking a live lock.
//
// Removal, by a release or a reclaim, checks that the lock at the path is still
// the one it judged (CR084): otherwise a slow process could free a lock another
// process acquired in between. A read-then-remove leaves a window of one read
// and one unlink, far narrower than the judge-then-remove it replaces; closing
// it entirely would need an OS lock, which this module chose not to depend on.

import { randomBytes } from "node:crypto";
import { linkSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";

/** Raised when a lock cannot be acquired within the configured timeout. */
export class BootstrapLockTimeoutError extends Error {}

export interface BootstrapLockOptions {
  /** Total time to wait for a live lock before failing closed. Default 30s. */
  timeoutMs?: number;
  /** Age after which a dead-holder, aged, or unreadable lock is reclaimed. Default 30s. */
  staleMs?: number;
  /** Backoff between contention retries. Default 50ms. */
  pollIntervalMs?: number;
}

export interface BootstrapLockHandle {
  /** Release the lock. Idempotent; safe to call once, always, in a `finally`. */
  release(): void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STALE_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 50;

interface LockRecord {
  pid: number;
  createdAt: number;
  /** Tells apart two locks one process takes within the same millisecond. */
  nonce?: string;
}

function lockPathFor(dbPath: string): string {
  return `${dbPath}.bootstrap.lock`;
}

/** Synchronous sleep — bootstrap runs once at startup, before anything is
 * served, so blocking the event loop here is an accepted, bootstrap-only
 * exception (see the engineer review in this story's plan). Do not reuse
 * this pattern on any runtime request path. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ESRCH: no such process — definitively dead. EPERM: exists, owned by
    // someone else — treat as alive (fail toward waiting, not reclaiming).
    return code !== "ESRCH";
  }
}

function readLockRecord(lockPath: string): LockRecord | null {
  try {
    const raw = readFileSync(lockPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockRecord>;
    if (typeof parsed.pid !== "number" || typeof parsed.createdAt !== "number") return null;
    return {
      pid: parsed.pid,
      createdAt: parsed.createdAt,
      ...(typeof parsed.nonce === "string" ? { nonce: parsed.nonce } : {}),
    };
  } catch {
    return null;
  }
}

function sameRecord(a: LockRecord | null, b: LockRecord | null): boolean {
  if (a === null || b === null) return a === b;
  return a.pid === b.pid && a.createdAt === b.createdAt && a.nonce === b.nonce;
}

/**
 * Is the lock at `lockPath` abandoned, and what did it hold when judged?
 *
 * A readable record is abandoned when its holder is dead or it is older than
 * `staleMs`. An unreadable one is corruption or a pre-CR084 leftover -- a live
 * holder's record is in the file before the file is at the path -- so it is
 * judged by the file's own age rather than taken as abandoned on sight.
 */
function judgeLock(
  lockPath: string,
  staleMs: number,
): { abandoned: boolean; record: LockRecord | null } {
  const record = readLockRecord(lockPath);
  if (record !== null) {
    const abandoned = !isProcessAlive(record.pid) || Date.now() - record.createdAt > staleMs;
    return { abandoned, record };
  }
  try {
    return { abandoned: Date.now() - statSync(lockPath).mtimeMs > staleMs, record: null };
  } catch {
    // Gone since the read: nothing to reclaim, and the next create may win.
    return { abandoned: false, record: null };
  }
}

/** Remove the lock at `lockPath` only while it still holds `judged` (CR084). */
function removeLockIfUnchanged(lockPath: string, judged: LockRecord | null): void {
  if (sameRecord(readLockRecord(lockPath), judged)) rmSync(lockPath, { force: true });
}

/**
 * Try to take the lock: write `record` to a file only this call names, then
 * link that file to the lock path. `EEXIST` means a lock is already there.
 * The private file goes either way; the lock path keeps the linked copy.
 */
function tryLink(lockPath: string, record: LockRecord): boolean {
  const privatePath = `${lockPath}.${process.pid}-${record.nonce}.tmp`;
  // `wx`: exclusive create, so a file planted at the private name refuses the
  // write instead of being written through (the O_NOFOLLOW guard the previous
  // `openSync` carried, security review for CV22.DS6.TS3).
  writeFileSync(privatePath, JSON.stringify(record), { mode: 0o600, flag: "wx" });
  try {
    linkSync(privatePath, lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(privatePath, { force: true });
  }
}

/**
 * Acquire the cross-process bootstrap lock for `dbPath`, blocking (via bounded
 * synchronous polling) until it is held, a live holder's lock is released, or
 * `timeoutMs` elapses. Reclaims an abandoned lock (dead holder, aged past
 * `staleMs`, or unreadable and aged past `staleMs`) rather than waiting on it
 * forever.
 */
export function acquireBootstrapLock(
  dbPath: string,
  options: BootstrapLockOptions = {},
): BootstrapLockHandle {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const lockPath = lockPathFor(dbPath);
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const record: LockRecord = {
      pid: process.pid,
      createdAt: Date.now(),
      nonce: randomBytes(6).toString("hex"),
    };
    if (tryLink(lockPath, record)) {
      let released = false;
      return {
        release: (): void => {
          if (released) return;
          released = true;
          try {
            removeLockIfUnchanged(lockPath, record);
          } catch {
            // Already gone -- nothing of ours left to remove.
          }
        },
      };
    }

    const { abandoned, record: judged } = judgeLock(lockPath, staleMs);
    if (abandoned) {
      try {
        removeLockIfUnchanged(lockPath, judged);
      } catch {
        // Another process reclaimed it first; loop and race for the link again.
      }
      continue;
    }

    if (Date.now() >= deadline) {
      throw new BootstrapLockTimeoutError(
        `timed out after ${timeoutMs}ms waiting for the bootstrap lock at ${lockPath} ` +
          "(another process is bootstrapping this database)",
      );
    }
    sleepSync(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
  }
}
