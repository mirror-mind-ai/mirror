// Shared test helper: roll a bootstrapped database back to the pre-017 "legacy"
// state that migrate-on-open must activate — drop the `parent_journey` column and
// its index, and remove 017 from the ledger — so only the TS-authored tail is
// pending. This is the exact state US2 left tolerable; centralizing it keeps the
// migrate-on-open unit and concurrency tests from drifting apart.

import { openDatabaseForBootstrap } from "../../src/db/database.ts";

const TS_AUTHORED_017 = "017_journey_parent_column";

/** Regress an already-bootstrapped `dbPath` to the pre-017 legacy shape. */
export function regressToPre017(dbPath: string): void {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    db.exec("DROP INDEX IF EXISTS idx_identity_parent_journey");
    db.exec("ALTER TABLE identity DROP COLUMN parent_journey");
    db.prepare("DELETE FROM _migrations WHERE id = ?").run(TS_AUTHORED_017);
  } finally {
    db.close();
  }
}
