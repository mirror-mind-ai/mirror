// Front-door `tasks import|sync|sync-config` write handlers (CV22.DS7.US2
// slice 3c). The testable core of routing these subcommands to the TS core,
// mirroring `memory.cli.tasks_cmd`'s `cmd_import`/`cmd_sync`/`cmd_sync_config`.

import { existsSync } from "node:fs";
import type { Database, WritableDatabase } from "../db/database.ts";
import { listIdentityByLayer } from "../identity/identityRead.ts";
import { getSyncFile, JOURNEY_LAYER, setSyncFile } from "../journey/journeySyncFile.ts";
import {
  importTasksFromJourneyPath,
  type SyncResult,
  syncTasksFromFile,
} from "../tasks/taskImportSync.ts";
import type { Task } from "../tasks/taskStore.ts";
import { normalizeProjectPath } from "../util/paths.ts";

/** Journeys to operate on for `tasks import [journey]`: the explicit one, or every known journey (key order). */
export function resolveImportJourneys(db: Database, explicitJourney: string | null): string[] {
  if (explicitJourney) return [explicitJourney];
  return listIdentityByLayer(db, JOURNEY_LAYER).map((row) => row.key);
}

/** One journey's import result, included in rendering only when it created at least one task. */
export interface ImportJourneyResult {
  journey: string;
  created: Task[];
}

/**
 * `tasks import [journey]`: import pending tasks for each resolved journey.
 * Matches Python's `if created:` filter -- a journey with zero imports never
 * appears in the render, but still contributes to nothing (not an error).
 */
export function applyTasksImport(
  db: WritableDatabase,
  explicitJourney: string | null,
): ImportJourneyResult[] {
  const journeys = resolveImportJourneys(db, explicitJourney);
  const results: ImportJourneyResult[] = [];
  for (const journey of journeys) {
    const created = importTasksFromJourneyPath(db, journey);
    if (created.length > 0) {
      results.push({ journey, created });
    }
  }
  return results;
}

/** Journeys to operate on for `tasks sync [journey]`: the explicit one (regardless of sync-file config), or every journey WITH a sync file configured. */
export function resolveSyncJourneys(db: Database, explicitJourney: string | null): string[] {
  if (explicitJourney) return [explicitJourney];
  return listIdentityByLayer(db, JOURNEY_LAYER)
    .map((row) => row.key)
    .filter((key) => getSyncFile(db, key) !== null);
}

export type SyncJourneyOutcome =
  | { kind: "no_sync_file"; journey: string }
  | { kind: "synced"; journey: string; syncFile: string; result: SyncResult }
  | { kind: "error"; journey: string; message: string };

/**
 * `tasks sync`'s per-journey step: re-checks the sync file (an explicit
 * journey may have none configured -- Python's own per-iteration check, not a
 * whole-command precondition), then syncs, catching ANY error the same way
 * Python's two `except` clauses collapse to the identical print.
 */
export function applyTasksSyncForJourney(
  db: WritableDatabase,
  journey: string,
): SyncJourneyOutcome {
  const syncFile = getSyncFile(db, journey);
  if (!syncFile) return { kind: "no_sync_file", journey };
  try {
    const result = syncTasksFromFile(db, journey);
    return { kind: "synced", journey, syncFile, result };
  } catch (error) {
    return {
      kind: "error",
      journey,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface SyncConfigOutcome {
  journey: string;
  resolvedPath: string;
  fileExisted: boolean;
}

/**
 * `tasks sync-config <journey> <file>`: normalize the path (the same
 * expanduser+resolve `normalizeProjectPath` already ports for `journey
 * set-path`), record whether it currently exists (a warning, not a failure),
 * and configure it. Throws `JourneyNotFoundError` for an unknown journey --
 * Python's `cmd_sync_config` does not catch this either (see
 * `journeySyncFile.ts`'s module doc).
 */
export function applyTasksSyncConfig(
  db: WritableDatabase,
  journey: string,
  rawFilePath: string,
  nowIso: string,
): SyncConfigOutcome {
  const resolvedPath = normalizeProjectPath(rawFilePath);
  const fileExisted = existsSync(resolvedPath);
  setSyncFile(db, journey, resolvedPath, nowIso);
  return { journey, resolvedPath, fileExisted };
}
