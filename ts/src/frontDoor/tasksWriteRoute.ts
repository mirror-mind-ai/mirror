// Front-door `tasks add|done|doing|block|delete` write handlers (CV22.DS7.US2
// slice 3a). The testable core of routing these subcommands to the TS core:
// each function takes an already-open `WritableDatabase` plus injected
// id/now (the DS4 determinism-injection idiom) and returns a result the
// `render/tasks.ts` module turns into Python-identical stdout.
//
// `tasks import`/`sync`/`sync-config` (which also depend on the journey
// sync-file/project-path metadata subsystem) and `week plan`/`save` (LLM-gated,
// reassigned to US5) are NOT here -- see the plan's slice breakdown.

import type { WritableDatabase } from "../db/database.ts";
import {
  completeTask,
  createTask,
  deleteTaskById,
  resolveTaskByIdOrPrefix,
  type Task,
  updateTaskStatus,
} from "../tasks/taskStore.ts";

/** Fields accepted by `tasks add`, mirroring the Python CLI's flags. */
export interface AddTaskParams {
  title: string;
  journey?: string | null;
  due?: string | null;
  stage?: string | null;
}

/** `tasks add`: create the task and return it for rendering. */
export function applyTasksAdd(
  db: WritableDatabase,
  params: AddTaskParams,
  id: string,
  nowIso: string,
): Task {
  return createTask(
    db,
    { title: params.title, journey: params.journey, dueDate: params.due, stage: params.stage },
    id,
    nowIso,
  );
}

/** The Python-visible status a `done|doing|block` command applies. */
export type TaskStatusTarget = "doing" | "blocked" | "done";

export type StatusChangeOutcome =
  | { kind: "changed"; task: Task; newStatus: TaskStatusTarget }
  | { kind: "ambiguous"; idOrPrefix: string; matches: Task[] }
  | { kind: "not_found"; idOrPrefix: string };

/**
 * `tasks done|doing|block`: resolve the id/prefix via the ONE shared resolver,
 * apply the status change, and report the outcome. `done` completes the task
 * (status + completed_at); `doing`/`blocked` only change status -- matching
 * Python's `if new_status == "done": complete_task(...) else: update_task(...)`.
 */
export function applyTasksStatusChange(
  db: WritableDatabase,
  idOrPrefix: string,
  newStatus: TaskStatusTarget,
  nowIso: string,
): StatusChangeOutcome {
  const resolved = resolveTaskByIdOrPrefix(db, idOrPrefix);
  if (resolved.kind === "not_found") return { kind: "not_found", idOrPrefix };
  if (resolved.kind === "ambiguous") {
    return { kind: "ambiguous", idOrPrefix, matches: resolved.matches };
  }

  if (newStatus === "done") {
    completeTask(db, resolved.task.id, nowIso);
  } else {
    updateTaskStatus(db, resolved.task.id, newStatus, nowIso);
  }

  const task: Task = {
    ...resolved.task,
    status: newStatus,
    updated_at: nowIso,
    completed_at: newStatus === "done" ? nowIso : resolved.task.completed_at,
  };
  return { kind: "changed", task, newStatus };
}

export type DeleteOutcome =
  | { kind: "deleted"; task: Task }
  | { kind: "not_found"; idOrPrefix: string };

/**
 * `tasks delete`: resolve via the SAME shared resolver as status-change, but
 * fold "ambiguous" into "not_found" -- Python's `cmd_delete` only branches on
 * `len(matches) == 1`, treating both zero AND multiple matches as "not found".
 * This is the deliberate asymmetry the plan calls out; it is expressed here,
 * in presentation, not inside the shared resolver.
 */
export function applyTasksDelete(db: WritableDatabase, idOrPrefix: string): DeleteOutcome {
  const resolved = resolveTaskByIdOrPrefix(db, idOrPrefix);
  if (resolved.kind !== "found") return { kind: "not_found", idOrPrefix };
  deleteTaskById(db, resolved.task.id);
  return { kind: "deleted", task: resolved.task };
}
