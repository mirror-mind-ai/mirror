import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openDatabaseReadOnly } from "../../src/db/database.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";

const WORKER = join(import.meta.dirname, "bootstrapConcurrencyWorker.ts");
const CONCURRENT_PROCESSES = 8;

function runWorker(dbPath: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, dbPath], {
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

// A4 — N real concurrent processes bootstrapping the same fresh path.
test("N concurrent real processes bootstrapping the same fresh path leave exactly one row per migration id and a valid schema", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-bootstrap-race-"));
  const dbPath = join(dir, "memory.db");
  try {
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_PROCESSES }, () => runWorker(dbPath)),
    );

    for (const result of results) {
      assert.equal(result.code, 0, `worker failed: ${result.stderr}`);
    }

    const db = openDatabaseReadOnly(dbPath);
    try {
      const rows = db.prepare("SELECT id FROM _migrations ORDER BY id").all() as { id: string }[];
      const ids = rows.map((row) => row.id);
      // No corruption: every known migration id present, each exactly once.
      assert.deepEqual([...ids].sort(), [...KNOWN_MIGRATION_IDS].sort());
      const distinctCount = new Set(ids).size;
      assert.equal(distinctCount, ids.length, "expected no duplicate _migrations rows");

      // Valid final schema and pragma discipline, same as the single-process path.
      assert.equal(
        (db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string })?.journal_mode,
        "wal",
      );
      assert.ok(
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'memories'").get(),
        "expected the memories table to exist after the race",
      );
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
