// `runtime migrate` — apply pending migrations, and say what the ledger did.
// (CV22.DS10.US2, decision D8)
//
// This verb does not exist on the oracle, and adding it corrects the oracle.
// Python's updater calls `_apply_migrations` IN-PROCESS, which means it
// migrates the database with the code it just fast-forwarded away from: the
// interpreter has already imported the old modules, and a migration authored
// in the new commit is not among them. The TypeScript updater spawns this verb
// in a FRESH process after `apply`, so the code that migrates is the code that
// was just installed.
//
// It is also useful on its own, which is why it is a named verb rather than a
// private argv: when an update fails between `apply` and `migrate`, the
// operator needs a way to finish the job without running the whole pipeline.
//
// The ledger is printed before and after because "migrations: pass" is a claim
// and the `_migrations` rows are the evidence. A stage that infers a migration
// from "some command opened the database" is what the Plan review rejected.

import { existsSync } from "node:fs";
import { openDatabaseReadOnly } from "#db/database.ts";
import { ensureMigratedOnOpen } from "#db/migrateOnOpen.ts";

export interface MigrateOutcome {
  dbPath: string;
  before: string[];
  after: string[];
  applied: string[];
  migrated: boolean;
  deferredToPython: boolean;
  backupPath: string | null;
  error: string | null;
}

/** The `_migrations` ledger, sorted. `null` when it cannot be read at all. */
export function readLedger(dbPath: string): string[] | null {
  if (!existsSync(dbPath)) return null;
  let db: ReturnType<typeof openDatabaseReadOnly>;
  try {
    db = openDatabaseReadOnly(dbPath);
  } catch {
    return null;
  }
  try {
    const rows = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
    return rows.map((row) => row.id).sort();
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export function runMigrate(dbPath: string): MigrateOutcome {
  const before = readLedger(dbPath);
  if (before === null) {
    return {
      dbPath,
      before: [],
      after: [],
      applied: [],
      migrated: false,
      deferredToPython: false,
      backupPath: null,
      error: existsSync(dbPath)
        ? "database has no readable migration ledger"
        : `database not found: ${dbPath}`,
    };
  }

  try {
    const result = ensureMigratedOnOpen(dbPath);
    const after = readLedger(dbPath) ?? before;
    return {
      dbPath,
      before,
      after,
      applied: [...result.appliedIds],
      migrated: result.migrated,
      deferredToPython: result.deferredToPython === true,
      backupPath: result.backupPath ?? null,
      error: null,
    };
  } catch (error) {
    return {
      dbPath,
      before,
      after: readLedger(dbPath) ?? before,
      applied: [],
      migrated: false,
      deferredToPython: false,
      backupPath: null,
      error: error instanceof Error ? error.message.split("\n")[0] : String(error),
    };
  }
}

export function renderMigrate(outcome: MigrateOutcome): string {
  const lines: string[] = ["Mirror runtime migrate", ""];
  lines.push(`Database: ${outcome.dbPath}`);
  if (outcome.error !== null) {
    lines.push(`Migration error: ${outcome.error}`);
    lines.push("");
    lines.push("Migrate result: failed");
    return `${lines.join("\n")}\n`;
  }

  // A standalone `runtime migrate` runs OUTSIDE the updater's backup-and-verify
  // chain: its only pre-state is migrate-on-open's own snapshot, which uses one
  // fixed name and is overwritten on each write. Inside the pipeline a verified
  // archive was taken three stages earlier; run directly, this line is the only
  // warning a user gets (CV22.DS10.US2 handoff review, security-engineer).
  lines.push(`Ledger before: ${outcome.before.length} migration(s)`);
  lines.push(`Ledger after: ${outcome.after.length} migration(s)`);
  if (outcome.applied.length > 0) lines.push(`Applied: ${outcome.applied.join(", ")}`);
  if (outcome.backupPath) lines.push(`Pre-migration snapshot: ${outcome.backupPath}`);
  if (outcome.deferredToPython) {
    lines.push("Deferred: a Python-authored migration is still pending for this database.");
  }
  if (!outcome.migrated) {
    lines.push("Take a verified archive first if you are running this outside an update:");
    lines.push("  runtime backup");
  }
  lines.push("");
  lines.push(
    outcome.migrated
      ? `Migrate result: applied ${outcome.applied.length} migration(s)`
      : "Migrate result: nothing pending",
  );
  return `${lines.join("\n")}\n`;
}
