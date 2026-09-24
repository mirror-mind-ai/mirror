import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { assertSchemaState, KNOWN_MIGRATION_IDS, SchemaStateError } from "#db/schemaState.ts";

function tmpDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-schemastate-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const db = openDatabaseCopyForWrite(join(tmpDir, "copy.db"));
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedMigrations(db: WritableDatabase, ids: readonly string[]): void {
  db.exec("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  for (const id of ids) {
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, 't')").run(id);
  }
}

test("assertSchemaState passes when the applied set matches the TS build", () => {
  const ws = tmpDb();
  try {
    seedMigrations(ws.db, KNOWN_MIGRATION_IDS);
    assertSchemaState(ws.db);
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("assertSchemaState refuses a database with no _migrations table", () => {
  const ws = tmpDb();
  try {
    assert.throws(() => assertSchemaState(ws.db), SchemaStateError);
    assert.throws(() => assertSchemaState(ws.db), /not a bootstrapped Mirror database/);
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("assertSchemaState names pending migrations when the DB is older than the TS core", () => {
  const ws = tmpDb();
  try {
    // Drop the last Python migration (016) and the TS-only 017: only the Python
    // one is *required*, so the guard refuses and names it.
    seedMigrations(ws.db, KNOWN_MIGRATION_IDS.slice(0, -2));
    assert.throws(
      () => assertSchemaState(ws.db),
      /older than this TS core.*016_builder_workbench_display_codes/,
    );
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("assertSchemaState refuses a DB missing ANY known migration, 017 included", () => {
  const ws = tmpDb();
  try {
    // Until CV22.DS10.TS5 this case was TOLERATED: 017 was TS-authored, Python
    // could not apply it, and the read path did not need it, so a database
    // missing only that one was served anyway. That tolerance existed because
    // two engines shared custody.
    //
    // With one custodian the exemption has no meaning -- there is no engine
    // that "cannot" apply 017 -- and keeping it would mean serving a database
    // the core knows is behind. Safe to tighten because `ensureDatabaseReady`
    // (bootstrap, then migrate-on-open) runs BEFORE this assertion on every
    // serving path, front door and MCP alike: a user never reaches this error
    // for a migration the engine could have applied.
    seedMigrations(ws.db, KNOWN_MIGRATION_IDS.slice(0, -1));
    assert.throws(
      () => assertSchemaState(ws.db),
      /older than this TS core.*017_journey_parent_column/,
    );
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("the remedy names a Mirror command, not an interpreter", () => {
  // The two SchemaStateError messages used to end with "Run any Python
  // `uv run python -m memory` command once" -- advice that stops working the
  // day this story finishes, on the error a user is most likely to hit.
  const ws = tmpDb();
  try {
    seedMigrations(ws.db, KNOWN_MIGRATION_IDS.slice(0, -1));
    assert.throws(
      () => assertSchemaState(ws.db),
      (error: Error) => {
        assert.match(error.message, /runtime migrate/);
        assert.doesNotMatch(error.message, /python/i);
        assert.doesNotMatch(error.message, /\buv\b/);
        return true;
      },
    );
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});

test("assertSchemaState names unknown migrations when the DB is newer than the TS core", () => {
  const ws = tmpDb();
  try {
    seedMigrations(ws.db, [...KNOWN_MIGRATION_IDS, "018_from_the_future"]);
    assert.throws(() => assertSchemaState(ws.db), /newer than this TS core.*018_from_the_future/);
  } finally {
    ws.db.close();
    ws.cleanup();
  }
});
