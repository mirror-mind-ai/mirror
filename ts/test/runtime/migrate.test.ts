// CV22.DS10.US2 plateau 3 — `runtime migrate` (decision D8).
//
// The verb the oracle never had. Python's updater calls `_apply_migrations`
// in-process, so it migrates with the modules it imported BEFORE the
// fast-forward; a migration authored in the newly installed commit is
// invisible to the run that installed it. This verb exists so the updater can
// spawn the NEW code to do the migrating.
//
// It prints the `_migrations` ledger before and after because "migrations:
// pass" is a claim and the ledger rows are the evidence.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { readLedger, renderMigrate, runMigrate } from "#runtime/migrate.ts";

function scratch(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "us2-migrate-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a fully migrated database reports nothing pending, and the ledger is unchanged", () => {
  const f = scratch();
  try {
    const dbPath = join(f.dir, "memory.db");
    bootstrapDatabase(dbPath).close();

    const before = readLedger(dbPath);
    assert.ok(before && before.length > 0, "a bootstrapped database has a populated ledger");

    const outcome = runMigrate(dbPath);
    assert.equal(outcome.error, null);
    assert.equal(outcome.migrated, false);
    assert.deepEqual(outcome.applied, []);
    assert.deepEqual(outcome.after, outcome.before, "nothing pending means nothing changed");
    assert.deepEqual(outcome.after, before);

    const render = renderMigrate(outcome);
    assert.match(render, /^Mirror runtime migrate\n\n/);
    assert.match(render, /^Ledger before: \d+ migration\(s\)$/m);
    assert.match(render, /^Ledger after: \d+ migration\(s\)$/m);
    assert.match(render, /^Migrate result: nothing pending$/m);
    assert.doesNotMatch(render, /uv run python/);
  } finally {
    f.cleanup();
  }
});

test("a missing database fails with its path, not a stack trace", () => {
  const f = scratch();
  try {
    const dbPath = join(f.dir, "absent.db");
    const outcome = runMigrate(dbPath);
    assert.equal(outcome.migrated, false);
    assert.match(outcome.error ?? "", /database not found/);
    const render = renderMigrate(outcome);
    assert.match(render, /^Migrate result: failed$/m);
    assert.doesNotMatch(render, /at Object|node:internal/);
  } finally {
    f.cleanup();
  }
});

test("a file that is not a database fails without claiming a migration", () => {
  const f = scratch();
  try {
    const dbPath = join(f.dir, "memory.db");
    // A file that exists but holds no ledger: the outcome must not be
    // "nothing pending", which would report success for an unusable database.
    writeFileSync(dbPath, "not a database\n");

    const outcome = runMigrate(dbPath);
    assert.equal(outcome.migrated, false);
    assert.ok(outcome.error !== null, "an unreadable ledger is an error, not a no-op");
    assert.match(renderMigrate(outcome), /^Migrate result: failed$/m);
  } finally {
    f.cleanup();
  }
});

test("readLedger returns null for an unreadable database rather than throwing", () => {
  const f = scratch();
  try {
    assert.equal(readLedger(join(f.dir, "nope.db")), null);
  } finally {
    f.cleanup();
  }
});
