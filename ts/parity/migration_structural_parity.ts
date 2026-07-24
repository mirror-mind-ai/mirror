// Navigator-visible route for CV22.DS6.TS2 — Migration Engine & `_migrations`
// Bookkeeping. Also runs in CI (the `ts` job) as of CR051 — this script and
// the CI-enforced ts/test/db/migrationFixtures.test.ts exercise the exact same
// enumerated TS ⊇ Python divergence contract and must stay in sync.
//
// For each committed legacy-transition fixture (ts/test/fixtures/migrations/),
// seeds a fresh temp database, runs the TS core's runMigrations(), and
// compares the result against Python's real committed end-state: schema shape
// (via the enumerated TS ⊇ Python divergence contract, schemaTsDivergence.ts,
// CV22.DS6.US2), the `_migrations` ledger (tolerating TS_AUTHORED_MIGRATION_IDS),
// and row-level facts (renamed values, backfilled display codes, FTS
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
import { TS_AUTHORED_MIGRATION_IDS } from "../src/db/schemaState.ts";
import { diffTsInventoryAgainstSnapshot } from "../src/db/schemaTsDivergence.ts";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures", "migrations");
const STEMS = ["001", "002", "003", "004", "005", "008", "009", "016", "chain-multi-hop"];

/** One journey's backfilled display code, as the oracle produced it. */
interface DisplayCode {
  journey: string;
  display_code: string;
}

interface ExpectedFixture extends SchemaInventory {
  applied_migration_ids: string[];
  identity_layers: string[];
  conversation_journeys: (string | null)[];
  memory_journeys: (string | null)[];
  memory_legacy_row: Record<string, unknown> | null;
  attachment_legacy_row: Record<string, unknown> | null;
  task_legacy_row: Record<string, unknown> | null;
  memories_fts_findable_legacy_row_count: number;
  // CV22.DS6.TS5 — present only for the 016 legacy fixture: the display codes
  // migration 016's real ADD-COLUMN + backfill-against-NULL branches produced.
  builder_refinement_story_codes?: DisplayCode[];
  builder_change_request_codes?: DisplayCode[];
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

      // Schema shape — via the same enumerated TS ⊇ Python divergence contract
      // TS1's schema_structural_parity.ts and the CI-enforced
      // migrationFixtures.test.ts already use: TS's engine now authors
      // migration 017, so a fixture whose seed has an `identity` table ends
      // with the parent_journey column + index beyond Python's captured
      // end-state.
      const schemaProblems = diffTsInventoryAgainstSnapshot(inventory, expected);
      if (schemaProblems.length > 0) {
        ok = false;
        for (const problem of schemaProblems) details.push(problem);
      }

      const appliedIds = (db.prepare("SELECT id FROM _migrations").all() as { id: string }[])
        .map((r) => r.id)
        .sort();
      // TS runs its own forward migrations (017+) beyond Python's captured end-state.
      if (
        !isDeepStrictEqual(appliedIds, [...expected.applied_migration_ids, ...TS_AUTHORED_MIGRATION_IDS].sort())
      ) {
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

      // Builder-workbench display_code backfill (CV22.DS6.TS5) — present only
      // for the 016 fixture. Grades the codes migration 016's real
      // ADD-COLUMN + backfill-against-NULL branches produced, by value, not
      // merely that the column/index exist.
      if (expected.builder_refinement_story_codes) {
        if (expected.builder_refinement_story_codes.length === 0) {
          ok = false;
          details.push("builder_refinement_story_codes: fixture declares zero codes, expected non-empty");
        }
        const rsCodes = (
          db
            .prepare("SELECT journey, display_code FROM builder_refinement_stories ORDER BY id")
            .all() as { journey: string; display_code: string }[]
        ).map((r) => ({ journey: r.journey, display_code: r.display_code }));
        if (!isDeepStrictEqual(rsCodes, expected.builder_refinement_story_codes)) {
          ok = false;
          details.push("builder_refinement_story_codes: mismatch");
        }
      }
      if (expected.builder_change_request_codes) {
        if (expected.builder_change_request_codes.length === 0) {
          ok = false;
          details.push("builder_change_request_codes: fixture declares zero codes, expected non-empty");
        }
        const crCodes = (
          db
            .prepare("SELECT journey, display_code FROM builder_change_requests ORDER BY id")
            .all() as { journey: string; display_code: string }[]
        ).map((r) => ({ journey: r.journey, display_code: r.display_code }));
        if (!isDeepStrictEqual(crCodes, expected.builder_change_request_codes)) {
          ok = false;
          details.push("builder_change_request_codes: mismatch");
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
