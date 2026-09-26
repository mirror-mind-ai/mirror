// CR002 — the surface vocabulary for a journey's roadmap scope.
//
// Every Builder surface that answers "where are we" or "what next" states the
// scope in the same words. They are behavioral contracts rather than prose: the
// agent reads them to decide its next move, and the frozen goldens pin their
// bytes. So they live here, once, and every renderer composes them instead of
// spelling its own near-synonym.
//
// `no item pulled yet` names a beginning, not a loss: the unscoped state means
// exactly that no item has been pulled since the cursor was last synchronized
// (see `roadmapScope.ts`). `none` stays only in fields that are genuinely empty.

import type { AuthoredPackage, RoadmapScope } from "./roadmapScope.ts";

/** The value of every position row when the journey is unscoped. */
export const NO_ITEM_PULLED_YET = "no item pulled yet";

/** `CV22 — <title> (<status>) [<path>]`, the pre-CR002 format; no `()` when there is no status. */
function formatPackage(authored: AuthoredPackage): string {
  const status = authored.status ? ` (${authored.status})` : "";
  return `${authored.code} — ${authored.title}${status} [${authored.path}]`;
}

/**
 * The `roadmap position` row of `■ BUILDER RESUME`, one entry per paragraph (each
 * is wrapped onto its own card lines). Every fallback states what is missing or
 * wrong; none of them throws and none of them guesses.
 */
export function roadmapPositionLines(scope: RoadmapScope): string[] {
  if (scope.kind === "unscoped") return [NO_ITEM_PULLED_YET];
  const { position, cvCode, activeItem } = scope;
  switch (position.kind) {
    case "cv_package":
      return [formatPackage(position.package)];
    case "item_package":
      return [formatPackage(position.package), `no authored package for ${cvCode}`];
    case "no_package":
      return [
        activeItem === cvCode
          ? `no authored package for ${cvCode}`
          : `no authored package for ${cvCode} or ${activeItem}`,
      ];
    case "ambiguous":
      return [
        `${position.code} is claimed by ${position.paths.length} packages: ${position.paths.join(", ")}`,
      ];
    case "no_project":
      return ["no project path configured"];
  }
}
