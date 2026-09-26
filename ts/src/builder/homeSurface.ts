// CV22.DS7.US8 plateau 1 — the Builder Orientation surface.
//
// Port of `render_builder_orientation_surface` in
// `src/memory/builder/home_surface.py`. This is what `build load` shows an Ariad
// journey with no active item, and it is almost entirely branches — which is what
// a port collapses. Three of them are worth naming because each is a silent
// behavior change if merged:
//
//   * `_available_refinement_moves` RETURNS EARLY for a canonical index, so the
//     Workbench-storage move below it is unreachable in that state. An
//     `if/elif` chain written without the early return appends it.
//   * `_refinement_orientation_lines` has two shapes since CV22.DS10.TS4: a
//     canonical index, and none.
//   * It renders only without an active item, so since CR002 it takes the raw
//     project-wide report, never a scope. Python placed the journey in the CV of
//     a project-wide recommendation, synthesizing `🟪[CV99] roadmap focus` when
//     that CV was absent from the snapshot. Now the journey is told no item was
//     pulled, the list is labelled project-wide, and the first move is the
//     literal Pull command. Its scoped branches were unreachable and went in
//     CR002's handoff review.
//
// `render_builder_home_surface` was ported and never called: `build load`
// renders `PROJECT_POSITION` and this surface. CR002 deleted it rather than
// scope a surface no journey could see, whose one distinctive line was a
// project-wide "recommended pull".

import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import type { PullCandidate, PullCandidatesReport } from "./pullCandidates.ts";
import { CANONICAL_REFINEMENT_INDEX, type RefinementFieldSnapshot } from "./refinementField.ts";
import { NO_ITEM_PULLED_YET, PROJECT_WIDE_CANDIDATES, pullExplicitly } from "./scopePhrases.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

/** Python `_candidate_short_title`: the last `/` segment, stripped. */
function candidateShortTitle(candidate: PullCandidate): string {
  const segments = candidate.title.split("/");
  return (segments[segments.length - 1] ?? "").trim();
}

/**
 * Python `_pull_candidate_lines`, project-wide. Python marked its project-wide
 * recommendation with `▸`; without a journey scope there is none, so every
 * candidate is a `·`.
 */
function pullCandidateLines(report: PullCandidatesReport): string[] {
  const lines = [cardText(PROJECT_WIDE_CANDIDATES)];
  if (report.candidates.length === 0) lines.push(cardText("none"));
  for (const candidate of report.candidates) {
    lines.push(...cardWrapped(`· ${candidate.code} ${candidateShortTitle(candidate)}`));
  }
  return lines;
}

/** Python `_refinement_orientation_lines`. Two shapes since CV22.DS10.TS4. */
function refinementOrientationLines(refinement: RefinementFieldSnapshot): string[] {
  if (refinement.canonicalIndex) {
    return [
      cardText("authority: project files"),
      ...cardWrapped(`index: ${refinement.canonicalIndex}`),
    ];
  }
  return [
    cardText("authority: project files (not started)"),
    ...cardWrapped(`create: ${CANONICAL_REFINEMENT_INDEX}`),
  ];
}

/**
 * Python `_available_refinement_moves`. The canonical-index path returns after
 * three moves; the legacy path always appends a fourth. The first move is the
 * literal Pull command: the surface renders only when no item has been pulled.
 */
export function availableRefinementMoves(
  refinement: RefinementFieldSnapshot,
  journey: string,
): string[] {
  const moves = [pullExplicitly(journey), "inspect roadmap"];
  if (refinement.canonicalIndex) {
    moves.push("inspect canonical Refinement index");
    return moves;
  }
  moves.push(`create ${CANONICAL_REFINEMENT_INDEX}`);
  return moves;
}

/**
 * Python `render_builder_orientation_surface`, for a journey with no active item:
 * `build load`'s only caller. `candidates` is the raw project-wide scan.
 */
export function renderBuilderOrientationSurface(options: {
  candidates: PullCandidatesReport;
  refinement: RefinementFieldSnapshot;
}): string {
  const { candidates, refinement } = options;
  const lines: string[] = [
    "Builder Orientation",
    "",
    FRAME_TOP,
    "│        ■  BUILDER ORIENTATION                          │",
    FRAME_BLANK,
    cardText("Where are we in the roadmap?"),
    cardText(NO_ITEM_PULLED_YET),
    FRAME_BLANK,
    cardText("What can be pulled next?"),
    ...pullCandidateLines(candidates),
    FRAME_BLANK,
    cardText("What is open for refinement?"),
    ...refinementOrientationLines(refinement),
    FRAME_BLANK,
    cardText("What can we do now?"),
    ...cardPrefixed(availableRefinementMoves(refinement, candidates.journey), "-"),
    FRAME_BLANK,
    ...cardWrapped("Choose a move when ready."),
    FRAME_BOTTOM,
  ];
  return wrapAriadSurface("builder_orientation", `${lines.join("\n")}\n`);
}
