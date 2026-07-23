import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  applyTasksAdd,
  applyTasksDelete,
  applyTasksStatusChange,
} from "../../src/frontDoor/tasksWriteRoute.ts";
import { createTask, getTaskById } from "../../src/tasks/taskStore.ts";
import { createTasksTable } from "../helpers/tasksSchema.ts";

const NOW = "2026-04-01T10:00:00.000000Z";
const LATER = "2026-04-02T11:00:00.000000Z";

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-taskswr-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  return {
    dbPath: join(tmp, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function withDb(fn: (db: WritableDatabase) => void): void {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    fn(db);
  } finally {
    db.close();
    cleanup();
  }
}

test("applyTasksAdd creates a task via the injected id/now", () => {
  withDb((db) => {
    const task = applyTasksAdd(db, { title: "New", journey: "cv22" }, "t-1", NOW);
    assert.equal(task.id, "t-1");
    assert.equal(task.title, "New");
    assert.equal(task.journey, "cv22");
    assert.deepEqual(getTaskById(db, "t-1"), task);
  });
});

test("applyTasksStatusChange('done') completes the task (status + completed_at)", () => {
  withDb((db) => {
    createTask(db, { title: "T" }, "t-1", NOW);
    const outcome = applyTasksStatusChange(db, "t-1", "done", LATER);
    assert.equal(outcome.kind, "changed");
    if (outcome.kind === "changed") {
      assert.equal(outcome.task.status, "done");
      assert.equal(outcome.task.completed_at, LATER);
    }
    assert.equal(getTaskById(db, "t-1")?.completed_at, LATER);
  });
});

test("applyTasksStatusChange('doing'|'blocked') updates status without setting completed_at", () => {
  withDb((db) => {
    createTask(db, { title: "T" }, "t-1", NOW);
    const outcome = applyTasksStatusChange(db, "t-1", "doing", LATER);
    assert.equal(outcome.kind, "changed");
    if (outcome.kind === "changed") {
      assert.equal(outcome.task.status, "doing");
      assert.equal(outcome.task.completed_at, null);
    }
  });
});

test("applyTasksStatusChange resolves by unique prefix", () => {
  withDb((db) => {
    createTask(db, { title: "T" }, "abc12345", NOW);
    const outcome = applyTasksStatusChange(db, "abc1", "doing", LATER);
    assert.equal(outcome.kind, "changed");
  });
});

test("applyTasksStatusChange reports 'ambiguous' with every match on a shared prefix", () => {
  withDb((db) => {
    createTask(db, { title: "T" }, "abc11111", NOW);
    createTask(db, { title: "U" }, "abc22222", NOW);
    const outcome = applyTasksStatusChange(db, "abc", "doing", LATER);
    assert.equal(outcome.kind, "ambiguous");
    if (outcome.kind === "ambiguous") {
      assert.deepEqual(outcome.matches.map((t) => t.id).sort(), ["abc11111", "abc22222"]);
    }
  });
});

test("applyTasksStatusChange reports 'not_found' for no match", () => {
  withDb((db) => {
    const outcome = applyTasksStatusChange(db, "zzz", "doing", LATER);
    assert.deepEqual(outcome, { kind: "not_found", idOrPrefix: "zzz" });
  });
});

test("applyTasksDelete deletes on a unique prefix and reports the removed task", () => {
  withDb((db) => {
    createTask(db, { title: "T" }, "abc12345", NOW);
    const outcome = applyTasksDelete(db, "abc1");
    assert.equal(outcome.kind, "deleted");
    assert.equal(getTaskById(db, "abc12345"), null);
  });
});

test("applyTasksDelete folds an AMBIGUOUS prefix into 'not_found' -- the deliberate asymmetry with status-change", () => {
  withDb((db) => {
    createTask(db, { title: "T" }, "abc11111", NOW);
    createTask(db, { title: "U" }, "abc22222", NOW);
    const outcome = applyTasksDelete(db, "abc");
    assert.deepEqual(outcome, { kind: "not_found", idOrPrefix: "abc" });
    // Neither task was touched -- an ambiguous prefix must not delete anything.
    assert.ok(getTaskById(db, "abc11111"));
    assert.ok(getTaskById(db, "abc22222"));
  });
});

test("applyTasksDelete reports 'not_found' for zero matches too (same message as ambiguous)", () => {
  withDb((db) => {
    const outcome = applyTasksDelete(db, "zzz");
    assert.deepEqual(outcome, { kind: "not_found", idOrPrefix: "zzz" });
  });
});
