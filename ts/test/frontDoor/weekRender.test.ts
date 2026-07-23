import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import { renderWeekView } from "../../src/frontDoor/render/week.ts";
import { createTask, getTasksForWeek, type Task } from "../../src/tasks/taskStore.ts";
import { computeWeekRange } from "../../src/tasks/weekView.ts";
import { createTasksTable } from "../helpers/tasksSchema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "week-view.golden.json");

interface WeekViewScenario {
  name: string;
  frozen_now: string;
  seed_tasks: Task[];
  expected_stdout: string;
}

const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { scenarios: WeekViewScenario[] };

// Wednesday, 2026-03-04 10:30 local -- matches the Python generator's
// FROZEN_NOW = datetime(2026, 3, 4, 10, 30, 0) (a naive/local instant; see
// weekView.ts's module doc for why the local Date constructor form is the
// correct match for a naive Python datetime).
const FROZEN_NOW = new Date(2026, 2, 4, 10, 30, 0);

function tempCopy(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-weekview-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  return {
    dbPath: join(tmp, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

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

test("week-view golden is well-formed", () => {
  assert.ok(golden.scenarios.length > 0, "corpus has scenarios");
});

for (const scenario of golden.scenarios) {
  test(`renderWeekView reproduces the Python oracle stdout: ${scenario.name}`, () => {
    const { dbPath, cleanup } = tempCopy();
    const db = openDatabaseCopyForWrite(dbPath);
    try {
      createTasksTable(db);
      seedTasksRaw(db, scenario.seed_tasks);
      const range = computeWeekRange(FROZEN_NOW);
      const tasks = getTasksForWeek(db, range.start, range.end);
      assert.equal(renderWeekView(tasks, FROZEN_NOW), scenario.expected_stdout);
    } finally {
      db.close();
      cleanup();
    }
  });
}

// Hand-written sanity checks alongside the golden, for readability and to
// pin the exact column widths independent of the full fixture.

test("renderWeekView pads the title to 40 chars and right-aligns a 20-char time column", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    // scheduled_at must be AFTER FROZEN_NOW (10:30) or filterVisibleTasks
    // correctly drops it as a past, non-done scheduled item.
    createTask(
      db,
      { title: "Short", dueDate: "2026-03-04", scheduledAt: "2026-03-04T14:05" },
      "t-1",
      "2026-01-01T00:00:00.000000Z",
    );
    const tasks = getTasksForWeek(db, "2026-03-02", "2026-03-08");
    const out = renderWeekView(tasks, FROZEN_NOW);
    // "  📌 " (icon+space) + "Short" padded to 40 + "14:05" right-padded to 20.
    assert.match(out, /📌 Short {35} {15}14:05\n/);
  } finally {
    db.close();
    cleanup();
  }
});

test("renderWeekView marks the CURRENT day with '(today)' and no other day", () => {
  const { dbPath, cleanup } = tempCopy();
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createTasksTable(db);
    createTask(db, { title: "T", dueDate: "2026-03-04" }, "t-1", "2026-01-01T00:00:00.000000Z");
    createTask(db, { title: "U", dueDate: "2026-03-06" }, "t-2", "2026-01-01T00:00:00.000000Z");
    const tasks = getTasksForWeek(db, "2026-03-02", "2026-03-08");
    const out = renderWeekView(tasks, FROZEN_NOW);
    assert.match(out, /━━ Wednesday 04\/03 \(today\) ━━/);
    assert.match(out, /━━ Friday 06\/03 ━━/);
    assert.doesNotMatch(out, /Friday 06\/03 \(today\)/);
  } finally {
    db.close();
    cleanup();
  }
});
