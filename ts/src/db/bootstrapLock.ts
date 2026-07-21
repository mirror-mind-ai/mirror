// Cross-process bootstrap lock — CV22.DS6.TS3.
//
// TS equivalent of Python's sibling `.bootstrap.lock` + `fcntl.flock(LOCK_EX)`
// (`src/memory/db/connection.py::_bootstrap_lock`). Serializes the bootstrap
// phase (pragma discipline + migrations + schema DDL) for one database path
// across concurrent *processes*.
//
// Zero-dependency by design (Navigator decision, CV22.DS6.TS3 plan): no native
// `flock` addon, because CV22's endgame is a single-language npm package. The
// primitive is an atomic exclusive file create (`O_CREAT|O_EXCL|O_NOFOLLOW`),
// which every POSIX and Windows filesystem Node targets treats as a true
// atomic operation — exactly one caller can win a given `open()` call.
//
// The one honest gap against `fcntl.flock`: an OS-level flock is released
// automatically when its holding process dies, no matter how. A lock *file*
// is not — it survives a crash unless something notices and removes it. This
// module's accepted parity equivalent (Navigator decision) is stale-lock
// reclamation: a lock is considered abandoned, and safe to reclaim, when its
// recorded holder process is no longer alive (`process.kill(pid, 0)` failing
// with ESRCH) or its file is older than `staleMs`. Reclamation is a trust
// decision, not a hard guarantee — see the security review recorded in this
// story's plan: prefer waiting too long over breaking a live lock.

import {
  closeSync,
  constants as fsConstants,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
} from "node:fs";

/** Raised when a lock cannot be acquired within the configured timeout. */
export class BootstrapLockTimeoutError extends Error {}

export interface BootstrapLockOptions {
  /** Total time to wait for a live lock before failing closed. Default 30s. */
  timeoutMs?: number;
  /** Age after which an unreadable/corrupt or dead-holder lock is reclaimed. Default 30s. */
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
    return { pid: parsed.pid, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

function isStale(lockPath: string, staleMs: number): boolean {
  const record = readLockRecord(lockPath);
  // Unreadable or corrupt lock content is itself evidence of abandonment
  // (a live holder always writes a well-formed record right after creating
  // the file) — treat as stale.
  if (record === null) return true;
  if (!isProcessAlive(record.pid)) return true;
  return Date.now() - record.createdAt > staleMs;
}

function tryCreateExclusive(lockPath: string): number | null {
  try {
    // O_NOFOLLOW: refuse to write through a pre-planted symlink at the lock
    // path (CR030-style indirection guard, security review for this story).
    return openSync(
      lockPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return null;
    throw error;
  }
}

/**
 * Acquire the cross-process bootstrap lock for `dbPath`, blocking (via bounded
 * synchronous polling) until it is held, a live holder's lock is released, or
 * `timeoutMs` elapses. Reclaims a stale lock (dead holder or aged past
 * `staleMs`) rather than waiting on it forever.
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
  let released = false;

  for (;;) {
    const fd = tryCreateExclusive(lockPath);
    if (fd !== null) {
      writeSync(
        fd,
        JSON.stringify({ pid: process.pid, createdAt: Date.now() } satisfies LockRecord),
      );
      closeSync(fd);
      return {
        release: (): void => {
          if (released) return;
          released = true;
          try {
            rmSync(lockPath, { force: true });
          } catch {
            // Already gone (e.g. reclaimed by another process after a crash
            // between our create and this release) — nothing to do.
          }
        },
      };
    }

    if (isStale(lockPath, staleMs)) {
      try {
        rmSync(lockPath, { force: true });
      } catch {
        // Another process reclaimed it first; loop and race for create again.
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
