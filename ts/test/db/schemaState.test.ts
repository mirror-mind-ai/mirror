import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  assertSchemaState,
  KNOWN_MIGRATION_IDS,
  SchemaStateError,
} from "../../src/db/schemaState.ts";

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

test("assertSchemaState tolerates a DB missing only TS-authored migrations (TS ⊇ Python)", () => {
  const ws = tmpDb();
  try {
    // Every Python migration applied, only the TS-authored 017 absent — Python
    // cannot apply it and the read path does not need it, so the DB is served.
    seedMigrations(ws.db, KNOWN_MIGRATION_IDS.slice(0, -1));
    assert.doesNotThrow(() => assertSchemaState(ws.db));
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
