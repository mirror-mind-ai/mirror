// Front-door `journey set-path` write handler (US5).
//
// applyJourneySetPath is the testable core of routing `journey set-path` to the TS
// core: it normalizes the path the way Python does, then delegates to the ported
// US2 setProjectPath over the US4 live-write seam. setProjectPath throws when the
// journey does not exist; the cli wrapper maps that to Python's not-found output.

import type { WritableDatabase } from "../db/database.ts";
import { setProjectPath } from "../journey/journeyWrite.ts";
import { normalizeProjectPath } from "../util/paths.ts";

/**
 * Apply `journey set-path`: normalize `rawPath` (expanduser + resolve, matching
 * Python), write it into the journey's `project_path` metadata via setProjectPath,
 * and return the resolved path. Throws `journey not found: <slug>` when absent.
 */
export function applyJourneySetPath(
  db: WritableDatabase,
  slug: string,
  rawPath: string,
  nowIso: string,
): string {
  const resolved = normalizeProjectPath(rawPath);
  setProjectPath(db, slug, resolved, nowIso);
  return resolved;
}
