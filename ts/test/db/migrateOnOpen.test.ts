import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap, openDatabaseReadOnly } from "#db/database.ts";
import { ensureMigratedOnOpen, migrationBackupPathFor } from "#db/migrateOnOpen.ts";
import { buildSchemaInventory, type SchemaInventory } from "#db/schemaInventory.ts";
import { regressToPre017 } from "#helpers/legacyDb.ts";
import { createJourney } from "#journey/journeyWrite.ts";

const NOW = "2026-01-01T00:00:00Z";

function tmpDbPath(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-migrate-on-open-"));
  return {
    dbPath: join(dir, "memory.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function deleteMigrationRow(dbPath: string, id: string): void {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    db.prepare("DELETE FROM _migrations WHERE id = ?").run(id);
  } finally {
    db.close();
  }
}

function migrationIds(dbPath: string): string[] {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    return (db.prepare("SELECT id FROM _migrations ORDER BY id").all() as { id: string }[]).map(
      (row) => row.id,
    );
  } finally {
    db.close();
  }
}

function columnExists(dbPath: string, table: string, column: string): boolean {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    return (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).some(
      (row) => row.name === column,
    );
  } finally {
    db.close();
  }
}

function readParentColumn(dbPath: string, key: string): string | null {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    const row = db.prepare("SELECT parent_journey FROM identity WHERE key = ?").get(key) as
      | { parent_journey: string | null }
      | undefined;
    return row ? row.parent_journey : null;
  } finally {
    db.close();
  }
}

// A1 — migrate-on-open activates the TS-only migration Python cannot apply.
test("migrate-on-open applies pending TS-authored 017 to a legacy DB, backs it up, and backfills the column from JSON", () => {
  const ws = tmpDbPath();
  try {
    const db = bootstrapDatabase(ws.dbPath);
    createJourney(db, { id: "id-parent", slug: "parent", content: "# Parent" }, NOW);
    createJourney(
      db,
      {
        id: "id-child",
        slug: "child",
        content: "# Child\n**Status:** active",
        parentJourney: "parent",
      },
      NOW,
    );
    db.close();
    regressToPre017(ws.dbPath);

    assert.ok(
      !columnExists(ws.dbPath, "identity", "parent_journey"),
      "precondition: column dropped",
    );
    assert.ok(
      !migrationIds(ws.dbPath).includes("017_journey_parent_column"),
      "precondition: 017 pending",
    );
    assert.ok(!existsSync(migrationBackupPathFor(ws.dbPath)), "precondition: no migration backup");

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.migrated, true);
    assert.deepEqual(result.appliedIds, ["017_journey_parent_column"]);
    assert.ok(existsSync(migrationBackupPathFor(ws.dbPath)), "a pre-migration backup was taken");
    assert.ok(columnExists(ws.dbPath, "identity", "parent_journey"), "017 re-created the column");
    assert.ok(migrationIds(ws.dbPath).includes("017_journey_parent_column"), "017 recorded");
    assert.equal(readParentColumn(ws.dbPath, "child"), "parent", "column backfilled from JSON");
  } finally {
    ws.cleanup();
  }
});

// A2 — idempotent: an already-current DB is not re-migrated or backed up.
test("migrate-on-open is a no-op on an already-migrated DB — no re-apply, no backup", () => {
  const ws = tmpDbPath();
  try {
    bootstrapDatabase(ws.dbPath).close();
    const before = migrationIds(ws.dbPath);
    rmSync(migrationBackupPathFor(ws.dbPath), { force: true });

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.migrated, false);
    assert.ok(!existsSync(migrationBackupPathFor(ws.dbPath)), "no backup on a no-op open");
    assert.deepEqual(migrationIds(ws.dbPath), before, "ledger unchanged");
  } finally {
    ws.cleanup();
  }
});

// A5 — CV22.DS10.TS5 (D-025): the deferral is GONE, and this is the case that
// proves it. The same database that used to be declined is now migrated.
//
// Until TS5 a pending Python-authored migration made migrate-on-open decline
// the whole thing, so TypeScript never applied work Python still owned. That
// was right with two engines and became a lie with one: `runtime migrate`
// rendered the decline as `nothing pending`, exit 0, and the updater's migrate
// stage passed on a database with pending work nothing had applied.
test("migrate-on-open applies every pending migration, Python-era ones included", () => {
  const ws = tmpDbPath();
  try {
    bootstrapDatabase(ws.dbPath).close();
    regressToPre017(ws.dbPath); // 017 pending
    deleteMigrationRow(ws.dbPath, "007_create_identity_descriptors"); // and an older one

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.verdict, "applied");
    assert.equal(result.migrated, true);
    assert.ok(
      result.appliedIds.includes("007_create_identity_descriptors"),
      "the Python-era migration is applied by the only engine left",
    );
    assert.ok(result.appliedIds.includes("017_journey_parent_column"));
    assert.ok(
      existsSync(migrationBackupPathFor(ws.dbPath)),
      "backup-first still holds: applying anything takes a snapshot",
    );
    assert.ok(columnExists(ws.dbPath, "identity", "parent_journey"), "017 landed");
    assert.ok(migrationIds(ws.dbPath).includes("007_create_identity_descriptors"));
  } finally {
    ws.cleanup();
  }
});

// --- CV22.DS10.TS5 (D-025): what `declined` means with one custodian --------
//
// `declined` used to mean "another engine owns this". With one engine left it
// can only mean STRUCTURAL: the file is not a Mirror database, or it carries
// migrations this core does not know. Both are refusals that must fail loudly
// on the one command whose job is to leave the database correct after an
// update -- the old two-verdict shape rendered them as `nothing pending`,
// exit 0.

test("a file with no _migrations table is declined, not reported as nothing pending", () => {
  const ws = tmpDbPath();
  try {
    const db = openDatabaseForBootstrap(ws.dbPath);
    try {
      db.exec("CREATE TABLE unrelated (x TEXT)");
    } finally {
      db.close();
    }

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.verdict, "declined");
    assert.equal(result.migrated, false);
    assert.match(result.declinedReason ?? "", /_migrations/u);
    assert.ok(!existsSync(migrationBackupPathFor(ws.dbPath)), "a decline touches nothing");
  } finally {
    ws.cleanup();
  }
});

test("a database from a newer core is declined rather than migrated backwards", () => {
  // Applying older code's migrations to a newer schema is the one thing worse
  // than not migrating at all.
  const ws = tmpDbPath();
  try {
    bootstrapDatabase(ws.dbPath).close();
    const db = openDatabaseForBootstrap(ws.dbPath);
    try {
      db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
        "999_from_the_future",
        NOW,
      );
    } finally {
      db.close();
    }

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.verdict, "declined");
    assert.match(result.declinedReason ?? "", /999_from_the_future/u);
    assert.match(result.declinedReason ?? "", /update this Mirror installation/u);
  } finally {
    ws.cleanup();
  }
});

test("an already-current database reports nothing pending, and is untouched", () => {
  const ws = tmpDbPath();
  try {
    bootstrapDatabase(ws.dbPath).close();

    const result = ensureMigratedOnOpen(ws.dbPath);

    assert.equal(result.verdict, "nothing_pending");
    assert.equal(result.migrated, false);
    assert.deepEqual([...result.appliedIds], []);
    assert.ok(!existsSync(migrationBackupPathFor(ws.dbPath)), "no snapshot when there is no work");
  } finally {
    ws.cleanup();
  }
});

// --- CV22.DS10.TS5 handoff review, finding B1: migrated equals fresh --------
//
// Python's `get_connection` ran two things on EVERY open: the migrations, then
// the bootstrap schema. The second created every object that has a place in
// the schema and no migration -- `_ext_migrations`, `_ext_bindings` and its
// index (from v0.8.0), `journey_mutation_receipts` (from v0.31.12). Until TS5 an
// old database reached TypeScript only after a Python open had run both;
// plateau 1 made TypeScript apply those migrations itself, and with only the
// first half a v0.7.0 home migrated to "current (17/17)" and then failed in
// Mirror Mode on `no such table: _ext_bindings`.
//
// The custody proof grades each migration against its own end-state. This is
// the invariant it lacked: a real old database, migrated on open, ends where
// a fresh bootstrap does -- the whole canonical inventory, not a list of names.

const RELEASE_V070_SCHEMA = join(
  import.meta.dirname,
  "..",
  "fixtures",
  "migrations",
  "release-v0.7.0-schema.sql",
);

function canonicalInventory(dbPath: string): SchemaInventory {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return buildSchemaInventory(db);
  } finally {
    db.close();
  }
}

/** Object names present on one side only, for a failure a reader can act on. */
function onlyInOneSide(migrated: SchemaInventory, fresh: SchemaInventory): string[] {
  const problems: string[] = [];
  for (const kind of ["tables", "indexes", "triggers"] as const) {
    for (const name of Object.keys(fresh[kind])) {
      if (!(name in migrated[kind])) problems.push(`missing ${kind}: ${name}`);
    }
    for (const name of Object.keys(migrated[kind])) {
      if (!(name in fresh[kind])) problems.push(`unexpected ${kind}: ${name}`);
    }
  }
  return problems;
}

test("a database Python v0.7.0 created reaches a fresh database's schema on open (B1)", () => {
  const old = tmpDbPath();
  const fresh = tmpDbPath();
  try {
    const seed = openDatabaseForBootstrap(old.dbPath);
    try {
      seed.exec(readFileSync(RELEASE_V070_SCHEMA, "utf8"));
    } finally {
      seed.close();
    }

    const result = ensureMigratedOnOpen(old.dbPath);
    bootstrapDatabase(fresh.dbPath).close();

    assert.equal(result.verdict, "applied");
    assert.deepEqual(
      [...result.appliedIds],
      [
        "011_create_operation_runs",
        "012_create_operation_run_events",
        "013_create_exploratory_stories",
        "014_create_identity_integrations",
        "015_create_builder_workbench",
        "016_builder_workbench_display_codes",
        "017_journey_parent_column",
      ],
    );
    const migrated = canonicalInventory(old.dbPath);
    const expected = canonicalInventory(fresh.dbPath);
    assert.deepEqual(onlyInOneSide(migrated, expected), []);
    assert.deepEqual(migrated, expected);
  } finally {
    old.cleanup();
    fresh.cleanup();
  }
});
