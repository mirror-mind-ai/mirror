// Navigator-visible route for CV22.DS6.TS2 — Migration Engine & `_migrations`
// Bookkeeping.
//
// For each committed legacy-transition fixture (ts/test/fixtures/migrations/),
// seeds a fresh temp database, runs the TS core's runMigrations(), and
// compares the result against Python's real committed end-state: schema shape
// (via TS1's buildSchemaInventory contract), the `_migrations` ledger, and
// row-level facts (renamed values, backfilled display codes, FTS
// findability). Ends in one MIGRATION PARITY: PASS/FAIL line. No privacy
// redaction needed — fixture content is purely synthetic, not user data.
//
// Usage: node ts/parity/migration_structural_parity.ts

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../src/db/database.ts";
import { runMigrations } from "../src/db/migrations.ts";
import { buildSchemaInventory, type SchemaInventory } from "../src/db/schemaInventory.ts";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "migrations");
const STEMS = ["001", "002", "003", "004", "005", "008", "009", "chain-multi-hop"];

interface ExpectedFixture extends SchemaInventory {
  applied_migration_ids: string[];
  identity_layers: string[];
  conversation_journeys: (string | null)[];
  memory_journeys: (string | null)[];
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

function singleRow(
  db: WritableDatabase,
  sql: string,
  ...params: string[]
): Record<string, unknown> | null {
  const row = db.prepare(sql).get(...params);
  return row === undefined ? null : (row as Record<string, unknown>);
}

function checkFixture(stem: string): { ok: boolean; details: string[] } {
  const { seedSql, expected } = loadFixture(stem);
  const dir = mkdtempSync(join(tmpdir(), "mirror-migration-parity-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const details: string[] = [];
  let ok = true;
  try {
    const db = openDatabaseCopyForWrite(join(tmpDir, "seeded.db"));
    try {
      db.exec(seedSql);
      runMigrations(db);
      const inventory = buildSchemaInventory(db);

      for (const kind of ["tables", "indexes", "triggers"] as const) {
        const actualNames = new Set(Object.keys(inventory[kind]));
        const expectedNames = new Set(Object.keys(expected[kind]));
        if (actualNames.size !== expectedNames.size || ![...expectedNames].every((n) => actualNames.has(n))) {
          ok = false;
          details.push(`${kind}: name-set mismatch`);
          continue;
        }
        for (const name of expectedNames) {
          if (!isDeepStrictEqual(inventory[kind][name], expected[kind][name])) {
            ok = false;
            details.push(`${kind}[${name}]: structural mismatch`);
          }
        }
      }

      const appliedIds = (db.prepare("SELECT id FROM _migrations").all() as { id: string }[])
        .map((r) => r.id)
        .sort();
      if (!isDeepStrictEqual(appliedIds, [...expected.applied_migration_ids].sort())) {
        ok = false;
        details.push("_migrations ledger: mismatch");
      }

      const identityLayers = (
        db.prepare("SELECT layer FROM identity ORDER BY layer").all() as { layer: string }[]
      ).map((r) => r.layer);
      const conversationJourneys = (
        db.prepare("SELECT journey FROM conversations ORDER BY id").all() as {
          journey: string | null;
        }[]
      ).map((r) => r.journey);
      const memoryJourneys = (
        db.prepare("SELECT journey FROM memories ORDER BY id").all() as {
          journey: string | null;
        }[]
      ).map((r) => r.journey);
      const listChecks: [string, unknown, unknown][] = [
        ["identity_layers", identityLayers, expected.identity_layers],
        ["conversation_journeys", conversationJourneys, expected.conversation_journeys],
        ["memory_journeys", memoryJourneys, expected.memory_journeys],
      ];
      for (const [label, actual, exp] of listChecks) {
        if (!isDeepStrictEqual(actual, exp)) {
          ok = false;
          details.push(`${label}: mismatch`);
        }
      }

      const rowChecks: [string, unknown, unknown][] = [
        [
          "memory_legacy_row",
          singleRow(
            db,
            "SELECT title, content, use_count, readiness_state, journey FROM memories WHERE id = 'mem-legacy-1'",
          ),
          expected.memory_legacy_row,
        ],
        [
          "attachment_legacy_row",
          singleRow(db, "SELECT journey_id, name, content FROM attachments WHERE id = 'att-legacy-1'"),
          expected.attachment_legacy_row,
        ],
        [
          "task_legacy_row",
          singleRow(db, "SELECT journey, title, status FROM tasks WHERE id = 'task-legacy-1'"),
          expected.task_legacy_row,
        ],
      ];
      for (const [label, actual, exp] of rowChecks) {
        if (!isDeepStrictEqual(actual, exp)) {
          ok = false;
          details.push(`${label}: mismatch`);
        }
      }

      const ftsHits = (
        db.prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'legacy'").all() as {
          rowid: number;
        }[]
      ).length;
      if (ftsHits !== expected.memories_fts_findable_legacy_row_count) {
        ok = false;
        details.push(`FTS findability: expected ${expected.memories_fts_findable_legacy_row_count}, got ${ftsHits}`);
      }
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { ok, details };
}

function main(): number {
  process.stdout.write("== migration fixture parity (TS runMigrations vs Python real end-state) ==\n");
  let allOk = true;
  for (const stem of STEMS) {
    const { ok, details } = checkFixture(stem);
    allOk &&= ok;
    process.stdout.write(`  ${stem}: ${ok ? "PASS" : "FAIL"}\n`);
    for (const detail of details) process.stdout.write(`    - ${detail}\n`);
  }
  process.stdout.write(`\nMIGRATION PARITY: ${allOk ? "PASS" : "FAIL"}\n`);
  return allOk ? 0 : 1;
}

process.exit(main());
