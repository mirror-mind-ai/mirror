// `tasks import` / `tasks sync` orchestration parity port (CV22.DS7.US2 slice
// 3c). A faithful port of `TaskService.import_tasks_from_journey_path` /
// `sync_tasks_from_file` (`src/memory/services/tasks.py`), which read a
// journey's path/reference file, parse it with the shared
// `journeyPathParse.ts` parser, and create/complete tasks accordingly.
//
// Both functions generate a fresh id/now PER created row (not one injected
// value for the whole call) -- matching `runSeed`'s established pattern for
// multi-row writes, since either function can create zero, one, or many
// tasks in a single invocation.

import { readFileSync } from "node:fs";
import type { WritableDatabase } from "../db/database.ts";
import { getJourneyPath, getSyncFile } from "../journey/journeySyncFile.ts";
import { expandHome } from "../util/paths.ts";
import { newId, nowIso } from "../util/pyGenerators.ts";
import { parseDoneTasks, parseJourneyPathTasks } from "./journeyPathParse.ts";
import {
  completeTask,
  createTask,
  findTasksByTitle,
  getTasksByJourney,
  type Task,
} from "./taskStore.ts";

/**
 * Port of `import_tasks_from_journey_path`: read the journey's path (external
 * sync file if configured, else the DB `journey_path` layer), parse pending
 * checkboxes, and create a task for each title not already present for this
 * journey. Dedup uses the SAME `LIKE %title%` fragment match `findTasksByTitle`
 * already ports -- a deliberate, pre-existing Python characteristic (a
 * substring match, not an exact one), not something to tighten here.
 */
export function importTasksFromJourneyPath(db: WritableDatabase, journey: string): Task[] {
  const journeyPath = getJourneyPath(db, journey);
  if (!journeyPath) return [];

  const parsed = parseJourneyPathTasks(journeyPath, journey);
  const created: Task[] = [];
  for (const item of parsed) {
    const existing = findTasksByTitle(db, item.title, journey);
    if (existing.length > 0) continue;
    const task = createTask(
      db,
      { title: item.title, journey, stage: item.stage, source: "journey_path" },
      newId(),
      nowIso(),
    );
    created.push(task);
  }
  return created;
}

/** Raised when a journey has no sync file configured (`sync_tasks_from_file`'s `ValueError`). */
export class NoSyncFileConfiguredError extends Error {
  readonly journey: string;
  constructor(journey: string) {
    super(
      `No sync file configured for '${journey}'. Use: mm:tasks sync-config ${journey} /path/to/file`,
    );
    this.journey = journey;
  }
}

/** Raised when the configured sync file does not exist on disk. */
export class SyncFileNotFoundError extends Error {
  readonly syncFile: string;
  constructor(syncFile: string) {
    super(`File not found: ${syncFile}`);
    this.syncFile = syncFile;
  }
}

export interface SyncResult {
  created: number;
  completed: number;
  unchanged: number;
}

/**
 * Port of `sync_tasks_from_file`: read the configured external file, parse
 * BOTH pending and done checkboxes, and reconcile against a SNAPSHOT of the
 * journey's existing tasks (by title) taken ONCE before either loop runs --
 * matching Python's single dict comprehension exactly. A task created by the
 * pending loop is deliberately invisible to the done loop in the SAME call
 * (this is Python's real behavior, not a bug to fix): if a title later marked
 * done wasn't already a known task before this sync ran, it is silently
 * skipped, never created from the done list alone.
 */
export function syncTasksFromFile(db: WritableDatabase, journey: string): SyncResult {
  const syncFile = getSyncFile(db, journey);
  if (!syncFile) {
    throw new NoSyncFileConfiguredError(journey);
  }

  const expandedPath = expandHome(syncFile);
  let content: string;
  try {
    content = readFileSync(expandedPath, "utf8");
  } catch {
    throw new SyncFileNotFoundError(syncFile);
  }

  const filePending = parseJourneyPathTasks(content, journey);
  const fileDone = parseDoneTasks(content, journey);

  // Last-title-wins, in get_tasks_by_journey's own order -- matches Python's
  // `{t.title: t for t in existing_tasks}` dict-comprehension semantics.
  const existingByTitle = new Map<string, Task>();
  for (const t of getTasksByJourney(db, journey)) {
    existingByTitle.set(t.title, t);
  }

  const result: SyncResult = { created: 0, completed: 0, unchanged: 0 };

  for (const item of filePending) {
    if (!existingByTitle.has(item.title)) {
      createTask(
        db,
        { title: item.title, journey, stage: item.stage, source: "sync" },
        newId(),
        nowIso(),
      );
      result.created += 1;
    } else {
      result.unchanged += 1;
    }
  }

  for (const item of fileDone) {
    const existing = existingByTitle.get(item.title);
    if (!existing) continue; // done items never create a task on their own.
    if (existing.status !== "done") {
      completeTask(db, existing.id, nowIso());
      result.completed += 1;
    } else {
      result.unchanged += 1;
    }
  }

  return result;
}
