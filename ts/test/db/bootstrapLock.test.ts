import assert from "node:assert/strict";
import {
  closeSync,
  existsSync,
  constants as fsConstants,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { acquireBootstrapLock, BootstrapLockTimeoutError } from "#db/bootstrapLock.ts";

function tmpDbPath(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-lock-"));
  return {
    dbPath: join(dir, "memory.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function writeRawLock(dbPath: string, record: { pid: number; createdAt: number }): void {
  const lockPath = `${dbPath}.bootstrap.lock`;
  const fd = openSync(lockPath, fsConstants.O_CREAT | fsConstants.O_WRONLY, 0o600);
  writeSync(fd, JSON.stringify(record));
  closeSync(fd);
}

test("acquire then release lets a second acquire succeed immediately", () => {
  const ws = tmpDbPath();
  try {
    const first = acquireBootstrapLock(ws.dbPath);
    first.release();
    const second = acquireBootstrapLock(ws.dbPath, { timeoutMs: 200 });
    second.release();
  } finally {
    ws.cleanup();
  }
});

test("release is idempotent — calling it twice does not throw", () => {
  const ws = tmpDbPath();
  try {
    const lock = acquireBootstrapLock(ws.dbPath);
    lock.release();
    assert.doesNotThrow(() => lock.release());
  } finally {
    ws.cleanup();
  }
});

// A5 — a stale lock left by a dead process is reclaimed within the bound.
test("a lock left by a dead process pid is reclaimed and acquisition proceeds", () => {
  const ws = tmpDbPath();
  try {
    // A pid astronomically unlikely to be alive on any real system, and if it
    // were, process.kill(pid, 0) would still just report "alive" — the test
    // only needs a pid that reliably reports dead (ESRCH) in CI containers.
    const deadPid = 999_999;
    writeRawLock(ws.dbPath, { pid: deadPid, createdAt: Date.now() });
    const start = Date.now();
    const lock = acquireBootstrapLock(ws.dbPath, { timeoutMs: 2000, pollIntervalMs: 10 });
    const elapsed = Date.now() - start;
    lock.release();
    assert.ok(elapsed < 2000, `expected fast reclamation, took ${elapsed}ms`);
  } finally {
    ws.cleanup();
  }
});

// --- CR084: a lock is never visible without its record ----------------------
//
// Until CR084 the lock was created (O_EXCL) and its record written in a second
// syscall. A contender that read the file in between saw it empty, took
// "unreadable" as abandonment, removed the live holder's lock, and took its
// own: two holders, two migrations, two backups racing on one path. It was
// migrateOnOpenConcurrency's intermittent red, on CI three times.
//
// The record is now written to a private file and hard-linked into place, so
// the lock path never holds an empty lock -- and unreadable content stops being
// evidence of abandonment. The test below said the opposite until CR084 and is
// reversed rather than deleted.

function writeUnreadableLock(dbPath: string, ageMs: number): string {
  const lockPath = `${dbPath}.bootstrap.lock`;
  writeFileSync(lockPath, "", { mode: 0o600 });
  const then = (Date.now() - ageMs) / 1000;
  utimesSync(lockPath, then, then);
  return lockPath;
}

test("a young unreadable lock is NOT abandonment: the contender waits, then times out (CR084)", () => {
  const ws = tmpDbPath();
  try {
    writeUnreadableLock(ws.dbPath, 0);
    assert.throws(
      () => acquireBootstrapLock(ws.dbPath, { timeoutMs: 200, pollIntervalMs: 20 }),
      BootstrapLockTimeoutError,
    );
  } finally {
    ws.cleanup();
  }
});

test("an unreadable lock older than staleMs is reclaimed by its file's age", () => {
  // A leftover from before CR084, or corruption, must not block every
  // bootstrap forever: it ages out like any other lock.
  const ws = tmpDbPath();
  try {
    writeUnreadableLock(ws.dbPath, 10_000);
    const lock = acquireBootstrapLock(ws.dbPath, {
      timeoutMs: 1000,
      staleMs: 500,
      pollIntervalMs: 10,
    });
    lock.release();
  } finally {
    ws.cleanup();
  }
});

test("release removes only a lock it still owns (CR084)", () => {
  const ws = tmpDbPath();
  try {
    const lockPath = `${ws.dbPath}.bootstrap.lock`;
    const mine = acquireBootstrapLock(ws.dbPath);
    // Another process reclaimed and re-acquired the path meanwhile.
    rmSync(lockPath);
    writeRawLock(ws.dbPath, { pid: process.ppid, createdAt: Date.now() });

    mine.release();

    assert.ok(existsSync(lockPath), "the other process's lock survives my release");
    assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).pid, process.ppid);
  } finally {
    ws.cleanup();
  }
});

test("acquiring leaves no private record file behind, won or lost", () => {
  const ws = tmpDbPath();
  try {
    const lock = acquireBootstrapLock(ws.dbPath);
    assert.throws(
      () => acquireBootstrapLock(ws.dbPath, { timeoutMs: 100, pollIntervalMs: 20 }),
      BootstrapLockTimeoutError,
    );
    lock.release();
    assert.deepEqual(readdirSync(dirname(ws.dbPath)), []);
  } finally {
    ws.cleanup();
  }
});

test("an aged lock past staleMs is reclaimed even if the recorded pid happens to be alive", () => {
  const ws = tmpDbPath();
  try {
    // Use our own pid — definitely alive — but backdate createdAt beyond staleMs.
    writeRawLock(ws.dbPath, { pid: process.pid, createdAt: Date.now() - 10_000 });
    const lock = acquireBootstrapLock(ws.dbPath, {
      timeoutMs: 1000,
      staleMs: 500,
      pollIntervalMs: 10,
    });
    lock.release();
  } finally {
    ws.cleanup();
  }
});

// A6 — a live holder that never releases fails the contender closed, bounded.
test("a live holder that never releases makes the contender fail with a bounded timeout error", () => {
  const ws = tmpDbPath();
  try {
    // Our own pid is alive and freshly created — a genuinely "live" holder.
    writeRawLock(ws.dbPath, { pid: process.pid, createdAt: Date.now() });
    const start = Date.now();
    assert.throws(
      () => acquireBootstrapLock(ws.dbPath, { timeoutMs: 200, pollIntervalMs: 20 }),
      BootstrapLockTimeoutError,
    );
    const elapsed = Date.now() - start;
    // Bound, not exact sleep: must fail at/after the timeout, and well before
    // an unbounded hang (2x timeout as an outer sanity bound, per plan).
    assert.ok(elapsed >= 190, `expected to wait ~200ms before failing, waited ${elapsed}ms`);
    assert.ok(elapsed < 400, `expected to fail before 2x timeout, waited ${elapsed}ms`);
  } finally {
    ws.cleanup();
  }
});
