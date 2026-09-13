// CV22.DS7.US8 plateau 1 — the Builder Home and Orientation surfaces.
//
// Port of the two renderers in `src/memory/builder/home_surface.py`. These are
// what `build load` shows an Ariad journey with no active item, and they are
// almost entirely branches — which is what a port collapses. Four of them are
// worth naming because each is a silent behavior change if merged:
//
//   * `_available_refinement_moves` RETURNS EARLY for a canonical index, so the
//     three Workbench-storage moves below it are unreachable in that state. An
//     `if/elif` chain written without the early return appends one of them.
//   * `_refinement_orientation_lines` has four shapes, not two: active RS with a
//     CR, active RS without one, captured CRs but no RS, and nothing at all.
//   * `_roadmap_placement_lines` synthesizes `🟪[CV99] roadmap focus` when the
//     recommended candidate's CV is ABSENT from the snapshot, rather than
//     omitting the line.
//   * Home's refinement block prints six count rows in the legacy state and two
//     path rows under a canonical index — a different row COUNT, not just
//     different text.
//
// `seed source` sits outside that if/else on purpose: Python appends it whenever
// a source exists, so a canonical-index surface would also show it if one were
// somehow set. Reproduced.

import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import type {
  PullCandidate,
  PullCandidatesReport,
  RoadmapSnapshotReport,
} from "./pullCandidates.ts";
import type { RefinementFieldSnapshot } from "./refinementField.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

/** Python `_candidate_short_title`: the last `/` segment, stripped. */
function candidateShortTitle(candidate: PullCandidate): string {
  const segments = candidate.title.split("/");
  return (segments[segments.length - 1] ?? "").trim();
}

/** Python `_format_recommended`. */
function formatRecommended(candidate: PullCandidate | null): string {
  if (candidate === null) return "none";
  return `${candidate.code} — ${candidate.title} [${candidate.level}]`;
}

/** Python `_roadmap_placement_lines`. */
function roadmapPlacementLines(
  roadmap: RoadmapSnapshotReport,
  recommended: PullCandidate | null,
): string[] {
  if (recommended === null) return [cardText("no recommended Delivery item")];
  const cvCode = recommended.code.split(".", 1)[0] ?? recommended.code;
  const cvItem = roadmap.items.find((item) => item.code === cvCode);
  const lines: string[] = [];
  if (cvItem !== undefined) {
    lines.push(...cardWrapped(`🟪[${cvItem.code}] ${cvItem.title}`));
  } else {
    lines.push(...cardWrapped(`🟪[${cvCode}] roadmap focus`));
  }
  const childCode = recommended.code.split(".").pop() ?? recommended.code;
  lines.push(...cardWrapped(`  └─ 🟦[${childCode}] ${candidateShortTitle(recommended)}`));
  return lines;
}

/** Python `_pull_candidate_lines`: `▸` marks the recommended one, `·` the rest. */
function pullCandidateLines(report: PullCandidatesReport): string[] {
  if (report.candidates.length === 0) return [cardText("none")];
  const lines: string[] = [];
  for (const candidate of report.candidates) {
    const marker = report.recommended && candidate.code === report.recommended.code ? "▸" : "·";
    lines.push(...cardWrapped(`${marker} ${candidate.code} ${candidateShortTitle(candidate)}`));
  }
  return lines;
}

/** Python `_refinement_orientation_lines`, all four shapes. */
function refinementOrientationLines(refinement: RefinementFieldSnapshot): string[] {
  if (refinement.canonicalIndex) {
    return [
      cardText("authority: project files"),
      ...cardWrapped(`index: ${refinement.canonicalIndex}`),
    ];
  }
  if (refinement.activeRefinementStory) {
    const lines = cardWrapped(`active RS: ${refinement.activeRefinementStory}`);
    if (refinement.activeChangeRequest) {
      lines.push(...cardWrapped(`active CR: ${refinement.activeChangeRequest}`));
    } else {
      lines.push(cardText("active CR: none"));
    }
    return lines;
  }
  if (refinement.changeRequestCount) {
    return [
      cardText("no active Refinement Story"),
      cardText(`${refinement.changeRequestCount} captured Change Requests`),
    ];
  }
  return [cardText("no active Refinement Story"), cardText("no captured Change Requests")];
}

/**
 * Python `_available_refinement_moves`. The canonical-index path returns after
 * three moves; the legacy path always appends a fourth.
 */
export function availableRefinementMoves(
  refinement: RefinementFieldSnapshot,
  recommended: PullCandidate | null = null,
): string[] {
  const moves = [
    recommended ? `pull ${recommended.code}` : "pull recommended Delivery item",
    "inspect roadmap",
  ];
  if (refinement.canonicalIndex) {
    moves.push("inspect canonical Refinement index");
  } else if (refinement.seedChangeRequests) {
    moves.push("review seed Change Requests");
  }
  if (refinement.canonicalIndex) return moves;
  if (refinement.activeRefinementStory) {
    moves.push("continue active Refinement Story");
  } else if (refinement.storageState === "implemented") {
    moves.push("compose or capture Refinement Work when requested");
  } else {
    moves.push("implement Workbench Storage Model before durable RS/CR work");
  }
  return moves;
}

/** Python `render_builder_orientation_surface`. */
export function renderBuilderOrientationSurface(options: {
  roadmap: RoadmapSnapshotReport;
  candidatesReport: PullCandidatesReport;
  refinement: RefinementFieldSnapshot;
}): string {
  const { roadmap, candidatesReport, refinement } = options;
  const recommended = candidatesReport.recommended;
  const lines: string[] = [
    "Builder Orientation",
    "",
    FRAME_TOP,
    "│        ■  BUILDER ORIENTATION                          │",
    FRAME_BLANK,
    cardText("Where are we in the roadmap?"),
    ...roadmapPlacementLines(roadmap, recommended),
    FRAME_BLANK,
    cardText("What can be pulled next?"),
    ...pullCandidateLines(candidatesReport),
    FRAME_BLANK,
    cardText("What is open for refinement?"),
    ...refinementOrientationLines(refinement),
    FRAME_BLANK,
    cardText("What can we do now?"),
    ...cardPrefixed(availableRefinementMoves(refinement, recommended), "-"),
    FRAME_BLANK,
    ...cardWrapped("Choose a move when ready."),
    FRAME_BOTTOM,
  ];
  return wrapAriadSurface("builder_orientation", `${lines.join("\n")}\n`);
}

/** Python `render_builder_home_surface`. */
export function renderBuilderHomeSurface(options: {
  journey: string;
  method: string;
  candidatesReport: PullCandidatesReport;
  refinement: RefinementFieldSnapshot;
}): string {
  const { journey, method, candidatesReport, refinement } = options;
  const recommended = candidatesReport.recommended;
  const lines: string[] = [
    "Builder Home",
    "",
    FRAME_TOP,
    "│        ■  BUILDER HOME                                 │",
    FRAME_BLANK,
    cardText("journey"),
    cardText(journey),
    FRAME_BLANK,
    cardText("method"),
    cardText(method),
    FRAME_BLANK,
    cardText("🟪 Delivery field"),
    ...cardWrapped(
      recommended
        ? `recommended pull: ${formatRecommended(recommended)}`
        : "recommended pull: none",
    ),
    FRAME_BLANK,
    cardText("🧰 Refinement field"),
  ];

  if (refinement.canonicalIndex) {
    lines.push(
      cardText("authority: project files"),
      ...cardWrapped(`index: ${refinement.canonicalIndex}`),
    );
  } else {
    lines.push(
      ...cardWrapped(`active RS: ${refinement.activeRefinementStory ?? "none"}`),
      ...cardWrapped(`active CR: ${refinement.activeChangeRequest ?? "none"}`),
      cardText(`workbench storage: ${refinement.storageState}`),
      cardText(`stored RSs: ${refinement.refinementStoryCount}`),
      cardText(`stored CRs: ${refinement.changeRequestCount}`),
      cardText(`unassigned CRs: ${refinement.unassignedChangeRequestCount}`),
      cardText(`seed CRs: ${refinement.seedChangeRequests}`),
    );
  }
  // Outside the if/else in Python too.
  if (refinement.seedChangeRequestSource) {
    lines.push(...cardWrapped(`seed source: ${refinement.seedChangeRequestSource}`));
  }
  lines.push(
    ...cardWrapped(`next refinement move: ${refinement.nextMove}`),
    FRAME_BLANK,
    cardText("available moves"),
    ...cardPrefixed(availableRefinementMoves(refinement, recommended), "-"),
    FRAME_BLANK,
    cardText("boundary"),
    ...cardWrapped(
      "Builder Home orients only; no item was pulled and no lifecycle work was executed.",
    ),
    FRAME_BOTTOM,
  );
  return wrapAriadSurface("builder_home", `${lines.join("\n")}\n`);
}
