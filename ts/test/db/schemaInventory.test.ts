import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { buildSchemaInventory, normalizeSql } from "../../src/db/schemaInventory.ts";

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-schema-inventory-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// --- normalizeSql: must stay behaviorally identical to the Python
// counterpart (memory.db.schema_inventory.normalize_sql) — same cases.

test("normalizeSql strips line comments", () => {
  assert.equal(normalizeSql("SELECT 1 -- a comment\n, 2"), "SELECT 1, 2");
});

test("normalizeSql strips block comments", () => {
  assert.equal(
    normalizeSql("CREATE TABLE t (\n  /* comment */ id TEXT\n)"),
    "CREATE TABLE t ( id TEXT)",
  );
});

test("normalizeSql strips whitespace before comma and close paren", () => {
  // SQLite's ALTER TABLE ADD COLUMN textually splices the new column
  // definition right before the stored CREATE TABLE text's closing paren,
  // producing uneven spacing (e.g. "metadata TEXT , newcol TEXT)") that no
  // hand-written DDL naturally produces. Must normalize identically to a
  // cleanly formatted equivalent.
  assert.equal(
    normalizeSql("CREATE TABLE t (a TEXT , b TEXT )"),
    "CREATE TABLE t (a TEXT, b TEXT)",
  );
});

test("normalizeSql collapses whitespace", () => {
  assert.equal(normalizeSql("CREATE   TABLE\n\nt (id TEXT)"), "CREATE TABLE t (id TEXT)");
});

test("normalizeSql preserves dashes inside string literals", () => {
  assert.equal(normalizeSql("INSERT INTO t VALUES ('a--b')"), "INSERT INTO t VALUES ('a--b')");
});

test("normalizeSql preserves escaped quotes inside string literals", () => {
  assert.equal(
    normalizeSql("INSERT INTO t VALUES ('it''s -- not a comment')"),
    "INSERT INTO t VALUES ('it''s -- not a comment')",
  );
});

test("normalizeSql consumes to end on an unterminated block comment", () => {
  assert.equal(normalizeSql("SELECT 1 /* oops"), "SELECT 1");
});

test("normalizeSql passes null through", () => {
  assert.equal(normalizeSql(null), null);
});

// --- buildSchemaInventory: exclusion logic and structural capture, on a
// small ad-hoc schema (the full production DDL is proven in schema.test.ts
// against the committed Python snapshot).

function seedAdHocSchema(db: WritableDatabase): void {
  db.exec(`
    CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE widgets (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'draft',
      owner_id TEXT REFERENCES owners(id),
      CHECK(status IN ('draft', 'active'))
    );
    CREATE TABLE owners (id TEXT PRIMARY KEY);
    CREATE UNIQUE INDEX idx_widgets_active_owner ON widgets(owner_id) WHERE status = 'active';
    CREATE VIRTUAL TABLE docs_fts USING fts5(title, content=docs, content_rowid=rowid);
    CREATE TRIGGER trg_widgets_ai AFTER INSERT ON widgets BEGIN SELECT 1; END;
  `);
}

test("buildSchemaInventory excludes _migrations and its own autoindex", () => {
  const { dbPath, cleanup } = tempCopy();
  try {
    const db = openDatabaseCopyForWrite(dbPath);
    seedAdHocSchema(db);
    const inventory = buildSchemaInventory(db);
    db.close();

    assert.ok(!("_migrations" in inventory.tables));
    assert.ok(Object.values(inventory.indexes).every((idx) => idx.table !== "_migrations"));
  } finally {
    cleanup();
  }
});

test("buildSchemaInventory excludes FTS5 shadow tables but keeps the virtual table", () => {
  const { dbPath, cleanup } = tempCopy();
  try {
    const db = openDatabaseCopyForWrite(dbPath);
    seedAdHocSchema(db);
    const inventory = buildSchemaInventory(db);
    db.close();

    assert.ok("docs_fts" in inventory.tables);
    for (const suffix of ["_data", "_idx", "_docsize", "_config", "_content"]) {
      assert.ok(!(`docs_fts${suffix}` in inventory.tables), `expected docs_fts${suffix} excluded`);
    }
  } finally {
    cleanup();
  }
});

test("buildSchemaInventory captures a CHECK constraint via normalized table sql", () => {
  const { dbPath, cleanup } = tempCopy();
  try {
    const db = openDatabaseCopyForWrite(dbPath);
    seedAdHocSchema(db);
    const inventory = buildSchemaInventory(db);
    db.close();

    assert.match(inventory.tables.widgets?.sql ?? "", /CHECK\(status IN/);
  } finally {
    cleanup();
  }
});

test("buildSchemaInventory captures a partial index predicate", () => {
  const { dbPath, cleanup } = tempCopy();
  try {
    const db = openDatabaseCopyForWrite(dbPath);
    seedAdHocSchema(db);
    const inventory = buildSchemaInventory(db);
    db.close();

    const idx = inventory.indexes.idx_widgets_active_owner;
    assert.ok(idx);
    assert.equal(idx?.unique, 1);
    assert.match(idx?.sql ?? "", /WHERE status = 'active'/);
  } finally {
    cleanup();
  }
});

test("buildSchemaInventory captures triggers and foreign keys", () => {
  const { dbPath, cleanup } = tempCopy();
  try {
    const db = openDatabaseCopyForWrite(dbPath);
    seedAdHocSchema(db);
    const inventory = buildSchemaInventory(db);
    db.close();

    assert.ok("trg_widgets_ai" in inventory.triggers);
    assert.deepEqual(inventory.tables.widgets?.foreign_keys[0], {
      table: "owners",
      from: "owner_id",
      to: "id",
      on_update: "NO ACTION",
      on_delete: "NO ACTION",
      match: "NONE",
    });
  } finally {
    cleanup();
  }
});
