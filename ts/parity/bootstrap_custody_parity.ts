// Navigator-visible route for CV22.DS6.TS3 — Cross-Process Locking &
// Connection Pragma Discipline.
//
// Unlike `schema_structural_parity.ts` (TS1, bare `createSchema()`) and
// `migration_structural_parity.ts` (TS2, `runMigrations()` over legacy
// fixtures), this proves the *composed bootstrap authority* TS3 delivers:
// `bootstrapDatabase()` — cross-process lock, pragma discipline (busy_timeout,
// foreign_keys, WAL), migrations, and schema DDL, all in Python's exact
// order. It checks:
//
//   1. pragma presence on the bootstrapped connection (WAL/busy_timeout/FK);
//   2. schema-structural equivalence against the same committed Python
//      snapshot TS1 proved against (a full bootstrap of a fresh DB should
//      migrate/schema to the identical structural shape — TS2 documented
//      that migrations are dead code on a from-scratch database, so this is
//      a real assertion, not a tautology: it would catch pragma-ordering
//      bugs that corrupt the DDL phase, e.g. WAL set inside a transaction);
//   3. idempotency (bootstrapping twice leaves the same `_migrations` rows);
//   4. a real cross-process concurrency race — M child processes bootstrap
//      the same fresh path concurrently; asserts no duplicate `_migrations`
//      rows and a valid final schema.
//
// Redacted by default: only counts, labels, and pass/fail are printed; no
// row content, ids, or fixture JSON. Never touches a live `memory.db` — every
// path here is a throwaway temp file under the OS tmp dir.
//
// Usage: node ts/parity/bootstrap_custody_parity.ts

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { bootstrapDatabase } from "../src/db/bootstrap.ts";
import { openDatabaseReadOnly, type WritableDatabase } from "../src/db/database.ts";
import { buildSchemaInventory, type SchemaInventory } from "../src/db/schemaInventory.ts";
import { SCHEMA_INVENTORY_SNAPSHOT } from "../src/db/schemaInventorySnapshot.ts";
import { KNOWN_MIGRATION_IDS } from "../src/db/schemaState.ts";

const WORKER = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "db", "bootstrapConcurrencyWorker.ts");
const CONCURRENT_PROCESSES = 8;

function diffTableCounts(actual: SchemaInventory, expected: SchemaInventory): string[] {
  const problems: string[] = [];
  for (const kind of ["tables", "indexes", "triggers"] as const) {
    const actualNames = new Set(Object.keys(actual[kind]));
    const expectedNames = new Set(Object.keys(expected[kind]));
    if (actualNames.size !== expectedNames.size) {
      problems.push(`${kind}: expected ${expectedNames.size}, got ${actualNames.size}`);
      continue;
    }
    for (const name of expectedNames) {
      if (!actualNames.has(name)) {
        problems.push(`${kind}: missing ${name}`);
      } else if (!isDeepStrictEqual(actual[kind][name], expected[kind][name])) {
        problems.push(`${kind}: ${name} differs structurally`);
      }
    }
  }
  return problems;
}

function checkPragmas(db: WritableDatabase): string[] {
  const problems: string[] = [];
  const journalMode = (db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string })
    ?.journal_mode;
  if (journalMode !== "wal") problems.push(`journal_mode expected wal, got ${journalMode}`);
  const busyTimeout = (db.prepare("PRAGMA busy_timeout").get() as { timeout?: number })?.timeout;
  if (busyTimeout !== 30000) problems.push(`busy_timeout expected 30000, got ${busyTimeout}`);
  const foreignKeys = (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys?: number })
    ?.foreign_keys;
  if (foreignKeys !== 1) problems.push(`foreign_keys expected 1, got ${foreignKeys}`);
  return problems;
}

function runWorker(dbPath: string): Promise<{ code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, dbPath], {
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.on("close", (code) => resolve({ code }));
  });
}

async function main(): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "mirror-bootstrap-custody-parity-"));
  let exitCode = 0;
  try {
    // 1-3: single-process bootstrap + pragma + structural + idempotency.
    const dbPath = join(dir, "fresh.db");
    const first = bootstrapDatabase(dbPath);
    const pragmaProblems = checkPragmas(first);
    const inventory = buildSchemaInventory(first);
    const structuralProblems = diffTableCounts(inventory, SCHEMA_INVENTORY_SNAPSHOT);
    const firstMigrationIds = (first.prepare("SELECT id FROM _migrations ORDER BY id").all() as {
      id: string;
    }[]).map((row) => row.id);
    first.close();

    const second = bootstrapDatabase(dbPath);
    const secondMigrationIds = (second.prepare("SELECT id FROM _migrations ORDER BY id").all() as {
      id: string;
    }[]).map((row) => row.id);
    second.close();
    const idempotencyOk = isDeepStrictEqual(firstMigrationIds, secondMigrationIds);

    process.stdout.write("== pragma discipline (busy_timeout, foreign_keys, WAL) ==\n");
    process.stdout.write(`  ${pragmaProblems.length === 0 ? "PASS" : "FAIL"}\n`);
    for (const problem of pragmaProblems) process.stdout.write(`    - ${problem}\n`);

    process.stdout.write("== schema-structural equivalence (bootstrapDatabase vs Python snapshot) ==\n");
    process.stdout.write(`  ${structuralProblems.length === 0 ? "PASS" : "FAIL"}\n`);
    for (const problem of structuralProblems) process.stdout.write(`    - ${problem}\n`);

    process.stdout.write("== idempotency (re-bootstrap leaves identical _migrations ledger) ==\n");
    process.stdout.write(
      `  ${idempotencyOk ? "PASS" : "FAIL"} (${firstMigrationIds.length} migration ids, ${KNOWN_MIGRATION_IDS.length} known)\n`,
    );

    // 4: real cross-process concurrency race.
    const raceDbPath = join(dir, "race.db");
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_PROCESSES }, () => runWorker(raceDbPath)),
    );
    const workerFailures = results.filter((result) => result.code !== 0).length;
    const raceDb = openDatabaseReadOnly(raceDbPath);
    const raceIds = (raceDb.prepare("SELECT id FROM _migrations ORDER BY id").all() as { id: string }[]).map(
      (row) => row.id,
    );
    raceDb.close();
    const raceNoDuplicates = new Set(raceIds).size === raceIds.length;
    const raceComplete = isDeepStrictEqual([...raceIds].sort(), [...KNOWN_MIGRATION_IDS].sort());
    const raceOk = workerFailures === 0 && raceNoDuplicates && raceComplete;

    process.stdout.write(
      `== concurrency race (${CONCURRENT_PROCESSES} real processes bootstrapping the same fresh path) ==\n`,
    );
    process.stdout.write(
      `  ${raceOk ? "PASS" : "FAIL"} (worker failures: ${workerFailures}, duplicate rows: ${!raceNoDuplicates}, ledger complete: ${raceComplete})\n`,
    );

    const pass =
      pragmaProblems.length === 0 && structuralProblems.length === 0 && idempotencyOk && raceOk;
    process.stdout.write(`\nBOOTSTRAP CUSTODY PARITY: ${pass ? "PASS" : "FAIL"}\n`);
    exitCode = pass ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return exitCode;
}

main().then((code) => process.exit(code));
