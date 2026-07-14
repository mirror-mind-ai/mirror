import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const CLI = "src/frontDoor/cli.ts";

// End-to-end: an unported command must reach the frozen Python engine, and the
// front door's --db-path must translate into the DB_PATH the Python core reads.
// This spawns real `uv run python -m memory`, so it needs uv on PATH (present in
// dev and CI). `list journeys` is unported, DB-only, and needs no API keys.
test("an unported command routes to Python and honors the translated --db-path", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-fallback-"));
  const dbPath = join(dir, "memory.db");
  try {
    const result = spawnSync(process.execPath, [CLI, "list", "journeys", "--db-path", dbPath], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
    });
    if (result.status !== 0) {
      // Surface Python's stderr if the environment lacks uv/python.
      assert.fail(`fallback did not succeed (status ${result.status}): ${result.stderr}`);
    }
    // The proof that --db-path became DB_PATH: Python bootstrapped the schema
    // at exactly this path.
    assert.ok(existsSync(dbPath), "Python fallback should create the DB at the translated path");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
