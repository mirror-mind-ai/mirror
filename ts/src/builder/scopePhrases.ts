// CR002 — the surface vocabulary for a journey's roadmap scope.
//
// Every Builder surface that answers "where are we" or "what next" states the
// scope in the same words. They are behavioral contracts rather than prose: the
// agent reads them to decide its next move, and the frozen goldens pin their
// bytes. So they live here, once, and every renderer composes them instead of
// spelling its own near-synonym. That includes the focus a surface shows
// (`scopeFocus`), because a focus the roadmap cannot supply is stated in these
// same words.
//
// `no item pulled yet` names a beginning, not a loss: the unscoped state means
// exactly that no item has been pulled since the cursor was last synchronized
// (see `roadmapScope.ts`). `none` stays only in fields that are genuinely empty.

import { PROGRAM } from "#util/program.ts";
import type { RoadmapSnapshotItem } from "./pullCandidates.ts";
import type {
  AuthoredPackage,
  RoadmapScope,
  ScopedPullCandidates,
  ScopePosition,
} from "./roadmapScope.ts";

/** The value of every position row when the journey is unscoped. */
export const NO_ITEM_PULLED_YET = "no item pulled yet";

/** The header of a candidate list that no journey scope narrows. */
export const PROJECT_WIDE_CANDIDATES = "project-wide candidates";

const NO_AUTHORED_PACKAGE = "no authored package";
const NO_PROJECT_PATH = "no project path configured";
const claimedBy = (count: number) => `claimed by ${count} packages`;

/**
 * A POSIX shell word for `value`: as is when it is a plain token, single-quoted
 * otherwise. The Pull command below is printed to be copied into a shell, and a
 * journey slug is not validated at creation (CR104), so a slug like
 * `x;touch PWNED` must arrive as one argument and run nothing.
 */
function shellWord(value: string): string {
  if (/^[A-Za-z0-9._-]+$/u.test(value)) return value;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * What stands where a recommendation would when there is none: the literal Pull
 * command, carrying the journey's real slug and placeholders the Navigator fills
 * from the item they name. The command itself, not a description of one, because
 * the agent copies it.
 */
export function pullExplicitly(journey: string): string {
  return (
    `pull explicitly: ${PROGRAM} build pull-item --journey ${shellWord(journey)} --method ariad ` +
    `--item-code <code> --item-title "<title>" --item-level <level> --why-now "<why now>"`
  );
}

/** The header of every candidate list: whose candidates these are. */
export function candidateListHeader(scope: RoadmapScope): string {
  return scope.kind === "unscoped" ? PROJECT_WIDE_CANDIDATES : `candidates in ${scope.cvCode}`;
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
      return [formatPackage(position.package), `${NO_AUTHORED_PACKAGE} for ${cvCode}`];
    case "no_package":
      return [
        activeItem === cvCode
          ? `${NO_AUTHORED_PACKAGE} for ${cvCode}`
          : `${NO_AUTHORED_PACKAGE} for ${cvCode} or ${activeItem}`,
      ];
    case "ambiguous":
      return [
        `${position.code} is ${claimedBy(position.paths.length)}: ${position.paths.join(", ")}`,
      ];
    case "no_project":
      return [NO_PROJECT_PATH];
  }
}

/**
 * The roadmap focus a surface shows as "where are we": the roadmap index row for
 * the journey's CV, else the CV package's heading, else the position stated in
 * this vocabulary. `null` when unscoped.
 *
 * The index row wins because it is what the focus showed before CR002, for the
 * same CV; the change is WHICH CV, not where its title is read from.
 */
export function scopeFocus(
  items: readonly RoadmapSnapshotItem[],
  scope: RoadmapScope,
): RoadmapSnapshotItem | null {
  if (scope.kind === "unscoped") return null;
  const row = items.find((item) => item.code === scope.cvCode);
  if (row !== undefined) return row;
  const position = scope.position;
  if (position.kind === "cv_package") {
    const { code, title, status } = position.package;
    return { code, title, status };
  }
  return { code: scope.cvCode, title: placeholderTitle(scope.cvCode, position), status: "" };
}

/** The focus title for a CV the roadmap cannot describe; the focus row already names the CV. */
function placeholderTitle(cvCode: string, position: ScopePosition): string {
  if (position.kind === "no_project") return NO_PROJECT_PATH;
  if (position.kind === "ambiguous" && position.code === cvCode) {
    return claimedBy(position.paths.length);
  }
  return NO_AUTHORED_PACKAGE;
}
