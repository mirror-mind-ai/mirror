// Navigator E2E smoke for migrate-on-open (CV22.DS6.US3).
//
// migrate-on-open has NO Python oracle — Python cannot apply migration 017 — so
// it is validated end-to-end here rather than by oracle replay: take a copy of a
// real/demo database, regress the copy to the pre-017 legacy state, run the REAL
// TS front door against it, and assert the runtime backed it up, applied 017,
// backfilled the column from JSON, still served journeys, and logged the event.
//
// Privacy posture mirrors the real-DB-copy harness: never touch the live source
// after the copy step, keep the work dir owner-only, print redacted evidence
// (labels, booleans, counts — never journey names or content), and remove the
// work dir on a passing run (pass --keep to retain).
//
// Run:
//   uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
//   node ts/parity/migrate_on_open_smoke.ts --source-db tmp/parity/demo-memory.db

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  openDatabaseForBootstrap,
  openDatabaseReadOnly,
  snapshotDatabaseTo,
} from "../src/db/database.ts";
import { migrationBackupPathFor } from "../src/db/migrateOnOpen.ts";
import { frontDoorLogPath } from "../src/frontDoor/frontDoorLog.ts";
import { resolveParentJourney } from "../src/journey/parentJourney.ts";

const MIGRATION_017 = "017_journey_parent_column";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function migrationIds(dbPath: string): string[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return (db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id);
  } finally {
    db.close();
  }
}

function hasParentColumn(dbPath: string): boolean {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return (db.prepare('PRAGMA table_info("identity")').all() as { name: string }[]).some(
      (r) => r.name === "parent_journey",
    );
  } finally {
    db.close();
  }
}

/** Count journey rows whose authoritative (JSON) metadata declares a parent. */
function jsonParentCount(dbPath: string): number {
  const db = openDatabaseReadOnly(dbPath);
  try {
    const rows = db
      .prepare("SELECT metadata FROM identity WHERE layer = 'journey'")
      .all() as { metadata: string | null }[];
    return rows.filter((r) => resolveParentJourney({ metadata: r.metadata }) !== "").length;
  } finally {
    db.close();
  }
}

/** Count journey rows whose backfilled column carries a parent. */
function columnParentCount(dbPath: string): number {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM identity WHERE layer = 'journey' " +
            "AND parent_journey IS NOT NULL AND parent_journey <> ''",
        )
        .get() as { c: number }
    ).c;
  } finally {
    db.close();
  }
}

/** Ensure a copied DB is in the pre-017 legacy shape, tolerating a source that is
 * already legacy (a Python-generated DB never has the column, since Python cannot
 * apply 017). Drops the column + index only if present, and removes 017 from the
 * ledger; JSON metadata is left untouched. */
function ensurePre017(dbPath: string): void {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    const hasColumn = (db.prepare('PRAGMA table_info("identity")').all() as { name: string }[]).some(
      (r) => r.name === "parent_journey",
    );
    if (hasColumn) {
      db.exec("DROP INDEX IF EXISTS idx_identity_parent_journey");
      db.exec("ALTER TABLE identity DROP COLUMN parent_journey");
    }
    db.prepare("DELETE FROM _migrations WHERE id = ?").run(MIGRATION_017);
  } finally {
    db.close();
  }
}

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

function main(): number {
  const sourceArg = argValue("--source-db");
  if (!sourceArg) {
    console.error("usage: migrate_on_open_smoke.ts --source-db <db> [--work-dir <dir>] [--keep]");
    return 2;
  }
  const sourceDb = resolve(sourceArg);
  if (!existsSync(sourceDb)) {
    console.error(`source DB does not exist: ${sourceDb}`);
    return 2;
  }
  const workDir = resolve(argValue("--work-dir") ?? "tmp/parity/migrate-on-open");
  const keep = process.argv.includes("--keep");
  const copiedDb = resolve(workDir, "smoke-copy.db");

  // Copy (never mutate the source) into an owner-only work dir.
  mkdirSync(workDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(workDir, 0o700);
  } catch {
    // best-effort on non-POSIX
  }
  rmSync(copiedDb, { force: true });
  rmSync(`${copiedDb}-wal`, { force: true });
  rmSync(`${copiedDb}-shm`, { force: true });
  snapshotDatabaseTo(sourceDb, copiedDb);

  // Establish the legacy precondition and capture the expected backfill.
  const expectedBackfill = jsonParentCount(copiedDb);
  ensurePre017(copiedDb);

  const preColumn = hasParentColumn(copiedDb);
  const pre017 = migrationIds(copiedDb).includes(MIGRATION_017);
  const backupPath = migrationBackupPathFor(copiedDb);

  // Run the REAL front door against the copy.
  const run = spawnSync(
    process.execPath,
    ["ts/src/frontDoor/cli.ts", "journeys", "--db-path", copiedDb],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--no-warnings" } },
  );

  const post017 = migrationIds(copiedDb).includes(MIGRATION_017);
  const postColumn = hasParentColumn(copiedDb);
  const backfilled = postColumn ? columnParentCount(copiedDb) : -1;
  const log = existsSync(frontDoorLogPath(copiedDb))
    ? readFileSync(frontDoorLogPath(copiedDb), "utf8")
    : "";

  const checks: Check[] = [
    { label: "precondition: column absent", ok: !preColumn, detail: String(!preColumn) },
    { label: "precondition: 017 pending", ok: !pre017, detail: String(!pre017) },
    { label: "front door served (exit 0)", ok: run.status === 0, detail: `exit=${run.status}` },
    {
      label: "journeys output non-empty",
      ok: (run.stdout ?? "").trim().length > 0,
      detail: `stdout_lines=${(run.stdout ?? "").trim().split("\n").length}`,
    },
    { label: "017 applied on open", ok: post017, detail: String(post017) },
    { label: "parent_journey column created", ok: postColumn, detail: String(postColumn) },
    {
      label: "column backfilled from JSON",
      ok: backfilled === expectedBackfill,
      detail: `column=${backfilled} expected=${expectedBackfill}`,
    },
    { label: "pre-migration backup taken", ok: existsSync(backupPath), detail: String(existsSync(backupPath)) },
    { label: "migrate_on_open logged", ok: /migrate_on_open/.test(log), detail: String(/migrate_on_open/.test(log)) },
    { label: "log names migration 017", ok: log.includes(MIGRATION_017), detail: String(log.includes(MIGRATION_017)) },
  ];

  const passed = checks.every((check) => check.ok);
  console.log("migrate-on-open E2E smoke (redacted):");
  for (const check of checks) {
    console.log(`  [${check.ok ? "PASS" : "FAIL"}] ${check.label} (${check.detail})`);
  }
  console.log(passed ? "RESULT: PASS" : "RESULT: FAIL");

  if (passed && !keep) {
    rmSync(workDir, { recursive: true, force: true });
    console.log(`cleaned up work dir (use --keep to retain): ${workDir}`);
  } else {
    console.log(`retained work dir: ${workDir}`);
  }
  return passed ? 0 : 1;
}

process.exit(main());
