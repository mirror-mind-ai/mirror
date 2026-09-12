/**
 * Key-leak check across every durable surface (CV22.DS8.US3).
 *
 * The API key is read from the environment only. This asserts it did not reach
 * anything that persists: the front-door log, and the `prompt`/`response`
 * columns of every ledger row on every database it is pointed at. Reports
 * counts only — it never prints the key, and never prints a matching row.
 *
 * Usage:
 *   node --env-file=.env ts/parity/key_hygiene.ts <db> [<db> ...]
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openDatabaseReadOnly } from "#db/database.ts";

const key = process.env.OPENROUTER_API_KEY?.trim();
if (!key) {
  console.log("FAIL OPENROUTER_API_KEY is not set; nothing to check for");
  process.exit(1);
}

const databases = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (databases.length === 0) {
  console.log("usage: node --env-file=.env ts/parity/key_hygiene.ts <db> [<db> ...]");
  process.exit(1);
}

let leaks = 0;

function report(label: string, count: number): void {
  if (count > 0) leaks += 1;
  console.log(`  ${count === 0 ? "ok  " : "FAIL"} ${label.padEnd(52)} ${count}`);
}

for (const dbPath of databases) {
  console.log(`\n${dbPath}`);
  const db = openDatabaseReadOnly(dbPath);
  try {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM llm_calls WHERE prompt LIKE ? OR response LIKE ?",
      )
      .get(`%${key}%`, `%${key}%`) as { n: number };
    report("ledger rows carrying the key", row.n);

    const bodies = db
      .prepare("SELECT COUNT(*) AS n FROM llm_calls WHERE LENGTH(prompt) > 0 OR LENGTH(response) > 0")
      .get() as { n: number };
    // Not a leak by itself -- MEMORY_LOG_LLM_CALLS=full stores bodies on
    // purpose -- but on a default install it should be zero, and a non-zero
    // count is what would turn a future key rotation into a search problem.
    report("ledger rows storing bodies at all", bodies.n);
  } finally {
    db.close();
  }

  const logPath = join(dirname(dbPath), "front-door.log");
  if (existsSync(logPath)) {
    const occurrences = readFileSync(logPath, "utf8").split(key).length - 1;
    report("front-door.log lines carrying the key", occurrences);
  } else {
    console.log(`  ..   no front-door.log beside this database`);
  }
}

console.log(leaks === 0 ? "\nPASS key hygiene" : `\nFAIL key hygiene -- ${leaks} surface(s)`);
process.exit(leaks === 0 ? 0 : 1);
