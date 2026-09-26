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

import { PROGRAM } from "#util/program.ts";
import type { AuthoredPackage, RoadmapScope, ScopedPullCandidates } from "./roadmapScope.ts";

/** The value of every position row when the journey is unscoped. */
export const NO_ITEM_PULLED_YET = "no item pulled yet";

/**
 * What stands where a recommendation would when there is none: the literal Pull
 * command, carrying the journey's real slug and placeholders the Navigator fills
 * from the item they name. The command itself, not a description of one, because
 * the agent copies it.
 */
export function pullExplicitly(journey: string): string {
  return (
    `pull explicitly: ${PROGRAM} build pull-item --journey ${journey} --method ariad ` +
    `--item-code <code> --item-title "<title>" --item-level <level> --why-now "<why now>"`
  );
}

/** The header of every candidate list: whose candidates these are. */
export function candidateListHeader(scope: RoadmapScope): string {
  return scope.kind === "unscoped" ? "project-wide candidates" : `candidates in ${scope.cvCode}`;
}

/** The one line a scoped list adds for the candidates it leaves out, when it leaves any. */
export function outsideCountLines(view: ScopedPullCandidates): string[] {
  if (view.scope.kind === "unscoped" || view.outsideCount === 0) return [];
  return [`${view.outsideCount} more outside ${view.scope.cvCode}`];
}

/**
 * The paragraphs that stand where a recommendation would when there is none:
 * why, for a scoped CV with nothing left, then the literal command. Unscoped, the
 * command alone, because the position rows already say no item was pulled.
 */
export function noRecommendationLines(view: ScopedPullCandidates): string[] {
  const pull = pullExplicitly(view.journey);
  if (view.scope.kind === "unscoped") return [pull];
  return [`no remaining candidates in ${view.scope.cvCode}`, pull];
}

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
