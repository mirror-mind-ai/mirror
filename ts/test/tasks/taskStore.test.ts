import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  completeTask,
  createTask,
  deleteTaskById,
  findTasksByTitle,
  getAllTasks,
  getOpenTasks,
  getTaskById,
  getTasksByJourney,
  getTasksByStatus,
  getTasksForWeek,
  listTasks,
  resolveTaskByIdOrPrefix,
  type Task,
  updateTaskStatus,
} from "../../src/tasks/taskStore.ts";
import { createTasksTable } from "../helpers/tasksSchema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "task-store.golden.json");

interface TaskStoreGolden {
  seed_tasks: Task[];
  get_all_tasks: Task[];
  get_open_tasks_no_journey: Task[];
  get_open_tasks_journey_cv22: Task[];
  get_tasks_by_status_todo: Task[];
  get_tasks_by_journey_cv22: Task[];
  find_tasks_by_title_fragment_no_journey: Task[];
  find_tasks_by_title_fragment_journey_other: Task[];
  get_tasks_for_week: Task[];
  week_range: { start_date: string; end_date: string };
  list_tasks_open_only: Task[];
  list_tasks_status_todo_journey_cv22: Task[];
  list_tasks_journey_other_no_status: Task[];
  list_tasks_all: Task[];
}

const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as TaskStoreGolden;

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-tasks-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Raw insert bypassing `createTask`'s business defaults, so golden fixtures
 * with varied status/timestamps (e.g. an already-`done` seed row) can be
 * seeded verbatim -- this seeds DATA, it does not exercise the write path. */
function seedTasksRaw(db: WritableDatabase, tasks: readonly Task[]): void {
  const stmt = db.prepare(
    "INSERT INTO tasks (id, journey, title, status, due_date, scheduled_at, time_hint, " +
      "stage, context, source, created_at, updated_at, completed_at, metadata) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const t of tasks) {
    stmt.run(
      t.id,
      t.journey,
      t.title,
      t.status,
      t.due_date,
      t.scheduled_at,
      t.time_hint,
      t.stage,
      t.context,
      t.source,
      t.created_at,
      t.updated_at,
      t.completed_at,
      t.metadata,
    );
  }
}

function withSeededDb(fn: (db: WritableDatabase) => void): void {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    seedTasksRaw(db, golden.seed_tasks);
    fn(db);
  } finally {
    db.close();
    cleanup();
  }
}

test("task-store golden is well-formed", () => {
  assert.ok(golden.seed_tasks.length > 0, "corpus has seed tasks");
});

test("getAllTasks reproduces the Python oracle order (status, due_date NULLS LAST, created_at)", () => {
  withSeededDb((db) => {
    assert.deepEqual(getAllTasks(db), golden.get_all_tasks);
  });
});

test("getOpenTasks (no journey) reproduces the Python oracle", () => {
  withSeededDb((db) => {
    assert.deepEqual(getOpenTasks(db), golden.get_open_tasks_no_journey);
  });
});

test("getOpenTasks (journey filter) reproduces the Python oracle", () => {
  withSeededDb((db) => {
    assert.deepEqual(getOpenTasks(db, "cv22"), golden.get_open_tasks_journey_cv22);
  });
});

test("getTasksByStatus reproduces the Python oracle", () => {
  withSeededDb((db) => {
    assert.deepEqual(getTasksByStatus(db, "todo"), golden.get_tasks_by_status_todo);
  });
});

test("getTasksByJourney reproduces the Python oracle", () => {
  withSeededDb((db) => {
    assert.deepEqual(getTasksByJourney(db, "cv22"), golden.get_tasks_by_journey_cv22);
  });
});

test("findTasksByTitle without a journey filter reproduces the Python oracle", () => {
  withSeededDb((db) => {
    assert.deepEqual(
      findTasksByTitle(db, "Findable"),
      golden.find_tasks_by_title_fragment_no_journey,
    );
  });
});

test("findTasksByTitle with a journey filter reproduces the Python oracle", () => {
  withSeededDb((db) => {
    assert.deepEqual(
      findTasksByTitle(db, "Findable", "other-journey"),
      golden.find_tasks_by_title_fragment_journey_other,
    );
  });
});

test("getTasksForWeek reproduces the Python oracle, including inclusive range boundaries", () => {
  withSeededDb((db) => {
    const { start_date, end_date } = golden.week_range;
    assert.deepEqual(getTasksForWeek(db, start_date, end_date), golden.get_tasks_for_week);
  });
});

test("listTasks(openOnly) reproduces the Python TaskService oracle", () => {
  withSeededDb((db) => {
    assert.deepEqual(listTasks(db, { openOnly: true }), golden.list_tasks_open_only);
  });
});

test("listTasks(status + journey) applies journey as a post-filter over the status read", () => {
  withSeededDb((db) => {
    assert.deepEqual(
      listTasks(db, { status: "todo", journey: "cv22" }),
      golden.list_tasks_status_todo_journey_cv22,
    );
  });
});

test("listTasks(journey only) reproduces the Python oracle", () => {
  withSeededDb((db) => {
    assert.deepEqual(
      listTasks(db, { journey: "other-journey" }),
      golden.list_tasks_journey_other_no_status,
    );
  });
});

test("listTasks() with no filters falls through to getAllTasks", () => {
  withSeededDb((db) => {
    assert.deepEqual(listTasks(db), golden.list_tasks_all);
  });
});

// --- Writes: hand-written, since these are genuinely new TS-authored writes
// (Python has no shared prefix resolver, and the seed above bypasses createTask
// on purpose). Frozen id/timestamps make row comparison exact, per the plan's
// determinism-input refinement.

const NOW = "2026-03-01T10:00:00.000000Z";
const LATER = "2026-03-02T11:00:00.000000Z";

test("createTask inserts a row with status 'todo', null completed_at, and the injected id/timestamps", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    const task = createTask(
      db,
      { title: "New Task", journey: "cv22", dueDate: "2026-03-05", stage: "S1" },
      "t-new1",
      NOW,
    );
    assert.deepEqual(task, {
      id: "t-new1",
      journey: "cv22",
      title: "New Task",
      status: "todo",
      due_date: "2026-03-05",
      scheduled_at: null,
      time_hint: null,
      stage: "S1",
      context: null,
      source: "manual",
      created_at: NOW,
      updated_at: NOW,
      completed_at: null,
      metadata: null,
    });
    assert.deepEqual(getTaskById(db, "t-new1"), task);
  } finally {
    db.close();
    cleanup();
  }
});

test("createTask defaults source to 'manual' but accepts an explicit source (e.g. 'journey_path')", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "Imported", source: "journey_path" }, "t-imp1", NOW);
    assert.equal(getTaskById(db, "t-imp1")?.source, "journey_path");
  } finally {
    db.close();
    cleanup();
  }
});

test("updateTaskStatus sets status and bumps updated_at, matching Store.update_task", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T" }, "t-1", NOW);
    updateTaskStatus(db, "t-1", "doing", LATER);
    const task = getTaskById(db, "t-1");
    assert.equal(task?.status, "doing");
    assert.equal(task?.updated_at, LATER);
    assert.equal(task?.completed_at, null);
  } finally {
    db.close();
    cleanup();
  }
});

test("completeTask sets status='done', completed_at, and updated_at to the injected now", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T" }, "t-1", NOW);
    completeTask(db, "t-1", LATER);
    const task = getTaskById(db, "t-1");
    assert.equal(task?.status, "done");
    assert.equal(task?.completed_at, LATER);
    assert.equal(task?.updated_at, LATER);
  } finally {
    db.close();
    cleanup();
  }
});

test("deleteTaskById removes the row and returns true; a second delete returns false", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T" }, "t-1", NOW);
    assert.equal(deleteTaskById(db, "t-1"), true);
    assert.equal(getTaskById(db, "t-1"), null);
    assert.equal(deleteTaskById(db, "t-1"), false);
  } finally {
    db.close();
    cleanup();
  }
});

// --- resolveTaskByIdOrPrefix: the ONE shared resolver, tested directly (no
// Python oracle exists -- each CLI command inlines its own scan).

test("resolveTaskByIdOrPrefix finds by exact id", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T" }, "abc12345", NOW);
    assert.deepEqual(resolveTaskByIdOrPrefix(db, "abc12345"), {
      kind: "found",
      task: getTaskById(db, "abc12345"),
    });
  } finally {
    db.close();
    cleanup();
  }
});

test("resolveTaskByIdOrPrefix finds by a unique prefix", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T" }, "abc12345", NOW);
    createTask(db, { title: "U" }, "xyz98765", NOW);
    const result = resolveTaskByIdOrPrefix(db, "abc1");
    assert.equal(result.kind, "found");
    assert.equal(result.kind === "found" ? result.task.id : undefined, "abc12345");
  } finally {
    db.close();
    cleanup();
  }
});

test("resolveTaskByIdOrPrefix reports 'ambiguous' with every match, for the caller to render", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T" }, "abc11111", NOW);
    createTask(db, { title: "U" }, "abc22222", NOW);
    const result = resolveTaskByIdOrPrefix(db, "abc");
    assert.equal(result.kind, "ambiguous");
    assert.deepEqual(result.kind === "ambiguous" ? result.matches.map((t) => t.id).sort() : [], [
      "abc11111",
      "abc22222",
    ]);
  } finally {
    db.close();
    cleanup();
  }
});

test("resolveTaskByIdOrPrefix reports 'not_found' when nothing matches", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T" }, "abc12345", NOW);
    assert.deepEqual(resolveTaskByIdOrPrefix(db, "zzz"), { kind: "not_found" });
  } finally {
    db.close();
    cleanup();
  }
});

// This is exactly the asymmetry the plan calls out: BOTH commands call the
// SAME resolver and get the SAME "ambiguous" fact; it is the front-door
// command handlers (slice 3) that must render it differently -- status-change
// prints "Ambiguous ID ... Matches: ...", delete folds it into "not found".
test("the shared resolver reports the same 'ambiguous' fact regardless of which command will call it", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T" }, "abc11111", NOW);
    createTask(db, { title: "U" }, "abc22222", NOW);
    const forStatusChange = resolveTaskByIdOrPrefix(db, "abc");
    const forDelete = resolveTaskByIdOrPrefix(db, "abc");
    assert.deepEqual(forStatusChange, forDelete);
    assert.equal(forStatusChange.kind, "ambiguous");
  } finally {
    db.close();
    cleanup();
  }
});
