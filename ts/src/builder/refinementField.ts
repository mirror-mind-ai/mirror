// The Refinement field snapshot.
//
// Port of `find_canonical_refinement_index`, `inspect_refinement_field`, and
// `_refinement_snapshot` from `src/memory/builder/home_surface.py`.
//
// CV22.DS7.US8 landed the filesystem half here and the Workbench read beside
// it, because `build load` rendered the `🧰 Refinement field` out of SQLite
// whenever a project had no `docs/project/refinement/index.md`.
// CV22.DS10.TS4 retired that Workbench, and with it the second authority: a
// project either HAS the canonical index or has not created it yet. There is
// no other place to look, so this module no longer takes a database read of
// any kind.
//
// The port reproduced one inherited oddity rather than clean it mid-port: a
// seed-CR count read from a HARD-CODED path into Mirror Mind's own roadmap,
// inside the USER's project -- any other project simply reported zero. It was
// carried as debt D-024 and removed from both engines by CV22.DS10.TS5, which
// left the field with a single conditional: the canonical index, or not yet.

import { statSync } from "node:fs";
import { join } from "node:path";

/** Python `CANONICAL_REFINEMENT_INDEX`. */
export const CANONICAL_REFINEMENT_INDEX = "docs/project/refinement/index.md";

/**
 * Python `RefinementFieldSnapshot`.
 *
 * `activeRefinementStory` and `activeChangeRequest` are retained as always-null
 * fields because the surfaces still read them; the three Workbench COUNTS went
 * with the Workbench, since a permanently-zero count invites a reader to
 * believe something counts it.
 */
export interface RefinementFieldSnapshot {
  readonly activeRefinementStory: string | null;
  readonly activeChangeRequest: string | null;
  readonly storageState: string;
  readonly nextMove: string;
  readonly canonicalIndex: string | null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Python `find_canonical_refinement_index`: the project-relative path when the
 * canonical index exists as a FILE. A directory at that path is not an index —
 * Python's `is_file()`, not `exists()`.
 */
export function findCanonicalRefinementIndex(projectPath: string | null): string | null {
  if (projectPath === null) return null;
  return isFile(join(projectPath, CANONICAL_REFINEMENT_INDEX)) ? CANONICAL_REFINEMENT_INDEX : null;
}

/**
 * Python `inspect_refinement_field`.
 *
 * The canonical index reports `storage_state="project files"`; without it the
 * answer is the same authority in its unstarted state.
 */
export function inspectRefinementField(projectPath: string | null): RefinementFieldSnapshot {
  const canonicalIndex = findCanonicalRefinementIndex(projectPath);
  if (canonicalIndex !== null) {
    return {
      activeRefinementStory: null,
      activeChangeRequest: null,
      storageState: "project files",
      nextMove: "inspect canonical Refinement index",
      canonicalIndex,
    };
  }

  return buildRefinementSnapshot();
}

/**
 * Python `_refinement_snapshot`: the field for a project with no canonical
 * index. One state, and the next move is to create the file.
 */
export function buildRefinementSnapshot(): RefinementFieldSnapshot {
  return {
    activeRefinementStory: null,
    activeChangeRequest: null,
    storageState: "project files (not started)",
    nextMove: `create ${CANONICAL_REFINEMENT_INDEX}`,
    canonicalIndex: null,
  };
}
