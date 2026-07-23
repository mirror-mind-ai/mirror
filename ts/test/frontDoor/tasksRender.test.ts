import assert from "node:assert/strict";
import { test } from "node:test";
import {
  renderTasksAdd,
  renderTasksDelete,
  renderTasksList,
  renderTasksStatusChange,
} from "../../src/frontDoor/render/tasks.ts";
import type { Task } from "../../src/tasks/taskStore.ts";

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

test("renderTasksList prints 'No tasks found.' for an empty list", () => {
  assert.equal(renderTasksList([], { all: false, status: null }), "No tasks found.\n");
});

test("renderTasksList groups by journey (insertion order), shows icon/due/stage, open count, and blank-line spacing", () => {
  const tasks = [
    task({ id: "a1", journey: "cv22", title: "Alpha", due_date: "2026-02-01", stage: "S1" }),
    task({ id: "a2", journey: "cv22", title: "Beta", status: "doing" }),
    task({ id: "b1", journey: "other", title: "Gamma", status: "blocked" }),
  ];
  const out = renderTasksList(tasks, { all: false, status: null });
  assert.equal(
    out,
    "📋 Tasks open: 3 (3 open)\n" +
      "\n" +
      "🧭 cv22\n" +
      "  ○ `a1` Alpha 📅 2026-02-01 [S1]\n" +
      "  ◐ `a2` Beta\n" +
      "\n" +
      "🧭 other\n" +
      "  ✖ `b1` Gamma\n" +
      "\n",
  );
});

test("renderTasksList groups tasks with no journey under '(no journey)'", () => {
  const out = renderTasksList([task({ id: "n1", journey: null, title: "No J" })], {
    all: false,
    status: null,
  });
  assert.match(out, /🧭 \(no journey\)/);
});

test("renderTasksList suppresses the open-count note when --status is given, independent of --all", () => {
  const tasks = [task({ id: "a1", status: "done" })];
  const withStatus = renderTasksList(tasks, { all: false, status: "done" });
  assert.match(withStatus, /📋 Tasks done: 1\n/);
  assert.doesNotMatch(withStatus, /open\)/);

  // The Python source's open_note check is independent of `all` -- exercise
  // the (unusual but real) combination directly.
  const bothAllAndStatus = renderTasksList(tasks, { all: true, status: "done" });
  assert.match(bothAllAndStatus, /📋 Tasks all: 1\n/);
  assert.doesNotMatch(bothAllAndStatus, /open\)/);
});

test("renderTasksList labels 'all' for --all with no --status", () => {
  const out = renderTasksList([task()], { all: true, status: null });
  assert.match(out, /📋 Tasks all: 1 \(1 open\)\n/);
});

test("renderTasksAdd prints the created line, plus journey/due lines only when present", () => {
  assert.equal(renderTasksAdd(task({ id: "t-9", title: "New" })), "✅ Task created: `t-9` - New\n");
  assert.equal(
    renderTasksAdd(task({ id: "t-9", title: "New", journey: "cv22", due_date: "2026-03-01" })),
    "✅ Task created: `t-9` - New\n   Journey: cv22\n   Due: 2026-03-01\n",
  );
});

test("renderTasksStatusChange renders the icon/arrow line for a successful change", () => {
  const out = renderTasksStatusChange({
    kind: "changed",
    task: task({ id: "t-1", title: "T" }),
    newStatus: "doing",
  });
  assert.equal(out, "◐ Task `t-1` → doing: T\n");
});

test("renderTasksStatusChange renders 'Ambiguous ID ... Matches: ...' for the ambiguous case", () => {
  const out = renderTasksStatusChange({
    kind: "ambiguous",
    idOrPrefix: "abc",
    matches: [task({ id: "abc111" }), task({ id: "abc222" })],
  });
  assert.equal(out, "❌ Ambiguous ID 'abc'. Matches: abc111, abc222\n");
});

test("renderTasksStatusChange renders 'not found' for the not_found case", () => {
  assert.equal(
    renderTasksStatusChange({ kind: "not_found", idOrPrefix: "zzz" }),
    "❌ Task 'zzz' not found.\n",
  );
});

test("renderTasksDelete renders the removed line", () => {
  assert.equal(
    renderTasksDelete({ kind: "deleted", task: task({ id: "t-1", title: "T" }) }),
    "🗑 Task removed: `t-1` - T\n",
  );
});

test("renderTasksDelete folds BOTH not_found and (via the write route) ambiguous into the same 'not found' message", () => {
  assert.equal(
    renderTasksDelete({ kind: "not_found", idOrPrefix: "abc" }),
    "❌ Task 'abc' not found.\n",
  );
});
