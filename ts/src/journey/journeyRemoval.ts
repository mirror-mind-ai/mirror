// Conservative journey removal ported from the v0.31.9 Python domain operation.
//
// A journey is deletable only when it exists, has no metadata-authoritative
// children, and has no durable association in the closed inventory below. The
// complete check and the single identity DELETE share BEGIN IMMEDIATE so a
// competing writer that commits first is visible before the decision.

import { type WritableDatabase, withTransaction } from "#db/database.ts";

export interface JourneyAssociationCounts {
  child_journeys: number;
  journey_paths: number;
  conversations: number;
  memories: number;
  tasks: number;
  attachments: number;
  runtime_sessions: number;
  explorer_stories: number;
  refinement_stories: number;
  change_requests: number;
  refinement_cursors: number;
}

export class JourneyRemovalError extends Error {
  readonly slug: string;
  readonly associations?: JourneyAssociationCounts;

  constructor(slug: string, message: string, associations?: JourneyAssociationCounts) {
    super(message);
    this.slug = slug;
    this.associations = associations;
  }
}

function count(db: WritableDatabase, sql: string, journey: string): number {
  const value = db.prepare(sql).get(journey)?.count;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error("journey association count did not return a number");
}

/**
 * Count the released closed inventory of records that removal would orphan.
 * Every query is a fixed literal. Child parentage comes only from valid JSON
 * metadata (CR050 semantic authority), never migration 017's projection.
 */
export function countJourneyAssociations(
  db: WritableDatabase,
  journey: string,
): JourneyAssociationCounts {
  return {
    child_journeys: count(
      db,
      `SELECT COUNT(*) AS count FROM identity
       WHERE layer = 'journey'
         AND CASE WHEN json_valid(metadata)
                  THEN json_extract(metadata, '$.parent_journey') END = ?`,
      journey,
    ),
    journey_paths: count(
      db,
      "SELECT COUNT(*) AS count FROM identity WHERE layer = 'journey_path' AND key = ?",
      journey,
    ),
    conversations: count(
      db,
      "SELECT COUNT(*) AS count FROM conversations WHERE journey = ?",
      journey,
    ),
    memories: count(db, "SELECT COUNT(*) AS count FROM memories WHERE journey = ?", journey),
    tasks: count(db, "SELECT COUNT(*) AS count FROM tasks WHERE journey = ?", journey),
    attachments: count(
      db,
      "SELECT COUNT(*) AS count FROM attachments WHERE journey_id = ?",
      journey,
    ),
    runtime_sessions: count(
      db,
      "SELECT COUNT(*) AS count FROM runtime_sessions WHERE journey = ?",
      journey,
    ),
    explorer_stories: count(
      db,
      "SELECT COUNT(*) AS count FROM exploratory_stories WHERE journey = ?",
      journey,
    ),
    refinement_stories: count(
      db,
      "SELECT COUNT(*) AS count FROM builder_refinement_stories WHERE journey = ?",
      journey,
    ),
    change_requests: count(
      db,
      "SELECT COUNT(*) AS count FROM builder_change_requests WHERE journey = ?",
      journey,
    ),
    refinement_cursors: count(
      db,
      "SELECT COUNT(*) AS count FROM builder_refinement_cursors WHERE journey = ?",
      journey,
    ),
  };
}

const ASSOCIATED_RECORD_KEYS = [
  "journey_paths",
  "conversations",
  "memories",
  "tasks",
  "attachments",
  "runtime_sessions",
  "explorer_stories",
  "refinement_stories",
  "change_requests",
  "refinement_cursors",
] as const satisfies readonly (keyof JourneyAssociationCounts)[];

/** Remove exactly one empty leaf journey, or throw without mutating state. */
export function removeJourney(db: WritableDatabase, journey: string): true {
  return withTransaction(db, () => {
    const exists = db
      .prepare("SELECT 1 AS present FROM identity WHERE layer = 'journey' AND key = ?")
      .get(journey);
    if (exists === undefined) {
      throw new JourneyRemovalError(journey, `Journey '${journey}' not found`);
    }

    const associations = countJourneyAssociations(db, journey);
    if (associations.child_journeys > 0) {
      throw new JourneyRemovalError(
        journey,
        `Journey '${journey}' has child journeys; move or remove them first`,
        associations,
      );
    }

    const details = ASSOCIATED_RECORD_KEYS.filter((key) => associations[key] > 0).map(
      (key) => `${key}=${associations[key]}`,
    );
    if (details.length > 0) {
      throw new JourneyRemovalError(
        journey,
        `Journey '${journey}' has associated records: ${details.join(", ")}`,
        associations,
      );
    }

    db.prepare("DELETE FROM identity WHERE layer = 'journey' AND key = ?").run(journey);
    return true;
  });
}
