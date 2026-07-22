import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseReadOnly } from "../../src/db/database.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";
import { tryOpenDbForConsultLogging } from "../../src/frontDoor/cli.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";

// First-run contract (CV22.DS6.TS4): a front-door command against a *missing*
// database bootstraps it through the TS core (bootstrapDatabase), not by
// delegating to Python. These self-heal tests are hermetic: they run with a
// PATH that cannot resolve `uv`, so success proves TS — not the Python fallback
// (which would ENOENT) — created and migrated the database. This replaces the
// former CR015 contract where a missing DB self-healed via Python.

function freshWorkspace(): { dbPath: string; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-firstrun-"));
  return {
    dbPath: join(dir, "memory.db"),
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** An empty directory used as PATH so a `uv` (Python fallback) spawn cannot
 * resolve — the discriminator that a passing self-heal was done by TS. */
function uvFreeEnv(): { env: { PATH: string }; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-nopath-"));
  return { env: { PATH: dir }, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function assertCurrentSchema(dbPath: string): void {
  const db = openDatabaseReadOnly(dbPath);
  try {
    assert.equal(
      (db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string })?.journal_mode,
      "wal",
    );
    assert.equal(
      (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number })?.foreign_keys,
      1,
    );
    const ledger = (db.prepare("SELECT id FROM _migrations").all() as { id: string }[])
      .map((row) => row.id)
      .sort();
    assert.deepEqual(ledger, [...KNOWN_MIGRATION_IDS].sort());
  } finally {
    db.close();
  }
}

test("read command on a missing DB self-heals via TS bootstrap (uv unreachable)", () => {
  const ws = freshWorkspace();
  const uv = uvFreeEnv();
  try {
    assert.ok(!existsSync(ws.dbPath), "precondition: database absent");
    const result = spawnFrontDoor(["journeys", "--db-path", ws.dbPath], uv.env);
    assert.equal(result.status, 0, `expected TS self-heal, got ${result.status}: ${result.stderr}`);
    assert.ok(existsSync(ws.dbPath), "TS should have bootstrapped the database");
    assertCurrentSchema(ws.dbPath);
  } finally {
    ws.cleanup();
    uv.cleanup();
  }
});

test("write command on a missing DB self-heals via TS bootstrap, backs up, and writes", () => {
  const ws = freshWorkspace();
  const uv = uvFreeEnv();
  try {
    const result = spawnFrontDoor(
      ["identity", "set", "ego", "probe", "--content", "# One", "--db-path", ws.dbPath],
      uv.env,
    );
    assert.equal(
      result.status,
      0,
      `expected write self-heal, got ${result.status}: ${result.stderr}`,
    );
    assert.match(result.stdout, /ego\/probe created/);
    assert.ok(existsSync(ws.dbPath), "TS should have bootstrapped the database");
    assert.ok(
      existsSync(join(ws.dir, "backups", "frontdoor-pre-write-backup.db")),
      "pre-write backup taken on the freshly bootstrapped DB",
    );
    const db = openDatabaseReadOnly(ws.dbPath);
    const row = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get("ego", "probe");
    db.close();
    assert.equal(row?.content, "# One");
  } finally {
    ws.cleanup();
    uv.cleanup();
  }
});

test("a second run on the now-bootstrapped DB does not re-bootstrap or leave a lock", () => {
  const ws = freshWorkspace();
  const uv = uvFreeEnv();
  try {
    assert.equal(spawnFrontDoor(["journeys", "--db-path", ws.dbPath], uv.env).status, 0);
    assert.equal(spawnFrontDoor(["journeys", "--db-path", ws.dbPath], uv.env).status, 0);
    assertCurrentSchema(ws.dbPath);
    assert.ok(!existsSync(`${ws.dbPath}.bootstrap.lock`), "no bootstrap lock left behind");
  } finally {
    ws.cleanup();
    uv.cleanup();
  }
});

test("consult logging does not bootstrap a missing DB (fail-soft scope boundary)", () => {
  const ws = freshWorkspace();
  try {
    const db = tryOpenDbForConsultLogging(["consult", "some-model", "hi", "--db-path", ws.dbPath]);
    assert.equal(db, null, "consult logging must not open a DB when the file is absent");
    assert.ok(
      !existsSync(ws.dbPath),
      "consult must not create a database as a logging side effect",
    );
  } finally {
    ws.cleanup();
  }
});
