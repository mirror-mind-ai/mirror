// CV24.DS1 — inspect a home without migrating.
//
// Mirror Desktop must be able to ask what state a database is in BEFORE
// anything changes it, so it can ask the person first. `ensureMigratedOnOpen`
// answers by migrating; this report answers by reading. The tests below pin the
// five states, the "writes nothing" property as measured (a read-only open of a
// WAL database leaves `-wal` and `-shm` beside it and nothing else), and that
// the report reads the path it is given, never the environment.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap, openDatabaseReadOnly } from "#db/database.ts";
import { ensureMigratedOnOpen, migrationBackupPathFor } from "#db/migrateOnOpen.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { KNOWN_MIGRATION_IDS } from "#db/schemaState.ts";
import { regressToPre017 } from "#helpers/legacyDb.ts";
import { tempDir } from "#helpers/tempDir.ts";

const AT_016 = KNOWN_MIGRATION_IDS.slice(
  0,
  KNOWN_MIGRATION_IDS.indexOf("016_builder_workbench_display_codes") + 1,
);

function currentDb(dir: string): string {
  const dbPath = join(dir, "memory.db");
  bootstrapDatabase(dbPath).close();
  return dbPath;
}

/** A database whose ledger stops at 016, as every Python-era home's does. */
function pythonEraDb(dir: string): string {
  const dbPath = currentDb(dir);
  regressToPre017(dbPath);
  const db = openDatabaseForBootstrap(dbPath);
  try {
    db.prepare("DELETE FROM _migrations WHERE id = ?").run("018_drop_hook_injected");
  } finally {
    db.close();
  }
  return dbPath;
}

function ledger(dbPath: string): string[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return (db.prepare("SELECT id FROM _migrations ORDER BY id").all() as { id: string }[]).map(
      (r) => r.id,
    );
  } finally {
    db.close();
  }
}

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("a missing file is reported as missing, and is not created", () => {
  const dir = tempDir("mirror-report-missing-");
  const dbPath = join(dir, "memory.db");
  const report = inspectMigrationState(dbPath);
  assert.equal(report.state, "missing");
  assert.equal(report.dbPath, dbPath);
  assert.deepEqual([report.applied, report.pending, report.unknown], [[], [], []]);
  assert.deepEqual(readdirSync(dir), []);
});

test("a database without a ledger is not a Mirror database", () => {
  const dir = tempDir("mirror-report-not-mirror-");
  const dbPath = join(dir, "memory.db");
  const db = openDatabaseForBootstrap(dbPath);
  db.exec("CREATE TABLE notes (body TEXT)");
  db.close();
  assert.equal(inspectMigrationState(dbPath).state, "not_mirror");
});

test("a file that is not SQLite at all is not a Mirror database either", () => {
  const dir = tempDir("mirror-report-garbage-");
  const dbPath = join(dir, "memory.db");
  writeFileSync(dbPath, "this is not a database, it is a sentence long enough to fill a header");
  assert.equal(inspectMigrationState(dbPath).state, "not_mirror");
});

test("a bootstrapped database is current", () => {
  const dbPath = currentDb(tempDir("mirror-report-current-"));
  const report = inspectMigrationState(dbPath);
  assert.equal(report.state, "current");
  assert.deepEqual(report.applied, [...KNOWN_MIGRATION_IDS]);
  assert.deepEqual(report.pending, []);
  assert.deepEqual(report.unknown, []);
});

test("a Python-era database at 016 reports 017 and 018 pending, in order", () => {
  const dbPath = pythonEraDb(tempDir("mirror-report-pending-"));
  const report = inspectMigrationState(dbPath);
  assert.equal(report.state, "pending");
  assert.deepEqual(report.applied, AT_016);
  assert.deepEqual(report.pending, ["017_journey_parent_column", "018_drop_hook_injected"]);
  assert.deepEqual(report.unknown, []);
});

test("a database carrying a migration this core does not know is ahead", () => {
  const dbPath = pythonEraDb(tempDir("mirror-report-ahead-"));
  const db = openDatabaseForBootstrap(dbPath);
  try {
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
      "999_from_the_future",
      "2027-01-01",
    );
  } finally {
    db.close();
  }
  const report = inspectMigrationState(dbPath);
  // Ahead wins over pending, as it does for `ensureMigratedOnOpen`, which declines.
  assert.equal(report.state, "ahead");
  assert.deepEqual(report.unknown, ["999_from_the_future"]);
  assert.deepEqual(report.pending, ["017_journey_parent_column", "018_drop_hook_injected"]);
});

test("the report agrees with what an open would do", () => {
  const dbPath = pythonEraDb(tempDir("mirror-report-agrees-"));
  const pending = inspectMigrationState(dbPath).pending;
  const opened = ensureMigratedOnOpen(dbPath);
  assert.deepEqual(opened.appliedIds, pending);
  assert.equal(inspectMigrationState(dbPath).state, "current");
});

test("the report writes nothing: same bytes, same ledger, no backup, no lock", () => {
  const dir = tempDir("mirror-report-writes-nothing-");
  const dbPath = pythonEraDb(dir);
  const filesBefore = readdirSync(dir).sort();
  const hashBefore = sha(dbPath);
  const ledgerBefore = ledger(dbPath);

  const report = inspectMigrationState(dbPath);

  assert.equal(report.state, "pending");
  assert.equal(sha(dbPath), hashBefore, "memory.db bytes changed");
  assert.deepEqual(ledger(dbPath), ledgerBefore, "the ledger changed");
  assert.ok(!existsSync(migrationBackupPathFor(dbPath)), "a pre-migration backup was taken");
  assert.ok(!existsSync(`${dbPath}.bootstrap.lock`), "the bootstrap lock was left");
  // Measured on 2026-10-28: any read-only open of a WAL database creates these
  // two sidecars and cannot remove them. Nothing else may appear.
  const added = readdirSync(dir)
    .filter((name) => !filesBefore.includes(name))
    .sort();
  for (const name of added)
    assert.ok(["memory.db-shm", "memory.db-wal"].includes(name), `unexpected ${name}`);
});

test("the report reads the path it is given, never MIRROR_HOME", () => {
  const canary = tempDir("mirror-report-canary-");
  pythonEraDb(canary);
  const canaryFiles = readdirSync(canary).sort();
  const target = currentDb(tempDir("mirror-report-target-"));
  const saved = {
    home: process.env.MIRROR_HOME,
    user: process.env.MIRROR_USER,
    db: process.env.DB_PATH,
  };
  process.env.MIRROR_HOME = canary;
  process.env.MIRROR_USER = "tmp";
  process.env.DB_PATH = join(canary, "memory.db");
  try {
    const report = inspectMigrationState(target);
    assert.equal(report.state, "current");
    assert.equal(report.dbPath, target);
  } finally {
    for (const [key, value] of [
      ["MIRROR_HOME", saved.home],
      ["MIRROR_USER", saved.user],
      ["DB_PATH", saved.db],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.deepEqual(readdirSync(canary).sort(), canaryFiles, "the canary home was opened");
});

test("the report names the core that read it", () => {
  const report = inspectMigrationState(join(tempDir("mirror-report-version-"), "memory.db"));
  const manifest = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "..", "..", "package.json"), "utf8"),
  );
  assert.equal(report.coreVersion, manifest.version);
});
