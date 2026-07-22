import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { bootstrapDatabase, bootstrapDatabaseIfMissing } from "../../src/db/bootstrap.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";

function tmpDbPath(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-bootstrap-"));
  return {
    dbPath: join(dir, "sub", "memory.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// A1 — pragma presence.
test("a fresh TS bootstrap reports journal_mode=wal, busy_timeout=30000, foreign_keys=ON", () => {
  const ws = tmpDbPath();
  try {
    const db = bootstrapDatabase(ws.dbPath);
    try {
      assert.equal(
        (db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string })?.journal_mode,
        "wal",
      );
      assert.equal(
        (db.prepare("PRAGMA busy_timeout").get() as { timeout?: number })?.timeout,
        30000,
      );
      assert.equal(
        (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number })?.foreign_keys,
        1,
      );
    } finally {
      db.close();
    }
  } finally {
    ws.cleanup();
  }
});

test("bootstrap creates the parent directory owner-only when it did not exist", () => {
  const ws = tmpDbPath();
  try {
    const db = bootstrapDatabase(ws.dbPath);
    db.close();
    assert.ok(existsSync(ws.dbPath));
    // POSIX-only assertion; skip mode bits on platforms without them.
    const mode = statSync(join(ws.dbPath, "..")).mode & 0o777;
    if (process.platform !== "win32") {
      assert.equal(mode, 0o700);
    }
  } finally {
    ws.cleanup();
  }
});

// TS4 — first-run seam: bootstrap only when the file is absent.
test("bootstrapDatabaseIfMissing creates a current-schema DB when the file is absent", () => {
  const ws = tmpDbPath();
  try {
    assert.ok(!existsSync(ws.dbPath), "precondition: database absent");
    bootstrapDatabaseIfMissing(ws.dbPath);
    assert.ok(existsSync(ws.dbPath), "the helper should have created the database");
    // No dangling handle or lock: a follow-up bootstrap and cleanup both work.
    assert.ok(!existsSync(`${ws.dbPath}.bootstrap.lock`), "no bootstrap lock left behind");
    const db = bootstrapDatabase(ws.dbPath);
    try {
      const ledger = (db.prepare("SELECT id FROM _migrations").all() as { id: string }[])
        .map((row) => row.id)
        .sort();
      assert.deepEqual(ledger, [...KNOWN_MIGRATION_IDS].sort());
    } finally {
      db.close();
    }
  } finally {
    ws.cleanup();
  }
});

test("bootstrapDatabaseIfMissing is a no-op when the database already exists", () => {
  const ws = tmpDbPath();
  try {
    const first = bootstrapDatabase(ws.dbPath);
    const before = (
      first.prepare("SELECT id FROM _migrations ORDER BY id").all() as {
        id: string;
      }[]
    ).map((row) => row.id);
    first.close();

    bootstrapDatabaseIfMissing(ws.dbPath);

    const reopened = bootstrapDatabase(ws.dbPath);
    try {
      const after = (
        reopened.prepare("SELECT id FROM _migrations ORDER BY id").all() as {
          id: string;
        }[]
      ).map((row) => row.id);
      assert.deepEqual(after, before);
    } finally {
      reopened.close();
    }
  } finally {
    ws.cleanup();
  }
});

// A3 — idempotency.
test("re-bootstrapping an already-bootstrapped database is a no-op", () => {
  const ws = tmpDbPath();
  try {
    const first = bootstrapDatabase(ws.dbPath);
    const rowsAfterFirst = first.prepare("SELECT id FROM _migrations ORDER BY id").all() as {
      id: string;
    }[];
    first.close();

    const second = bootstrapDatabase(ws.dbPath);
    try {
      const rowsAfterSecond = second.prepare("SELECT id FROM _migrations ORDER BY id").all() as {
        id: string;
      }[];
      assert.deepEqual(
        rowsAfterSecond.map((row) => row.id),
        rowsAfterFirst.map((row) => row.id),
      );
      assert.deepEqual(
        rowsAfterSecond.map((row) => row.id).sort(),
        [...KNOWN_MIGRATION_IDS].sort(),
      );
      // No duplicate rows: PRIMARY KEY + INSERT OR IGNORE already enforce this
      // structurally, but assert observably too.
      const distinctCount = (
        second.prepare("SELECT COUNT(DISTINCT id) AS c FROM _migrations").get() as { c: number }
      ).c;
      const totalCount = (
        second.prepare("SELECT COUNT(*) AS c FROM _migrations").get() as { c: number }
      ).c;
      assert.equal(distinctCount, totalCount);
    } finally {
      second.close();
    }
  } finally {
    ws.cleanup();
  }
});
