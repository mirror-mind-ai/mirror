// Task read/write model parity port (CV22.DS7.US2).
//
// A faithful TypeScript port of `TaskStore` (`src/memory/storage/tasks.py`) and
// `TaskService.list_tasks` (`src/memory/services/tasks.py`). Following the
// database-seam philosophy established in DS2/DS4, ordering and filtering are
// pushed down to SQLite exactly as Python's SQL does (including `NULLS LAST`,
// supported by the bundled `node:sqlite` engine) — these functions are query
// builders + row mappers, not a re-implementation of SQLite's sort.
//
// `resolveTaskByIdOrPrefix` is the ONE shared prefix resolver behind
// `done`/`doing`/`block`/`delete` (the `kebab_slug` writer/locator lesson: two
// commands must not grow two copies of the same scan). Python itself has no
// such shared function — each CLI command inlines its own scan and prints its
// own message, and the two commands disagree on the ambiguous case
// (`status_change` reports "Ambiguous ID"; `delete` folds it into "not found").
// This resolver reproduces that fact honestly: it returns what happened
// (found/ambiguous/not_found), and each front-door command decides how to
// render the ambiguous case — so the asymmetry lives in presentation, where
// Python's own asymmetry actually lives, not baked into the resolver's logic.

import type { Database, SqlValue, WritableDatabase } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

/** A task row, mirroring the Python `Task` model exactly. */
export interface Task {
  id: string;
  journey: string | null;
  title: string;
  status: string; // 'todo' | 'doing' | 'done' | 'blocked'
  due_date: string | null;
  scheduled_at: string | null;
  time_hint: string | null;
  stage: string | null;
  context: string | null;
  source: string; // 'manual' | 'journey_path' | 'conversation' | 'week_plan' | 'sync'
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  metadata: string | null;
}

const TASK_COLUMNS =
  "id, journey, title, status, due_date, scheduled_at, time_hint, stage, context, " +
  "source, created_at, updated_at, completed_at, metadata";

function toTask(row: Record<string, unknown>): Task {
  return {
    id: requireString(row, "id"),
    journey: optionalString(row, "journey"),
    title: requireString(row, "title"),
    status: requireString(row, "status"),
    due_date: optionalString(row, "due_date"),
    scheduled_at: optionalString(row, "scheduled_at"),
    time_hint: optionalString(row, "time_hint"),
    stage: optionalString(row, "stage"),
    context: optionalString(row, "context"),
    source: requireString(row, "source"),
    created_at: requireString(row, "created_at"),
    updated_at: requireString(row, "updated_at"),
    completed_at: optionalString(row, "completed_at"),
    metadata: optionalString(row, "metadata"),
  };
}

// --- Reads -----------------------------------------------------------------

/** Port of `Store.get_task`. */
export function getTaskById(db: Database, id: string): Task | null {
  const row = db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`).get(id);
  return row === undefined ? null : toTask(row);
}

/** Port of `Store.get_all_tasks`: `ORDER BY status, due_date ASC NULLS LAST, created_at ASC`. */
export function getAllTasks(db: Database): Task[] {
  return db
    .prepare(
      `SELECT ${TASK_COLUMNS} FROM tasks ORDER BY status, due_date ASC NULLS LAST, created_at ASC`,
    )
    .all()
    .map(toTask);
}

/** Port of `Store.get_open_tasks`: status IN ('todo','doing','blocked'), optional journey filter. */
export function getOpenTasks(db: Database, journey: string | null = null): Task[] {
  const base = `SELECT ${TASK_COLUMNS} FROM tasks WHERE status IN ('todo', 'doing', 'blocked')`;
  const order = "ORDER BY due_date ASC NULLS LAST, created_at ASC";
  if (journey) {
    return db.prepare(`${base} AND journey = ? ${order}`).all(journey).map(toTask);
  }
  return db.prepare(`${base} ${order}`).all().map(toTask);
}

/** Port of `Store.get_tasks_by_status`. */
export function getTasksByStatus(db: Database, status: string): Task[] {
  return db
    .prepare(
      `SELECT ${TASK_COLUMNS} FROM tasks WHERE status = ? ORDER BY due_date ASC NULLS LAST, created_at ASC`,
    )
    .all(status)
    .map(toTask);
}

/** Port of `Store.get_tasks_by_journey`. */
export function getTasksByJourney(db: Database, journey: string): Task[] {
  return db
    .prepare(
      `SELECT ${TASK_COLUMNS} FROM tasks WHERE journey = ? ORDER BY due_date ASC NULLS LAST, created_at ASC`,
    )
    .all(journey)
    .map(toTask);
}

/** Port of `Store.find_tasks_by_title`: `LIKE %fragment%`, optional journey filter. */
export function findTasksByTitle(
  db: Database,
  titleFragment: string,
  journey: string | null = null,
): Task[] {
  const pattern = `%${titleFragment}%`;
  if (journey) {
    return db
      .prepare(
        `SELECT ${TASK_COLUMNS} FROM tasks WHERE title LIKE ? AND journey = ? ORDER BY created_at DESC`,
      )
      .all(pattern, journey)
      .map(toTask);
  }
  return db
    .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE title LIKE ? ORDER BY created_at DESC`)
    .all(pattern)
    .map(toTask);
}

/**
 * Build the parameterized week-range query, mirroring Python's builder exactly:
 * `due_date` in range OR `scheduled_at` in range (both bounds inclusive), the
 * `scheduled_at` upper bound extended to `T23:59` so a same-day scheduled item
 * is not excluded by a bare date string, ordered `due_date ASC NULLS LAST,
 * scheduled_at ASC NULLS LAST`. `NULLS LAST` is honored by the bundled SQLite
 * engine (>= 3.30), same as Python's.
 */
export function buildTasksForWeekQuery(
  startDate: string,
  endDate: string,
): { sql: string; params: SqlValue[] } {
  return {
    sql:
      `SELECT ${TASK_COLUMNS} FROM tasks ` +
      "WHERE (due_date >= ? AND due_date <= ?) OR (scheduled_at >= ? AND scheduled_at <= ?) " +
      "ORDER BY due_date ASC NULLS LAST, scheduled_at ASC NULLS LAST",
    params: [startDate, endDate, startDate, `${endDate}T23:59`],
  };
}

/** Port of `Store.get_tasks_for_week`. */
export function getTasksForWeek(db: Database, startDate: string, endDate: string): Task[] {
  const { sql, params } = buildTasksForWeekQuery(startDate, endDate);
  return db
    .prepare(sql)
    .all(...params)
    .map(toTask);
}

/** Filters for `listTasks`, mirroring `TaskService.list_tasks`'s parameters. */
export interface ListTasksFilters {
  journey?: string | null;
  status?: string | null;
  openOnly?: boolean;
}

/**
 * Port of `TaskService.list_tasks`: branch order is open_only -> status ->
 * journey -> all, matching Python exactly (an `openOnly` request ignores
 * `status`, and a `status` request applies `journey` as a post-filter over the
 * status read rather than its own query, exactly as Python does).
 */
export function listTasks(db: Database, filters: ListTasksFilters = {}): Task[] {
  const { journey = null, status = null, openOnly = false } = filters;
  if (openOnly) return getOpenTasks(db, journey);
  if (status) {
    const tasks = getTasksByStatus(db, status);
    return journey ? tasks.filter((t) => t.journey === journey) : tasks;
  }
  if (journey) return getTasksByJourney(db, journey);
  return getAllTasks(db);
}

// --- Prefix resolution -------------------------------------------------------

/** The outcome of resolving a task id or id-prefix, naming every real branch. */
export type ResolveTaskResult =
  | { kind: "found"; task: Task }
  | { kind: "ambiguous"; matches: Task[] }
  | { kind: "not_found" };

/**
 * Resolve a task by exact id, falling back to a unique-prefix scan over ALL
 * tasks (`Task.id.startswith(idOrPrefix)`), matching the inline logic
 * duplicated in Python's `cmd_status_change`/`cmd_delete`. Callers render the
 * `ambiguous` case differently on purpose (see module doc); this function only
 * reports the fact.
 */
export function resolveTaskByIdOrPrefix(db: Database, idOrPrefix: string): ResolveTaskResult {
  const exact = getTaskById(db, idOrPrefix);
  if (exact) return { kind: "found", task: exact };

  const matches = getAllTasks(db).filter((t) => t.id.startsWith(idOrPrefix));
  if (matches.length === 1) return { kind: "found", task: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", matches };
  return { kind: "not_found" };
}

// --- Writes ------------------------------------------------------------------

/** Fields accepted when creating a task, mirroring `TaskService.add_task`'s parameters. */
export interface CreateTaskInput {
  title: string;
  journey?: string | null;
  dueDate?: string | null;
  scheduledAt?: string | null;
  timeHint?: string | null;
  stage?: string | null;
  context?: string | null;
  source?: string;
}

/**
 * Port of `TaskService.add_task` + `Store.create_task`. `id` and `nowIso` are
 * injected by the caller (front door), the same determinism-injection idiom
 * DS4 established: `created_at`/`updated_at` both take the single injected
 * `nowIso`, matching a frozen-clock Python run where every `_now()` call
 * returns the same value. New tasks always start `status: "todo"`,
 * `completed_at: null` — Python's `Task` defaults, never overridden here.
 */
export function createTask(
  db: WritableDatabase,
  input: CreateTaskInput,
  id: string,
  nowIso: string,
): Task {
  const task: Task = {
    id,
    journey: input.journey ?? null,
    title: input.title,
    status: "todo",
    due_date: input.dueDate ?? null,
    scheduled_at: input.scheduledAt ?? null,
    time_hint: input.timeHint ?? null,
    stage: input.stage ?? null,
    context: input.context ?? null,
    source: input.source ?? "manual",
    created_at: nowIso,
    updated_at: nowIso,
    completed_at: null,
    metadata: null,
  };
  db.prepare(
    `INSERT INTO tasks (${TASK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    task.id,
    task.journey,
    task.title,
    task.status,
    task.due_date,
    task.scheduled_at,
    task.time_hint,
    task.stage,
    task.context,
    task.source,
    task.created_at,
    task.updated_at,
    task.completed_at,
    task.metadata,
  );
  return task;
}

/**
 * Port of `Store.update_task(task_id, status=...)`, the primitive behind
 * `doing`/`block`. Always bumps `updated_at` to the injected `nowIso`,
 * matching Python's `Store.update_task`, which sets `updated_at = _now()` on
 * every call regardless of which other fields are passed.
 */
export function updateTaskStatus(
  db: WritableDatabase,
  id: string,
  status: string,
  nowIso: string,
): void {
  db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso, id);
}

/**
 * Port of `TaskService.complete_task` + the `Store.update_task` it calls:
 * sets `status = 'done'`, `completed_at`, and `updated_at` to the single
 * injected `nowIso` (a frozen-clock run returns the same value for both of
 * Python's two independent `_now()` calls here).
 */
export function completeTask(db: WritableDatabase, id: string, nowIso: string): void {
  db.prepare("UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?").run(
    nowIso,
    nowIso,
    id,
  );
}

/** Port of `Store.delete_task`: returns whether a row was actually removed. */
export function deleteTaskById(db: WritableDatabase, id: string): boolean {
  const before = getTaskById(db, id);
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return before !== null;
}
