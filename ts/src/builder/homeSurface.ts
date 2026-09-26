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
//   * The placement and the candidate list read the journey's SCOPED view
//     (CR002). Python placed the journey in the CV of a project-wide
//     recommendation, synthesizing `🟪[CV99] roadmap focus` when that CV was
//     absent from the snapshot; now an unscoped journey is told no item was
//     pulled, and the first move is the literal Pull command.
//
// `render_builder_home_surface` was ported and never called: `build load`
// renders `PROJECT_POSITION` and this surface. CR002 deleted it rather than
// scope a surface no journey could see, whose one distinctive line was a
// project-wide "recommended pull".

import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import type { PullCandidate, RoadmapSnapshotReport } from "./pullCandidates.ts";
import { CANONICAL_REFINEMENT_INDEX, type RefinementFieldSnapshot } from "./refinementField.ts";
import { type ScopedPullCandidates, scopeFocus } from "./roadmapScope.ts";
import {
  candidateListHeader,
  NO_ITEM_PULLED_YET,
  outsideCountLines,
  pullExplicitly,
} from "./scopePhrases.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

/** Python `_candidate_short_title`: the last `/` segment, stripped. */
function candidateShortTitle(candidate: PullCandidate): string {
  const segments = candidate.title.split("/");
  return (segments[segments.length - 1] ?? "").trim();
}

/** Python `_roadmap_placement_lines`, placed by the journey's scope. */
function roadmapPlacementLines(
  roadmap: RoadmapSnapshotReport,
  view: ScopedPullCandidates,
): string[] {
  const focus = scopeFocus(roadmap.items, view.scope);
  if (focus === null) return [cardText(NO_ITEM_PULLED_YET)];
  const lines = cardWrapped(`🟪[${focus.code}] ${focus.title}`);
  const recommended = view.recommended;
  if (recommended !== null) {
    const childCode = recommended.code.split(".").pop() ?? recommended.code;
    lines.push(...cardWrapped(`  └─ 🟦[${childCode}] ${candidateShortTitle(recommended)}`));
  }
  return lines;
}

/**
 * Python `_pull_candidate_lines`, under the scope's header: `▸` marks the
 * recommended candidate, `·` the rest, and an unscoped list has no `▸`.
 */
function pullCandidateLines(view: ScopedPullCandidates): string[] {
  const lines = [cardText(candidateListHeader(view.scope))];
  if (view.shown.length === 0) lines.push(cardText("none"));
  for (const candidate of view.shown) {
    const marker = view.recommended && candidate.code === view.recommended.code ? "▸" : "·";
    lines.push(...cardWrapped(`${marker} ${candidate.code} ${candidateShortTitle(candidate)}`));
  }
  lines.push(...outsideCountLines(view).flatMap(cardWrapped));
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
 * three moves; the legacy path always appends a fourth. The first move pulls the
 * scoped recommendation, or, when there is none, is the literal Pull command.
 */
export function availableRefinementMoves(
  refinement: RefinementFieldSnapshot,
  view: ScopedPullCandidates,
): string[] {
  const moves = [
    view.recommended ? `pull ${view.recommended.code}` : pullExplicitly(view.journey),
    "inspect roadmap",
  ];
  if (refinement.canonicalIndex) {
    moves.push("inspect canonical Refinement index");
    return moves;
  }
  moves.push(`create ${CANONICAL_REFINEMENT_INDEX}`);
  return moves;
}

/** Python `render_builder_orientation_surface`, over the journey's scoped view. */
export function renderBuilderOrientationSurface(options: {
  roadmap: RoadmapSnapshotReport;
  view: ScopedPullCandidates;
  refinement: RefinementFieldSnapshot;
}): string {
  const { roadmap, view, refinement } = options;
  const lines: string[] = [
    "Builder Orientation",
    "",
    FRAME_TOP,
    "│        ■  BUILDER ORIENTATION                          │",
    FRAME_BLANK,
    cardText("Where are we in the roadmap?"),
    ...roadmapPlacementLines(roadmap, view),
    FRAME_BLANK,
    cardText("What can be pulled next?"),
    ...pullCandidateLines(view),
    FRAME_BLANK,
    cardText("What is open for refinement?"),
    ...refinementOrientationLines(refinement),
    FRAME_BLANK,
    cardText("What can we do now?"),
    ...cardPrefixed(availableRefinementMoves(refinement, view), "-"),
    FRAME_BLANK,
    ...cardWrapped("Choose a move when ready."),
    FRAME_BOTTOM,
  ];
  return wrapAriadSurface("builder_orientation", `${lines.join("\n")}\n`);
}
