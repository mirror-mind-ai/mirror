// CV22.DS7.US8 plateau 1 — the Refinement field snapshot, filesystem half.
//
// Port of `find_canonical_refinement_index`, `inspect_refinement_field`, and
// `_refinement_snapshot` from `src/memory/builder/home_surface.py`.
//
// This is the read D1 could not retire. The Workbench VERBS are retired in DS10,
// but `build load`'s resume and home surfaces still render a `🧰 Refinement field`
// from the SQLite Workbench whenever a project has no
// `docs/project/refinement/index.md` — so the snapshot read survives the
// retirement and belongs to US8.
//
// Only the filesystem half lands here. The Workbench snapshot itself is a
// database read and arrives in plateau 2 with the delivery cursor, injected
// through `buildRefinementSnapshot`'s `workbench` argument so this module never
// grows a database dependency of its own.
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

/** Python `RefinementFieldSnapshot`. */
export interface RefinementFieldSnapshot {
  readonly activeRefinementStory: string | null;
  readonly activeChangeRequest: string | null;
  readonly storageState: string;
  readonly seedChangeRequests: number;
  readonly seedChangeRequestSource: string | null;
  readonly nextMove: string;
  readonly refinementStoryCount: number;
  readonly changeRequestCount: number;
  readonly unassignedChangeRequestCount: number;
  readonly canonicalIndex: string | null;
}

/** The Workbench rows this module renders, supplied by plateau 2's reader. */
export interface WorkbenchSnapshotView {
  readonly storageState: string;
  readonly activeRefinementStory: { readonly displayCode: string; readonly title: string } | null;
  readonly activeChangeRequest: { readonly displayCode: string; readonly title: string } | null;
  readonly lastRefinementEvent: string | null;
  readonly refinementStoryCount: number;
  readonly changeRequestCount: number;
  readonly unassignedChangeRequestCount: number;
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
 * The canonical index short-circuits everything: no seed scan, no Workbench read,
 * and the snapshot reports `storage_state="project files"`. Only when it is
 * absent does the legacy path run.
 */
export function inspectRefinementField(
  projectPath: string | null,
  options: { workbench?: WorkbenchSnapshotView | null } = {},
): RefinementFieldSnapshot {
  const canonicalIndex = findCanonicalRefinementIndex(projectPath);
  if (canonicalIndex !== null) {
    return {
      activeRefinementStory: null,
      activeChangeRequest: null,
      storageState: "project files",
      seedChangeRequests: 0,
      seedChangeRequestSource: null,
      nextMove: "inspect canonical Refinement index",
      refinementStoryCount: 0,
      changeRequestCount: 0,
      unassignedChangeRequestCount: 0,
      canonicalIndex,
    };
  }

  const workbench = options.workbench ?? null;
  if (projectPath === null) {
    return buildRefinementSnapshot({ seedCount: 0, seedSource: null, workbench });
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
  return buildRefinementSnapshot({ seedCount, seedSource, workbench });
}

/**
 * Python `_refinement_snapshot`. With no Workbench the state is
 * `"not implemented yet"` and the next move names the storage model; with one,
 * the next move walks CR → RS → compose.
 */
export function buildRefinementSnapshot(options: {
  seedCount: number;
  seedSource: string | null;
  workbench: WorkbenchSnapshotView | null;
}): RefinementFieldSnapshot {
  const { seedCount, seedSource, workbench } = options;
  if (workbench === null) {
    return {
      activeRefinementStory: null,
      activeChangeRequest: null,
      storageState: "not implemented yet",
      seedChangeRequests: seedCount,
      seedChangeRequestSource: seedSource,
      nextMove: "implement Workbench Storage Model before durable RS/CR work",
      refinementStoryCount: 0,
      changeRequestCount: 0,
      unassignedChangeRequestCount: 0,
      canonicalIndex: null,
    };
  }
  return {
    activeRefinementStory: workbench.activeRefinementStory
      ? `${workbench.activeRefinementStory.displayCode}: ${workbench.activeRefinementStory.title}`
      : null,
    activeChangeRequest: workbench.activeChangeRequest
      ? `${workbench.activeChangeRequest.displayCode}: ${workbench.activeChangeRequest.title}`
      : null,
    storageState: workbench.storageState,
    seedChangeRequests: seedCount,
    seedChangeRequestSource: seedSource,
    nextMove: workbench.activeChangeRequest
      ? "continue active Change Request"
      : workbench.activeRefinementStory
        ? "continue active Refinement Story"
        : "compose or capture Refinement Work when requested",
    refinementStoryCount: workbench.refinementStoryCount,
    changeRequestCount: workbench.changeRequestCount,
    unassignedChangeRequestCount: workbench.unassignedChangeRequestCount,
    canonicalIndex: null,
  };
}
