import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../../src/tasks/taskStore.ts";
import {
  addIsoDays,
  computeWeekRange,
  filterVisibleTasks,
  formatIsoDate,
  groupTasksByDay,
  toIsoDate,
} from "../../src/tasks/weekView.ts";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    journey: null,
    title: "Task",
    status: "todo",
    due_date: null,
    scheduled_at: null,
    time_hint: null,
    stage: null,
    context: null,
    source: "manual",
    created_at: "2026-01-01T00:00:00.000000Z",
    updated_at: "2026-01-01T00:00:00.000000Z",
    completed_at: null,
    metadata: null,
    ...overrides,
  };
}

test("formatIsoDate zero-pads year/month/day", () => {
  assert.equal(formatIsoDate(2026, 3, 4), "2026-03-04");
  assert.equal(formatIsoDate(2026, 12, 31), "2026-12-31");
});

test("addIsoDays adds and subtracts across month/year boundaries", () => {
  assert.equal(addIsoDays("2026-03-04", 4), "2026-03-08");
  assert.equal(addIsoDays("2026-03-04", -2), "2026-03-02");
  assert.equal(addIsoDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addIsoDays("2026-02-28", 1), "2026-03-01");
});

test("toIsoDate reads the LOCAL calendar date, ignoring time-of-day", () => {
  assert.equal(toIsoDate(new Date(2026, 2, 4, 23, 59)), "2026-03-04");
  assert.equal(toIsoDate(new Date(2026, 2, 4, 0, 0)), "2026-03-04");
});

test("computeWeekRange returns Monday..Sunday for a mid-week Wednesday", () => {
  // 2026-03-04 is a Wednesday.
  assert.deepEqual(computeWeekRange(new Date(2026, 2, 4, 10, 30)), {
    start: "2026-03-02",
    end: "2026-03-08",
  });
});

test("computeWeekRange handles a Monday (start of week) and a Sunday (end of week)", () => {
  assert.deepEqual(computeWeekRange(new Date(2026, 2, 2, 0, 0)), {
    start: "2026-03-02",
    end: "2026-03-08",
  });
  assert.deepEqual(computeWeekRange(new Date(2026, 2, 8, 23, 59)), {
    start: "2026-03-02",
    end: "2026-03-08",
  });
});

test("computeWeekRange handles a week crossing a month boundary", () => {
  // 2026-03-01 is a Sunday -> that week is 2026-02-23..2026-03-01.
  assert.deepEqual(computeWeekRange(new Date(2026, 2, 1, 12, 0)), {
    start: "2026-02-23",
    end: "2026-03-01",
  });
});

test("filterVisibleTasks drops a scheduled, non-done task in the past", () => {
  const now = new Date(2026, 2, 4, 10, 30);
  const tasks = [task({ id: "past", scheduled_at: "2026-03-04T09:00", status: "todo" })];
  assert.deepEqual(filterVisibleTasks(tasks, now), []);
});

test("filterVisibleTasks keeps a scheduled task in the future", () => {
  const now = new Date(2026, 2, 4, 10, 30);
  const t = task({ id: "future", scheduled_at: "2026-03-04T14:00", status: "todo" });
  assert.deepEqual(filterVisibleTasks([t], now), [t]);
});

test("filterVisibleTasks keeps a scheduled-in-the-past task that is already done", () => {
  const now = new Date(2026, 2, 4, 10, 30);
  const t = task({ id: "done-past", scheduled_at: "2026-03-04T09:00", status: "done" });
  assert.deepEqual(filterVisibleTasks([t], now), [t]);
});

test("filterVisibleTasks keeps a task with no scheduled_at regardless of status", () => {
  const now = new Date(2026, 2, 4, 10, 30);
  const t = task({ id: "no-sched", due_date: "2026-03-04" });
  assert.deepEqual(filterVisibleTasks([t], now), [t]);
});

test("filterVisibleTasks keeps a task whose scheduled_at is unparseable (Python's except ValueError: pass)", () => {
  const now = new Date(2026, 2, 4, 10, 30);
  const t = task({ id: "bad-date", scheduled_at: "not-a-date", status: "todo" });
  assert.deepEqual(filterVisibleTasks([t], now), [t]);
});

test("groupTasksByDay groups by due_date, falling back to scheduled_at's date portion", () => {
  const a = task({ id: "a", due_date: "2026-03-04" });
  const b = task({ id: "b", due_date: null, scheduled_at: "2026-03-05T09:00" });
  const byDay = groupTasksByDay([a, b]);
  assert.deepEqual(
    byDay.get("2026-03-04")?.map((t) => t.id),
    ["a"],
  );
  assert.deepEqual(
    byDay.get("2026-03-05")?.map((t) => t.id),
    ["b"],
  );
});

test("groupTasksByDay drops a task with neither due_date nor scheduled_at", () => {
  const byDay = groupTasksByDay([task({ id: "no-day" })]);
  assert.equal(byDay.size, 0);
});

test("groupTasksByDay sorts each day by (scheduled_at, time_hint, title)", () => {
  const scheduled = task({ id: "s", due_date: "2026-03-04", scheduled_at: "2026-03-04T14:00" });
  const timeHint = task({ id: "h", due_date: "2026-03-04", time_hint: "afternoon" });
  const bareB = task({ id: "bb", due_date: "2026-03-04", title: "Beta" });
  const bareA = task({ id: "ba", due_date: "2026-03-04", title: "Alpha" });
  const byDay = groupTasksByDay([bareB, timeHint, bareA, scheduled]);
  assert.deepEqual(
    byDay.get("2026-03-04")?.map((t) => t.id),
    ["s", "h", "ba", "bb"],
  );
});
