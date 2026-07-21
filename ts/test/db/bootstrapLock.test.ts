import assert from "node:assert/strict";
import {
  closeSync,
  constants as fsConstants,
  mkdtempSync,
  openSync,
  rmSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { acquireBootstrapLock, BootstrapLockTimeoutError } from "../../src/db/bootstrapLock.ts";

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

test("a corrupt/unreadable lock record is treated as stale and reclaimed", () => {
  const ws = tmpDbPath();
  try {
    const lockPath = `${ws.dbPath}.bootstrap.lock`;
    const fd = openSync(lockPath, fsConstants.O_CREAT | fsConstants.O_WRONLY, 0o600);
    writeSync(fd, "not json");
    closeSync(fd);
    const lock = acquireBootstrapLock(ws.dbPath, { timeoutMs: 1000, pollIntervalMs: 10 });
    lock.release();
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
