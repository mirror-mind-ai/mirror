// Worker process for the A4 real-cross-process bootstrap race
// (`bootstrapConcurrency.test.ts`). Bootstraps the path given as argv[2] and
// exits 0 on success, non-zero with a message on stderr on failure. Kept as a
// standalone script (not a function called in-process) because A4's whole
// point is proving safety across real OS processes, not `Promise.all` within
// one.

import { bootstrapDatabase } from "../../src/db/bootstrap.ts";

const dbPath = process.argv[2];
if (!dbPath) {
  console.error("usage: bootstrapConcurrencyWorker.ts <db-path>");
  process.exit(2);
}

try {
  const db = bootstrapDatabase(dbPath);
  db.close();
  process.exit(0);
} catch (error) {
  console.error(String(error instanceof Error ? error.stack : error));
  process.exit(1);
}
