import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const CLI = "src/frontDoor/cli.ts";

// First-run contract (CR015): a TS-routed command against a *missing* database
// must self-heal by delegating to Python, which bootstraps schema+migrations —
// the same experience a new user had before the front-door cutover. Spawns real
// uv/python (present in dev and CI).
test("a ported read command on a missing database self-heals via Python bootstrap", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-firstrun-"));
  const dbPath = join(dir, "memory.db");
  try {
    assert.ok(!existsSync(dbPath), "precondition: database absent");
    const result = spawnSync(process.execPath, [CLI, "journeys", "--db-path", dbPath], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
    });
    assert.equal(result.status, 0, `expected self-heal, got ${result.status}: ${result.stderr}`);
    assert.ok(existsSync(dbPath), "Python should have bootstrapped the database");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
