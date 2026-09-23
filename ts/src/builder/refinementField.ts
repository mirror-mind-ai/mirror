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
// One inherited oddity is reproduced rather than cleaned: the seed-CR count is
// read from a HARD-CODED path into Mirror Mind's own roadmap —
// `docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds6-refinement-workbench-flow/plan.md`
// — inside the USER's project. Any other project has no such file and simply
// reports zero. Recorded as debt, not fixed in a port.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Python `CANONICAL_REFINEMENT_INDEX`. */
export const CANONICAL_REFINEMENT_INDEX = "docs/project/refinement/index.md";

/** Python's hard-coded seed source, relative to the user's project root. */
const SEED_PLAN_PATH =
  "docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds6-refinement-workbench-flow/plan.md";

/** Python's `^###\s+CR:` over the seed plan, multiline. */
const SEED_CR_RE = /^###\s+CR:/gmu;

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
  readonly seedChangeRequests: number;
  readonly seedChangeRequestSource: string | null;
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
 * The canonical index short-circuits the seed scan and reports
 * `storage_state="project files"`. Without it the answer is the same authority
 * in its unstarted state, plus whatever the seed plan happens to count.
 */
export function inspectRefinementField(projectPath: string | null): RefinementFieldSnapshot {
  const canonicalIndex = findCanonicalRefinementIndex(projectPath);
  if (canonicalIndex !== null) {
    return {
      activeRefinementStory: null,
      activeChangeRequest: null,
      storageState: "project files",
      seedChangeRequests: 0,
      seedChangeRequestSource: null,
      nextMove: "inspect canonical Refinement index",
      canonicalIndex,
    };
  }

  if (projectPath === null) {
    return buildRefinementSnapshot({ seedCount: 0, seedSource: null });
  }

  const seedPlan = join(projectPath, SEED_PLAN_PATH);
  let seedCount = 0;
  let seedSource: string | null = null;
  if (isFile(seedPlan)) {
    let content = "";
    try {
      content = readFileSync(seedPlan, "utf8");
    } catch {
      content = "";
    }
    seedCount = content.match(SEED_CR_RE)?.length ?? 0;
    if (seedCount > 0) seedSource = SEED_PLAN_PATH;
  }
  return buildRefinementSnapshot({ seedCount, seedSource });
}

/**
 * Python `_refinement_snapshot`: the field for a project with no canonical
 * index. One state, and the next move is to create the file.
 */
export function buildRefinementSnapshot(options: {
  seedCount: number;
  seedSource: string | null;
}): RefinementFieldSnapshot {
  return {
    activeRefinementStory: null,
    activeChangeRequest: null,
    storageState: "project files (not started)",
    seedChangeRequests: options.seedCount,
    seedChangeRequestSource: options.seedSource,
    nextMove: `create ${CANONICAL_REFINEMENT_INDEX}`,
    canonicalIndex: null,
  };
}
