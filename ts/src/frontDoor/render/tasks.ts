// `tasks` command rendering — the port of `memory.cli.tasks_cmd`'s print
// statements. Every function here is a pure string builder over already-decided
// data (the write route in `tasksWriteRoute.ts` decides WHAT happened; this
// module decides HOW it is printed), matching Python's exact output including
// its blank-line quirks (`print(f"...\n")` followed by `print()`'s own newline).

import type { Task } from "../../tasks/taskStore.ts";
import type { DeleteOutcome, StatusChangeOutcome } from "../tasksWriteRoute.ts";

const STATUS_ICONS: Record<string, string> = {
  todo: "○",
  doing: "◐",
  done: "●",
  blocked: "✖",
};

/** Options mirroring the CLI flags that decide `tasks list`'s label/open-count. */
export interface ListTasksRenderOptions {
  all: boolean;
  status: string | null;
}

/**
 * Render `tasks list` (and the bare `tasks` default). `by_journey` grouping
 * preserves Python's dict-insertion-order semantics via a `Map`, keyed by
 * `journey || "(no journey)"`.
 */
export function renderTasksList(tasks: readonly Task[], options: ListTasksRenderOptions): string {
  if (tasks.length === 0) return "No tasks found.\n";

  const byJourney = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.journey || "(no journey)";
    const bucket = byJourney.get(key);
    if (bucket) bucket.push(t);
    else byJourney.set(key, [t]);
  }

  const label = options.all ? "all" : (options.status ?? "open");
  const totalOpen = tasks.filter(
    (t) => t.status === "todo" || t.status === "doing" || t.status === "blocked",
  ).length;
  // Suppressed purely by `status`, independent of `all` -- matches Python's
  // own independent `if not args.status` check (not nested under the
  // all/status/else label branch).
  const openNote = options.status ? "" : ` (${totalOpen} open)`;

  // The header line's trailing "" reproduces `print(f"...\n")` (a literal \n
  // inside the f-string) immediately followed by `print()`'s own newline.
  const lines: string[] = [`📋 Tasks ${label}: ${tasks.length}${openNote}`, ""];
  for (const [journey, journeyTasks] of byJourney) {
    lines.push(`🧭 ${journey}`);
    for (const t of journeyTasks) {
      const icon = STATUS_ICONS[t.status] ?? "?";
      const due = t.due_date ? ` 📅 ${t.due_date}` : "";
      const stage = t.stage ? ` [${t.stage}]` : "";
      lines.push(`  ${icon} \`${t.id}\` ${t.title}${due}${stage}`);
    }
    lines.push(""); // the trailing bare `print()` after each journey's tasks
  }
  return lines.map((line) => `${line}\n`).join("");
}

/** Render `tasks add`. */
export function renderTasksAdd(task: Task): string {
  const lines = [`✅ Task created: \`${task.id}\` - ${task.title}`];
  if (task.journey) lines.push(`   Journey: ${task.journey}`);
  if (task.due_date) lines.push(`   Due: ${task.due_date}`);
  return lines.map((line) => `${line}\n`).join("");
}

/**
 * Render a `tasks done|doing|block` outcome. This is where the resolver's
 * "ambiguous" fact becomes Python's `cmd_status_change` message -- the
 * shared resolver stays silent on presentation (taskStore.ts's module doc).
 */
export function renderTasksStatusChange(outcome: StatusChangeOutcome): string {
  if (outcome.kind === "not_found") {
    return `❌ Task '${outcome.idOrPrefix}' not found.\n`;
  }
  if (outcome.kind === "ambiguous") {
    const ids = outcome.matches.map((t) => t.id).join(", ");
    return `❌ Ambiguous ID '${outcome.idOrPrefix}'. Matches: ${ids}\n`;
  }
  const icon = STATUS_ICONS[outcome.newStatus] ?? "?";
  return `${icon} Task \`${outcome.task.id}\` → ${outcome.newStatus}: ${outcome.task.title}\n`;
}

/**
 * Render a `tasks delete` outcome. This is the ONE place the asymmetry with
 * status-change shows: an "ambiguous" resolver result is folded into the same
 * "not found" message Python's `cmd_delete` prints for zero matches.
 */
export function renderTasksDelete(outcome: DeleteOutcome): string {
  if (outcome.kind === "not_found") {
    return `❌ Task '${outcome.idOrPrefix}' not found.\n`;
  }
  return `🗑 Task removed: \`${outcome.task.id}\` - ${outcome.task.title}\n`;
}
