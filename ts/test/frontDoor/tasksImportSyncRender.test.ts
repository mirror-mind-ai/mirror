import assert from "node:assert/strict";
import { test } from "node:test";
import {
  renderTasksImport,
  renderTasksSyncConfig,
  renderTasksSyncNoJourneysConfigured,
  renderTasksSyncOutcome,
} from "../../src/frontDoor/render/tasksImportSync.ts";
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

test("renderTasksImport prints 'No new tasks found' when nothing was created", () => {
  assert.equal(renderTasksImport([]), "No new tasks found in journey paths.\n");
});

test("renderTasksImport prints per-journey groups, each created task, and the total (leading blank line)", () => {
  const out = renderTasksImport([
    {
      journey: "alpha",
      created: [task({ id: "a1", title: "Task A" }), task({ id: "a2", title: "Task B" })],
    },
    { journey: "beta", created: [task({ id: "b1", title: "Task C" })] },
  ]);
  assert.equal(
    out,
    "🧭 alpha: 2 tasks imported\n" +
      "  ○ `a1` Task A\n" +
      "  ○ `a2` Task B\n" +
      "🧭 beta: 1 tasks imported\n" +
      "  ○ `b1` Task C\n" +
      "\n" +
      "📋 Total: 3 tasks imported\n",
  );
});

test("renderTasksSyncNoJourneysConfigured", () => {
  assert.equal(renderTasksSyncNoJourneysConfigured(), "No journey has sync configured.\n");
});

test("renderTasksSyncOutcome: no_sync_file", () => {
  assert.equal(
    renderTasksSyncOutcome({ kind: "no_sync_file", journey: "cv22" }),
    "⚠️  cv22: no sync file configured\n",
  );
});

test("renderTasksSyncOutcome: error", () => {
  assert.equal(
    renderTasksSyncOutcome({ kind: "error", journey: "cv22", message: "File not found: /x" }),
    "❌ cv22: File not found: /x\n",
  );
});

test("renderTasksSyncOutcome: synced prints the sync-file line and the +/✓/= counts line", () => {
  const out = renderTasksSyncOutcome({
    kind: "synced",
    journey: "cv22",
    syncFile: "/path/to/ref.md",
    result: { created: 2, completed: 1, unchanged: 3 },
  });
  assert.equal(out, "🔄 cv22 (← /path/to/ref.md)\n   +2 new | ✓1 completed | =3 unchanged\n");
});

test("renderTasksSyncConfig: file exists -> only the configured line", () => {
  assert.equal(
    renderTasksSyncConfig({ journey: "cv22", resolvedPath: "/x/ref.md", fileExisted: true }),
    "🔗 cv22 → /x/ref.md\n",
  );
});

test("renderTasksSyncConfig: file missing -> warning lines before the configured line", () => {
  assert.equal(
    renderTasksSyncConfig({ journey: "cv22", resolvedPath: "/x/ref.md", fileExisted: false }),
    "⚠️  File not found: /x/ref.md\n" +
      "   Configuring it anyway; the file can be created later.\n" +
      "🔗 cv22 → /x/ref.md\n",
  );
});
