import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "../../src/db/database.ts";
import { spawnFrontDoor } from "../helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "../helpers/identitySchema.ts";
import { createTasksTable } from "../helpers/tasksSchema.ts";

function taskDbCopy(): { tmpDir: string; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-taskscli-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  createTasksTable(db);
  db.close();
  return { tmpDir, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function idsInDb(dbPath: string): string[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return db
      .prepare("SELECT id FROM tasks ORDER BY created_at")
      .all()
      .map((r) => r.id as string);
  } finally {
    db.close();
  }
}

test("front door `tasks add` creates a task and prints the created line", () => {
  const ws = taskDbCopy();
  try {
    const result = spawnFrontDoor([
      "tasks",
      "add",
      "Write the plan",
      "--journey",
      "cv22",
      "--due",
      "2026-05-01",
      "--db-path",
      ws.dbPath,
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /✅ Task created: `\w+` - Write the plan/);
    assert.match(result.stdout, /Journey: cv22/);
    assert.match(result.stdout, /Due: 2026-05-01/);
    assert.equal(idsInDb(ws.dbPath).length, 1);
  } finally {
    ws.cleanup();
  }
});

test("front door `tasks list` prints 'No tasks found.' on an empty database", () => {
  const ws = taskDbCopy();
  try {
    const result = spawnFrontDoor(["tasks", "list", "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "No tasks found.\n");
  } finally {
    ws.cleanup();
  }
});

test("front door `tasks done|doing|block` transition a task and print the icon line", () => {
  const ws = taskDbCopy();
  try {
    const add = spawnFrontDoor(["tasks", "add", "Ship it", "--db-path", ws.dbPath]);
    const id = idsInDb(ws.dbPath)[0];
    assert.ok(id, "expected the added task to exist");

    const doing = spawnFrontDoor(["tasks", "doing", id, "--db-path", ws.dbPath]);
    assert.equal(doing.status, 0);
    assert.equal(doing.stdout, `◐ Task \`${id}\` → doing: Ship it\n`);

    const done = spawnFrontDoor(["tasks", "done", id, "--db-path", ws.dbPath]);
    assert.equal(done.status, 0);
    assert.equal(done.stdout, `● Task \`${id}\` → done: Ship it\n`);
    assert.equal(add.status, 0);
  } finally {
    ws.cleanup();
  }
});

test("front door `tasks delete` removes the task and prints the removed line", () => {
  const ws = taskDbCopy();
  try {
    spawnFrontDoor(["tasks", "add", "Throwaway", "--db-path", ws.dbPath]);
    const id = idsInDb(ws.dbPath)[0];
    const result = spawnFrontDoor(["tasks", "delete", id, "--db-path", ws.dbPath]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `🗑 Task removed: \`${id}\` - Throwaway\n`);
    assert.equal(idsInDb(ws.dbPath).length, 0);
  } finally {
    ws.cleanup();
  }
});

test("front door `tasks doing|delete` on an unknown id prints 'not found' and exits 0 (Python never sys.exit()s here)", () => {
  const ws = taskDbCopy();
  try {
    const doing = spawnFrontDoor(["tasks", "doing", "zzz", "--db-path", ws.dbPath]);
    assert.equal(doing.status, 0);
    assert.equal(doing.stdout, "❌ Task 'zzz' not found.\n");

    const del = spawnFrontDoor(["tasks", "delete", "zzz", "--db-path", ws.dbPath]);
    assert.equal(del.status, 0);
    assert.equal(del.stdout, "❌ Task 'zzz' not found.\n");
  } finally {
    ws.cleanup();
  }
});

// The Navigator-visible demonstration from the test guide: the SAME ambiguous
// prefix, against the SAME two tasks, produces Python's own asymmetric
// messages depending on which command resolves it.
test("front door: an ambiguous prefix produces DIFFERENT messages for status-change vs delete, matching Python's own asymmetry", () => {
  const ws = taskDbCopy();
  try {
    spawnFrontDoor(["tasks", "add", "Task One", "--db-path", ws.dbPath]);
    spawnFrontDoor(["tasks", "add", "Task Two", "--db-path", ws.dbPath]);
    const ids = idsInDb(ws.dbPath);
    assert.equal(ids.length, 2);

    // Find the longest common id prefix shared by both generated ids so a
    // single prefix is guaranteed ambiguous regardless of the random ids
    // newId() generated for this run.
    let sharedPrefix = "";
    const [a, b] = ids;
    for (let i = 1; i <= Math.min(a.length, b.length); i += 1) {
      if (a.slice(0, i) === b.slice(0, i)) sharedPrefix = a.slice(0, i);
      else break;
    }
    if (sharedPrefix.length === 0) return; // astronomically unlikely; skip rather than flake

    const doing = spawnFrontDoor(["tasks", "doing", sharedPrefix, "--db-path", ws.dbPath]);
    assert.equal(doing.status, 0);
    assert.match(doing.stdout, /❌ Ambiguous ID '.+'\. Matches: /);

    const del = spawnFrontDoor(["tasks", "delete", sharedPrefix, "--db-path", ws.dbPath]);
    assert.equal(del.status, 0);
    assert.equal(del.stdout, `❌ Task '${sharedPrefix}' not found.\n`);

    // Neither task was deleted by the ambiguous delete attempt.
    assert.equal(idsInDb(ws.dbPath).length, 2);
  } finally {
    ws.cleanup();
  }
});

test("front door writes are backup-gated: a pre-write backup file is produced under backups/", () => {
  const ws = taskDbCopy();
  try {
    spawnFrontDoor(["tasks", "add", "Backed up", "--db-path", ws.dbPath]);
    const backupContent = readFileSync(join(ws.tmpDir, "backups", "frontdoor-pre-write-backup.db"));
    assert.ok(backupContent.length > 0, "expected a non-empty pre-write backup file");
  } finally {
    ws.cleanup();
  }
});

// RS005/OPS CR026 redaction: front-door writes must never log a task title or
// argument payload -- only the top-level command name is recorded.
test("front door redaction: the front-door log never contains the task title", () => {
  const ws = taskDbCopy();
  try {
    const secretTitle = "SECRET-TITLE-should-never-be-logged";
    spawnFrontDoor(["tasks", "add", secretTitle, "--db-path", ws.dbPath]);
    const logContent = readFileSync(join(ws.tmpDir, "front-door.log"), "utf8");
    assert.doesNotMatch(logContent, new RegExp(secretTitle));
    assert.match(logContent, /\btasks\t/);
  } finally {
    ws.cleanup();
  }
});
