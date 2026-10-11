// CV22.DS7.TS3 plateau 3a — the extension migration read side.
//
// The status golden grades these through `runtime status`; this file pins the
// checksum contract and the filename rule directly, including the cases a
// status scenario cannot reach cleanly.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openDatabaseReadOnly } from "#db/database.ts";
import { ExtensionMigrationError } from "#extensions/errors.ts";
import {
  checksum,
  inspectMigrationFiles,
  listMigrationFiles,
  normaliseForChecksum,
  rawChecksum,
  tablePrefixFor,
} from "#extensions/migrations.ts";

function workspace(): { root: string; cleanup: () => void } {
  const root = mkdtempSync("/tmp/ext-migrations-");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function withLedger(root: string, rows: [string, string, string][]): string {
  const path = join(root, "memory.db");
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE _ext_migrations (extension_id TEXT, filename TEXT, checksum TEXT, applied_at TEXT)",
  );
  const insert = db.prepare(
    "INSERT INTO _ext_migrations (extension_id, filename, checksum, applied_at) VALUES (?, ?, ?, ?)",
  );
  for (const [id, filename, sum] of rows) insert.run(id, filename, sum, "2026-09-01T00:00:00Z");
  db.close();
  return path;
}

test("the table prefix is the id with hyphens folded to underscores", () => {
  assert.equal(tablePrefixFor("demo-widget"), "ext_demo_widget_");
  assert.equal(tablePrefixFor("plain"), "ext_plain_");
});

test("comments and formatting are invisible to the checksum; content is not", () => {
  const canonical = "CREATE TABLE ext_a_t (id INTEGER);";
  assert.equal(
    normaliseForChecksum("-- note\nCREATE  TABLE\n  ext_a_t\n  (  id INTEGER  ) ;"),
    normaliseForChecksum(canonical),
  );
  assert.equal(normaliseForChecksum("/* block\ncomment */ SELECT 1;"), "SELECT 1;");
  // A string literal is real SQL content, so editing one must trip the guard.
  assert.notEqual(
    checksum("INSERT INTO ext_a_t VALUES ('before');"),
    checksum("INSERT INTO ext_a_t VALUES ('after');"),
  );
});

test("a BOM survives normalisation, because Python does not call it whitespace", () => {
  // The divergence this pins: JavaScript's `\s` matches U+FEFF and Python's
  // does not. Collapsing it away here would silently change the hash and make
  // one core report drift on a file the other calls clean.
  const sql = "CREATE TABLE ext_a_t (id INTEGER);";
  assert.ok(normaliseForChecksum(`\ufeff${sql}`).startsWith("\ufeff"));
  assert.notEqual(checksum(`\ufeff${sql}`), checksum(sql));
});

test("U+001C-U+001F are whitespace here, because Python says so", () => {
  // The other direction of the same divergence: Python's `\s` includes the
  // file/group/record/unit separators and JavaScript's does not.
  assert.equal(normaliseForChecksum("SELECT\u001c1;"), normaliseForChecksum("SELECT 1;"));
});

test("non-.sql entries are ignored and a malformed .sql name is refused", () => {
  const w = workspace();
  try {
    const dir = join(w.root, "migrations");
    mkdirSync(dir);
    writeFileSync(join(dir, "001_init.sql"), "SELECT 1;");
    writeFileSync(join(dir, "README.md"), "not a migration");
    writeFileSync(join(dir, ".sql"), "a dotfile, not a .sql file");
    assert.deepEqual(listMigrationFiles(dir, "demo"), ["001_init.sql"]);

    writeFileSync(join(dir, "2_too_short.sql"), "SELECT 1;");
    assert.throws(
      () => listMigrationFiles(dir, "demo"),
      (error: unknown) =>
        error instanceof ExtensionMigrationError &&
        error.message ===
          "[extension/demo] invalid migration filename: 2_too_short.sql " +
            "(expected ^[0-9]{3,}_[a-z0-9_]+\\.sql$)",
    );
  } finally {
    w.cleanup();
  }
});

test("pending, clean, and drifted files are told apart", () => {
  const w = workspace();
  try {
    const dir = join(w.root, "migrations");
    mkdirSync(dir);
    const applied = "CREATE TABLE ext_demo_a (id INTEGER);";
    writeFileSync(join(dir, "001_init.sql"), applied);
    writeFileSync(join(dir, "002_changed.sql"), "CREATE TABLE ext_demo_b (id INTEGER);");
    writeFileSync(join(dir, "003_new.sql"), "CREATE TABLE ext_demo_c (id INTEGER);");
    const path = withLedger(w.root, [
      ["demo", "001_init.sql", checksum(applied)],
      ["demo", "002_changed.sql", checksum("CREATE TABLE ext_demo_b (id TEXT);")],
    ]);
    const db = openDatabaseReadOnly(path);
    try {
      assert.deepEqual(inspectMigrationFiles(db, "demo", dir), {
        pending: ["003_new.sql"],
        drifted: ["002_changed.sql"],
      });
    } finally {
      db.close();
    }
  } finally {
    w.cleanup();
  }
});

test("a legacy raw checksum still counts as applied", () => {
  // Rows recorded before CV14.E2.S3 carry a hash of the raw bytes. Rejecting
  // them would report drift on every pre-CV14 install for a file nobody edited.
  const w = workspace();
  try {
    const dir = join(w.root, "migrations");
    mkdirSync(dir);
    const content = "-- legacy\nCREATE TABLE ext_demo_a (id INTEGER);";
    writeFileSync(join(dir, "001_init.sql"), content);
    assert.notEqual(rawChecksum(content), checksum(content));
    const path = withLedger(w.root, [["demo", "001_init.sql", rawChecksum(content)]]);
    const db = openDatabaseReadOnly(path);
    try {
      assert.deepEqual(inspectMigrationFiles(db, "demo", dir), { pending: [], drifted: [] });
    } finally {
      db.close();
    }
  } finally {
    w.cleanup();
  }
});

test("inspection never writes to the ledger it reads", () => {
  const w = workspace();
  try {
    const dir = join(w.root, "migrations");
    mkdirSync(dir);
    writeFileSync(join(dir, "001_init.sql"), "CREATE TABLE ext_demo_a (id INTEGER);");
    const path = withLedger(w.root, []);
    // A read-only handle is the assertion: a write attempt would throw.
    const db = openDatabaseReadOnly(path);
    try {
      assert.deepEqual(inspectMigrationFiles(db, "demo", dir).pending, ["001_init.sql"]);
      assert.deepEqual(inspectMigrationFiles(db, "demo", dir).pending, ["001_init.sql"]);
    } finally {
      db.close();
    }
  } finally {
    w.cleanup();
  }
});
