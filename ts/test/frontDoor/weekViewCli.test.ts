import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "../helpers/identitySchema.ts";
import { createTasksTable } from "../helpers/tasksSchema.ts";

// Full front-door plumbing smoke test (routing -> DB open -> dispatch ->
// render). Exact-content parity against the Python oracle, across every
// branch, is proven by the golden-driven test in weekRender.test.ts; this
// test only needs real system time to behave sanely end to end, which an
// empty database makes assertable regardless of the actual current date.
function emptyDbCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-weekcli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  createTasksTable(db);
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("front door `week view` on an empty database prints 'No items in the current week.'", () => {
  const ws = emptyDbCopy();
  try {
    const result = spawnFrontDoor(["week", "view", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "No items in the current week.\n");
  } finally {
    ws.cleanup();
  }
});

test("front door bare `week` (no subcommand) behaves identically to `week view`", () => {
  const ws = emptyDbCopy();
  try {
    const result = spawnFrontDoor(["week", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "No items in the current week.\n");
  } finally {
    ws.cleanup();
  }
});

// `week plan`/`save` staying on Python is proven at the routing-decision level
// (routing.test.ts) -- not re-verified here via an actual Python subprocess
// spawn, which would need a real uv/Python environment and LLM credentials
// this suite doesn't assume.
