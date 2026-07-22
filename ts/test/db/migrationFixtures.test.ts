import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { runMigrations } from "../../src/db/migrations.ts";
import { buildSchemaInventory, type SchemaInventory } from "../../src/db/schemaInventory.ts";
import { TS_AUTHORED_MIGRATION_IDS } from "../../src/db/schemaState.ts";
import { diffTsInventoryAgainstSnapshot } from "../../src/db/schemaTsDivergence.ts";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "migrations");

const STEMS = ["001", "002", "003", "004", "005", "008", "009", "chain-multi-hop"];

interface ExpectedFixture extends SchemaInventory {
  applied_migration_ids: string[];
  identity_layers: string[];
  conversation_journeys: string[];
  memory_journeys: string[];
  memory_legacy_row: Record<string, unknown> | null;
  attachment_legacy_row: Record<string, unknown> | null;
  task_legacy_row: Record<string, unknown> | null;
  memories_fts_findable_legacy_row_count: number;
}

function loadFixture(stem: string): { seedSql: string; expected: ExpectedFixture } {
  const seedSql = readFileSync(join(FIXTURES_DIR, `migration-${stem}-pre-state.sql`), "utf-8");
  const expected = JSON.parse(
    readFileSync(join(FIXTURES_DIR, `migration-${stem}-expected.json`), "utf-8"),
  ) as ExpectedFixture;
  return { seedSql, expected };
}

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-migration-fixture-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const db = openDatabaseCopyForWrite(join(tmpDir, "seeded.db"));
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function singleRow(
  db: WritableDatabase,
  sql: string,
  ...params: string[]
): Record<string, unknown> | null {
  const row = db.prepare(sql).get(...params);
  return row === undefined ? null : (row as Record<string, unknown>);
}

for (const stem of STEMS) {
  test(`migration fixture ${stem}: TS runMigrations matches Python's real end-state`, () => {
    const { seedSql, expected } = loadFixture(stem);
    const { db, cleanup } = tempDb();
    try {
      db.exec(seedSql);
      runMigrations(db);

      // Schema shape — via the same buildSchemaInventory contract TS1 proved,
      // through the enumerated TS ⊇ Python divergence (CV22.DS6.US2): TS's engine
      // now authors migration 017, so a fixture whose seed has an `identity`
      // table ends with the parent_journey column + index beyond Python's
      // captured end-state.
      const inventory = buildSchemaInventory(db);
      const problems = diffTsInventoryAgainstSnapshot(inventory, expected);
      assert.deepEqual(
        problems,
        [],
        `fixture ${stem}: schema differs from Python's end-state beyond the enumerated TS-only additions:\n${problems.join("\n")}`,
      );

      // _migrations ledger.
      const appliedIds = (db.prepare("SELECT id FROM _migrations").all() as { id: string }[])
        .map((row) => row.id)
        .sort();
      // TS runs its own forward migrations (017+) beyond Python's captured end-state.
      assert.deepEqual(
        appliedIds,
        [...expected.applied_migration_ids, ...TS_AUTHORED_MIGRATION_IDS].sort(),
      );

      // Row-level values — the migrations that move data, not just shape.
      const identityLayers = (
        db.prepare("SELECT layer FROM identity ORDER BY layer").all() as { layer: string }[]
      ).map((row) => row.layer);
      assert.deepEqual(identityLayers, expected.identity_layers);

      const conversationJourneys = (
        db.prepare("SELECT journey FROM conversations ORDER BY id").all() as {
          journey: string | null;
        }[]
      ).map((row) => row.journey);
      assert.deepEqual(conversationJourneys, expected.conversation_journeys);

      const memoryJourneys = (
        db.prepare("SELECT journey FROM memories ORDER BY id").all() as { journey: string | null }[]
      ).map((row) => row.journey);
      assert.deepEqual(memoryJourneys, expected.memory_journeys);

      assert.deepEqual(
        singleRow(
          db,
          "SELECT title, content, use_count, readiness_state, journey FROM memories WHERE id = 'mem-legacy-1'",
        ),
        expected.memory_legacy_row,
      );
      assert.deepEqual(
        singleRow(
          db,
          "SELECT journey_id, name, content FROM attachments WHERE id = 'att-legacy-1'",
        ),
        expected.attachment_legacy_row,
      );
      assert.deepEqual(
        singleRow(db, "SELECT journey, title, status FROM tasks WHERE id = 'task-legacy-1'"),
        expected.task_legacy_row,
      );

      // Functional FTS assertion (ai-engineer condition) — a pre-existing row
      // is actually findable after migration, not merely that the virtual
      // table exists.
      const ftsHits = (
        db.prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'legacy'").all() as {
          rowid: number;
        }[]
      ).length;
      assert.equal(ftsHits, expected.memories_fts_findable_legacy_row_count);
    } finally {
      db.close();
      cleanup();
    }
  });
}

test("runMigrations is idempotent against a mid-transition legacy seed", () => {
  const { seedSql } = loadFixture("005");
  const { db, cleanup } = tempDb();
  try {
    db.exec(seedSql);
    runMigrations(db);
    const before = db.prepare("SELECT id, applied_at FROM _migrations ORDER BY id").all() as {
      id: string;
      applied_at: string;
    }[];
    assert.doesNotThrow(() => runMigrations(db));
    const after = db.prepare("SELECT id, applied_at FROM _migrations ORDER BY id").all() as {
      id: string;
      applied_at: string;
    }[];
    assert.deepEqual(after, before, "re-running migrations must not change the ledger at all");
  } finally {
    db.close();
    cleanup();
  }
});
