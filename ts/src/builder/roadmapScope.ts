// CR002 — the journey's roadmap scope, derived from its delivery cursor.
//
// Every Builder surface that answers "where are we" or "what next" reads this
// scope instead of the whole project. Before CR002 two readers did: one returned
// the first `index.md` whose status contained "Active", the other recommended
// across every candidate in the tree. Neither knew which journey was asking, so a
// project holding several journeys' work told each of them the same answer, and
// usually a wrong one.
//
// The only roadmap fact a journey owns is the active item in its delivery cursor.
// Pull is the one cursor writer that sets it and `sync-cursor` the one that clears
// it — every other writer carries it forward — so "unscoped" always means no item
// has been pulled since the cursor was last synchronized.
//
// Identity is the authored heading code, never a folder. A package can live under
// any directory a human chose (the rule `storyPaths.ts` states), so the CV is the
// active item's code up to the first `.`, its package is found by its heading, and
// membership is strict descent by code. Strict, because the CV is the position,
// not a candidate: `recommend()` falls back to its first candidate at ANY level,
// so a CV still marked Active with nothing left under it would otherwise be
// recommended as its own next pull.

import { pyStrip } from "#util/pythonText.ts";
import {
  type PullCandidate,
  type PullCandidatesReport,
  recommend,
  roadmapPaths,
} from "./pullCandidates.ts";
import { matchHeading, matchStatus } from "./roadmapGrammar.ts";
import { readRoadmapFile } from "./roadmapScan.ts";
import { roadmapHeadingDirectories } from "./storyPaths.ts";

export type UnscopedReason = "no_cursor" | "no_active_item";

/** An authored roadmap package, as its own `index.md` describes it. */
export interface AuthoredPackage {
  readonly code: string;
  readonly title: string;
  /** The package's `**Status:**` value, or `""` when it has none. */
  readonly status: string;
  /** POSIX, relative to the project root, ending in `index.md`. */
  readonly path: string;
}

/** Where the journey stands, as far as the authored roadmap can say. */
export type ScopePosition =
  /** The CV's own package. */
  | { readonly kind: "cv_package"; readonly package: AuthoredPackage }
  /** The CV has no package; the active item's own stands in for it. */
  | { readonly kind: "item_package"; readonly package: AuthoredPackage }
  /** Neither the CV nor the active item has an authored package. */
  | { readonly kind: "no_package" }
  /** Two or more packages claim `code` (the CV's, or the item's when the CV has none). */
  | { readonly kind: "ambiguous"; readonly code: string; readonly paths: readonly string[] }
  /** The journey has no project path, so there is no roadmap to read. */
  | { readonly kind: "no_project" };

export type RoadmapScope =
  | { readonly kind: "unscoped"; readonly reason: UnscopedReason }
  | {
      readonly kind: "active_item";
      readonly activeItem: string;
      readonly cvCode: string;
      readonly position: ScopePosition;
    };

/** The one cursor field the scope reads; every cursor view in the builder has it. */
export interface ScopeCursor {
  readonly activeItem: string | null;
}

/** The candidate list a journey sees, and the one recommendation it may get. */
export interface ScopedPullCandidates {
  readonly journey: string;
  readonly method: string;
  readonly scope: RoadmapScope;
  /** Unscoped: every candidate. Scoped: the CV's strict descendants, minus the active item. */
  readonly shown: readonly PullCandidate[];
  /** Scoped: candidates outside the CV, the CV itself not counted. Unscoped: 0. */
  readonly outsideCount: number;
  /** Scoped: `recommend(shown)`. Unscoped: always `null`. */
  readonly recommended: PullCandidate | null;
}

/** The CV a roadmap code belongs to: everything before the first `.`. */
export function cvCodeOf(code: string): string {
  return code.split(".", 1)[0] ?? code;
}

/** Strict descent: `CV2.DS1` is inside `CV2`; `CV2` and `CV20.DS1` are not. */
export function isInsideCv(code: string, cvCode: string): boolean {
  return code.startsWith(`${cvCode}.`);
}

/** The scope a journey's cursor implies. Never throws for a roadmap defect. */
export function resolveRoadmapScope(
  projectRoot: string | null,
  cursor: ScopeCursor | null,
): RoadmapScope {
  if (cursor === null) return { kind: "unscoped", reason: "no_cursor" };
  const activeItem = cursor.activeItem;
  if (!activeItem) return { kind: "unscoped", reason: "no_active_item" };
  const cvCode = cvCodeOf(activeItem);
  return {
    kind: "active_item",
    activeItem,
    cvCode,
    position: resolvePosition(projectRoot, activeItem, cvCode),
  };
}

function resolvePosition(
  projectRoot: string | null,
  activeItem: string,
  cvCode: string,
): ScopePosition {
  if (projectRoot === null) return { kind: "no_project" };
  const claims = roadmapHeadingDirectories(projectRoot);
  const cv = claimFor(projectRoot, claims, cvCode);
  if (cv.kind === "one") return { kind: "cv_package", package: cv.package };
  if (cv.kind === "many") return { kind: "ambiguous", code: cvCode, paths: cv.paths };
  if (activeItem === cvCode) return { kind: "no_package" };
  const item = claimFor(projectRoot, claims, activeItem);
  if (item.kind === "one") return { kind: "item_package", package: item.package };
  if (item.kind === "many") return { kind: "ambiguous", code: activeItem, paths: item.paths };
  return { kind: "no_package" };
}

type Claim =
  | { readonly kind: "none" }
  | { readonly kind: "one"; readonly package: AuthoredPackage }
  | { readonly kind: "many"; readonly paths: readonly string[] };

function claimFor(
  projectRoot: string,
  claims: ReadonlyMap<string, readonly string[]>,
  code: string,
): Claim {
  const directories = claims.get(code) ?? [];
  if (directories.length > 1) return { kind: "many", paths: directories.map(indexPath) };
  const only = directories[0];
  if (only === undefined) return { kind: "none" };
  const authored = readPackage(projectRoot, only);
  return authored === null ? { kind: "none" } : { kind: "one", package: authored };
}

/** A roadmap-relative package directory as the project-relative path of its `index.md`. */
function indexPath(directory: string): string {
  return directory ? `docs/project/roadmap/${directory}/index.md` : "docs/project/roadmap/index.md";
}

function readPackage(projectRoot: string, directory: string): AuthoredPackage | null {
  const { roadmapRoot } = roadmapPaths(projectRoot);
  const file = directory ? `${roadmapRoot}/${directory}/index.md` : `${roadmapRoot}/index.md`;
  const content = readRoadmapFile(file);
  if (content === null) return null;
  const heading = matchHeading(content);
  if (heading === null) return null;
  const status = matchStatus(content);
  return {
    code: pyStrip(heading.code),
    title: pyStrip(heading.title),
    status: status === null ? "" : pyStrip(status),
    path: indexPath(directory),
  };
}

/**
 * The candidate list scoped to the journey. Unscoped, every candidate is shown and
 * nothing is recommended: there is no journey position to recommend from, and a
 * project-wide ranking is exactly the answer CR002 removed.
 */
export function scopePullCandidates(
  report: PullCandidatesReport,
  scope: RoadmapScope,
): ScopedPullCandidates {
  const { journey, method, candidates } = report;
  if (scope.kind === "unscoped") {
    return { journey, method, scope, shown: candidates, outsideCount: 0, recommended: null };
  }
  const { cvCode, activeItem } = scope;
  const shown = candidates.filter(
    (candidate) => isInsideCv(candidate.code, cvCode) && candidate.code !== activeItem,
  );
  const outsideCount = candidates.filter(
    (candidate) => candidate.code !== cvCode && !isInsideCv(candidate.code, cvCode),
  ).length;
  return { journey, method, scope, shown, outsideCount, recommended: recommend(shown) };
}
