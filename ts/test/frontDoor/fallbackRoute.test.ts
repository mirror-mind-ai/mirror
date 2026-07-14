import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const CLI = "src/frontDoor/cli.ts";

// This spawns real `uv run python -m memory`, so it needs uv on PATH. It runs
// locally and anywhere uv is present; the Node-only `ts` CI job has no uv, so
// it skips there until CR017 adds uv to that job. `list journeys` is unported,
// DB-only, and needs no API keys.
function uvAvailable(): boolean {
  const probe = spawnSync("uv", ["--version"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

const skipWithoutUv = uvAvailable()
  ? false
  : "uv not on PATH (Python fallback e2e; CR017 adds uv to the ts CI job)";

// End-to-end: an unported command must reach the frozen Python engine, and the
// front door's --db-path must translate into the DB_PATH the Python core reads.
test("an unported command routes to Python and honors the translated --db-path", {
  skip: skipWithoutUv,
}, () => {
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
