// CV22.DS7.US8 plateau 2 — the read-only Workbench snapshot.
//
// Port of `get_workbench_snapshot` from `src/memory/builder/workbench.py`, and
// NOTHING else from that module. The twenty Workbench verbs are retired in DS10
// (D1); this read is not, because every `build load` on a project without
// `docs/project/refinement/index.md` renders its `🧰 Refinement field` from these
// three tables. Porting the read without the verbs is the whole point.
//
// `storage_state` is the constant `"implemented"`: reaching this function at all
// means the tables exist, and the other two values a `RefinementFieldSnapshot`
// can carry (`"project files"`, `"not implemented yet"`) are decided by the
// callers in `refinementField.ts`.
//
// The missing-tables case is a real shape, not a hypothetical. A database
// predating CV20.DS6 has no `builder_refinement_stories`, and SQLite raises on
// the query. `home_surface._safe_workbench_snapshot` catches that and degrades;
// `read_builder_resume_state` does NOT, so the Home path survives such a database
// and the Resume path raises. Both halves are reproduced — the asymmetry is
// Python's and is recorded as debt rather than quietly fixed here.

import type { Database } from "#db/database.ts";

/** Python `RefinementStoryRecord`, reduced to the fields the snapshot exposes. */
export interface RefinementStoryRow {
  readonly id: string;
  readonly displayCode: string;
  readonly title: string;
  readonly status: string;
}

/** Python `ChangeRequestRecord`, likewise reduced. */
export interface ChangeRequestRow {
  readonly id: string;
  readonly displayCode: string;
  readonly title: string;
  readonly status: string;
  readonly refinementStoryId: string | null;
}

/** Python `WorkbenchSnapshot`. */
export interface WorkbenchSnapshot {
  readonly storageState: string;
  readonly activeRefinementStory: RefinementStoryRow | null;
  readonly activeChangeRequest: ChangeRequestRow | null;
  readonly lastRefinementEvent: string | null;
  readonly refinementStoryCount: number;
  readonly changeRequestCount: number;
  readonly unassignedChangeRequestCount: number;
}

/**
 * Raised when the Workbench tables are absent, mirroring the
 * `sqlite3.OperationalError` Python surfaces. A distinct class so callers can
 * reproduce Python's split: Home catches it, Resume does not.
 */
export class WorkbenchTablesMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbenchTablesMissingError";
  }
}

function normalizeJourney(journey: string): string {
  const normalized = typeof journey === "string" ? journey.trim() : "";
  if (!normalized) throw new Error("journey must not be empty");
  return normalized;
}

function storyFromRow(row: Record<string, unknown>): RefinementStoryRow {
  return {
    id: String(row.id),
    displayCode: String(row.display_code),
    title: String(row.title),
    status: String(row.status),
  };
}

function changeRequestFromRow(row: Record<string, unknown>): ChangeRequestRow {
  return {
    id: String(row.id),
    displayCode: String(row.display_code),
    title: String(row.title),
    status: String(row.status),
    refinementStoryId:
      row.refinement_story_id === null || row.refinement_story_id === undefined
        ? null
        : String(row.refinement_story_id),
  };
}

/**
 * Python `get_workbench_snapshot`.
 *
 * Ordering matters for the counts only incidentally, but it is Python's anyway:
 * stories by `position, created_at, id`, change requests likewise. The active
 * story and change request come from the cursor's ids, looked up individually —
 * so a cursor pointing at a deleted row yields `null` for that slot while the
 * counts stay whole.
 */
export function getWorkbenchSnapshot(db: Database, journey: string): WorkbenchSnapshot {
  const normalizedJourney = normalizeJourney(journey);
  try {
    const stories = db
      .prepare(
        `SELECT * FROM builder_refinement_stories WHERE journey = ?
         ORDER BY position ASC, created_at ASC, id ASC`,
      )
      .all(normalizedJourney) as Record<string, unknown>[];
    const changeRequests = db
      .prepare(
        `SELECT * FROM builder_change_requests WHERE journey = ?
         ORDER BY position ASC, created_at ASC, id ASC`,
      )
      .all(normalizedJourney) as Record<string, unknown>[];
    const cursorRow = db
      .prepare("SELECT * FROM builder_refinement_cursors WHERE journey = ?")
      .get(normalizedJourney) as Record<string, unknown> | undefined;

    const unassigned = changeRequests.filter(
      (row) => row.refinement_story_id === null || row.refinement_story_id === undefined,
    );

    let activeStory: RefinementStoryRow | null = null;
    let activeChangeRequest: ChangeRequestRow | null = null;
    if (cursorRow?.active_refinement_story_id) {
      const row = db
        .prepare("SELECT * FROM builder_refinement_stories WHERE id = ?")
        .get(String(cursorRow.active_refinement_story_id)) as Record<string, unknown> | undefined;
      activeStory = row ? storyFromRow(row) : null;
    }
    if (cursorRow?.active_change_request_id) {
      const row = db
        .prepare("SELECT * FROM builder_change_requests WHERE id = ?")
        .get(String(cursorRow.active_change_request_id)) as Record<string, unknown> | undefined;
      activeChangeRequest = row ? changeRequestFromRow(row) : null;
    }

    return {
      storageState: "implemented",
      activeRefinementStory: activeStory,
      activeChangeRequest,
      lastRefinementEvent:
        cursorRow && typeof cursorRow.last_refinement_event === "string"
          ? cursorRow.last_refinement_event
          : null,
      refinementStoryCount: stories.length,
      changeRequestCount: changeRequests.length,
      unassignedChangeRequestCount: unassigned.length,
    };
  } catch (error) {
    // SQLite's "no such table" is the pre-CV20.DS6 database. Re-raised as a named
    // class so the two callers can diverge the way Python's do.
    const message = error instanceof Error ? error.message : String(error);
    throw new WorkbenchTablesMissingError(message);
  }
}

/**
 * Python `home_surface._safe_workbench_snapshot`: the Home path's catch. Returns
 * `null` for a database without the tables, and for a missing store or journey.
 */
export function safeWorkbenchSnapshot(
  db: Database | null,
  journey: string | null,
): WorkbenchSnapshot | null {
  if (db === null || journey === null) return null;
  try {
    return getWorkbenchSnapshot(db, journey);
  } catch (error) {
    if (error instanceof WorkbenchTablesMissingError) return null;
    throw error;
  }
}
