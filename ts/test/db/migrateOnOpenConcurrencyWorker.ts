// Worker process for the A6 real-cross-process migrate-on-open race
// (`migrateOnOpenConcurrency.test.ts`). Calls `ensureMigratedOnOpen` against the
// path given as argv[2] and prints exactly one outcome token to stdout —
// "migrated" | "noop" | "deferred" — so the parent can assert that exactly one
// racing process applied the migration. Standalone (not in-process) because the
// point is proving safety across real OS processes and their bootstrap locks.

import { ensureMigratedOnOpen } from "../../src/db/migrateOnOpen.ts";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("usage: migrateOnOpenConcurrencyWorker.ts <db-path>");
  process.exit(2);
}

try {
  const result = ensureMigratedOnOpen(dbPath);
  process.stdout.write(
    result.migrated ? "migrated" : result.deferredToPython ? "deferred" : "noop",
  );
  process.exit(0);
} catch (error) {
  console.error(String(error instanceof Error ? error.stack : error));
  process.exit(1);
}
