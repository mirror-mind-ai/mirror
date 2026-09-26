// CV22.DS7.US8 plateau 1 — the three roadmap-inspection surfaces.
//
// Port of the renderers in `src/memory/builder/pull_candidates.py`:
// `PROJECT POSITION`, `ROADMAP SNAPSHOT`, and `PULL CANDIDATES`. All three are
// `transport=verbatim`, so what matters is bytes, not layout intent.
//
// The hardcoded frame lines in Python are RAGGED, measured in code points of
// their inner width:
//
//   ╭…╮ / ╰…╯ and the blank rows   56   (what `cardText` also produces)
//   `🧭  PROJECT POSITION`         54   (two short)
//   `🟪■  PULL CANDIDATES`         55   (one short)
//
// That is not a defect to fix here. The author padded them by eye against a
// terminal, where an astral-plane glyph occupies two columns but one code point,
// so the literals are visually aligned and numerically inconsistent. A port that
// normalizes them to 56 produces a prettier card and fails parity. They are
// copied verbatim and the golden grades them. Two more, the empty `roadmap field`
// and `Backlog` rows, left with CR002: an unscoped snapshot now states the
// scope in `cardLine`'s own width instead.
//
// CR002: "where are we" and "what next" come from the journey's scoped view
// (`roadmapScope.ts`), never from the whole project. Unscoped, a surface names no
// focus and no recommendation, labels its list project-wide, and gives the literal
// Pull command; the words are `scopePhrases.ts`'s.

import { cardLine, cardPrefixed, cardText, cardWrapped } from "./card.ts";
import {
  candidateLines,
  formatCandidate,
  type PullCandidate,
  type RoadmapSnapshotItem,
  type RoadmapSnapshotReport,
  statusMarker,
} from "./pullCandidates.ts";
import { type ScopedPullCandidates, scopeFocus } from "./roadmapScope.ts";
import {
  candidateListHeader,
  NO_ITEM_PULLED_YET,
  noRecommendationLines,
  outsideCountLines,
} from "./scopePhrases.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

/** Python `_title_leaf`-by-hand: every renderer does `title.split("/")[-1].strip()`. */
function lastTitleSegment(title: string): string {
  const segments = title.split("/");
  return (segments[segments.length - 1] ?? "").trim();
}

/** Python `_format_project_recommendation`, for a recommendation that exists. */
function formatProjectRecommendation(candidate: PullCandidate): string {
  return `🟦[${candidate.code}] ${lastTitleSegment(candidate.title)} — recommended next pull`;
}

/**
 * Python `_project_focus_lines`, minus its `available candidates: none` line:
 * "What looks next?" now says what is left in the scope, so the focus does not
 * repeat it. The progress line strips the marker glyphs from `statusMarker`'s
 * output with three sequential replaces, so a status whose text itself contains
 * `◉ ` would lose it too. A focus with no status (a stated placeholder) has no
 * progress to show.
 */
function projectFocusLines(focus: RoadmapSnapshotItem | null): string[] {
  if (focus === null) return [cardText(NO_ITEM_PULLED_YET)];
  const lines = cardWrapped(`🟪[${focus.code}] ${focus.title}`);
  if (focus.status) {
    const marker = statusMarker(focus.status);
    const progress = marker.replace("◉ ", "").replace("○ ", "").replace("✓ ", "");
    lines.push(...cardWrapped(`progress: ${progress}`));
  }
  return lines;
}

/** The scoped candidate list: its header, the candidates, and what it leaves out. */
function candidateListLines(view: ScopedPullCandidates): string[] {
  return [
    cardText(candidateListHeader(view.scope)),
    ...cardPrefixed(candidateLines(view.shown), "-"),
    ...outsideCountLines(view).flatMap(cardWrapped),
  ];
}

/** The recommendation, formatted by the surface; or what stands in its place. */
function nextMoveLines(
  view: ScopedPullCandidates,
  format: (candidate: PullCandidate) => string,
): string[] {
  if (view.recommended !== null) return cardWrapped(format(view.recommended));
  return noRecommendationLines(view).flatMap(cardWrapped);
}

/** Python `render_project_position_report`, over the journey's scoped view. */
export function renderProjectPositionReport(
  report: RoadmapSnapshotReport,
  options: { view: ScopedPullCandidates; justMoved?: string | null },
): string {
  const { view } = options;
  const justMoved = options.justMoved ?? null;
  const focus = scopeFocus(report.items, view.scope);
  const lines: string[] = [
    "Roadmap",
    "",
    FRAME_TOP,
    "│        🧭  PROJECT POSITION                           │",
    FRAME_BLANK,
    cardText("Where are we now?"),
    ...projectFocusLines(focus),
    FRAME_BLANK,
  ];
  if (justMoved) {
    lines.push(cardText("What just moved?"), ...cardWrapped(justMoved), FRAME_BLANK);
  }
  lines.push(
    cardText("What looks next?"),
    ...nextMoveLines(view, formatProjectRecommendation),
    FRAME_BLANK,
    ...candidateListLines(view),
    FRAME_BLANK,
    ...cardWrapped("Choose a pull when ready."),
    FRAME_BOTTOM,
  );
  return wrapAriadSurface("project_position", `${lines.join("\n")}\n`);
}

/**
 * Python `render_roadmap_snapshot_report`.
 *
 * Since CR002 the focus is the journey's CV and the `current` row is the scoped
 * recommendation: one question, where Python asked two. Python chose `current` by
 * running `_recommend` over only the focus CV's OWN delivery candidates
 * (`code.startswith(f"{focus.code}.")`), a different question from the
 * report-level recommendation — so the two rows can
 * name different stories, and do whenever the recommended pull belongs to
 * another CV.
 */
export function renderRoadmapSnapshotReport(
  report: RoadmapSnapshotReport,
  options: { view: ScopedPullCandidates },
): string {
  const { view } = options;
  const focus = scopeFocus(report.items, view.scope);
  const result = view.shown.length > 0 ? "ready to pull" : "no pull candidates";
  const lines: string[] = [
    "ROADMAP SNAPSHOT",
    "Delivery field overview",
    "",
    "view                         overview",
    `result of roadmap-snapshot      ${result}`,
    "",
    FRAME_TOP,
  ];

  if (focus === null) {
    lines.push(cardLine("roadmap field", NO_ITEM_PULLED_YET));
  } else {
    lines.push(
      cardLine(`🟪[${focus.code}]  ${focus.title}`, focus.status ? statusMarker(focus.status) : ""),
      cardText(`value: ${focus.title}`),
      FRAME_BLANK,
    );
    const current = view.recommended;
    if (current !== null) {
      const codeTail = current.code.split(".").pop() ?? current.code;
      lines.push(
        cardLine(`   └─ 🟦[${codeTail}] ${lastTitleSegment(current.title)}`, "◉ current"),
        cardText("      progress: not started"),
        FRAME_BLANK,
      );
    }
    lines.push(cardText("      Backlog"));
    if (view.shown.length > 0) {
      for (const candidate of view.shown) {
        lines.push(cardText(`      ○ 🟦[${candidate.code}] ${lastTitleSegment(candidate.title)}`));
      }
    } else {
      lines.push(cardText("      none"));
    }
    lines.push(
      FRAME_BLANK,
      cardText("      Recently promoted from Exploration"),
      cardText("      none"),
      FRAME_BLANK,
      cardText("      Active constraints"),
      cardText("      ✕ do not start candidates automatically"),
      cardText("      ✓ Navigator explicitly chooses Pull"),
    );
  }

  lines.push(
    FRAME_BOTTOM,
    "",
    "source",
    report.source ?? "none",
    "",
    "boundary",
    "Roadmap was inspected only. No item was pulled. No lifecycle work was executed.",
  );
  return wrapAriadSurface("roadmap_snapshot", `${lines.join("\n")}\n`);
}

/** Python `render_pull_candidates_report`, over the journey's scoped view. */
export function renderPullCandidatesReport(view: ScopedPullCandidates): string {
  const lines: string[] = [
    "Delivery",
    "",
    FRAME_TOP,
    "│        🟪■  PULL CANDIDATES                            │",
    FRAME_BLANK,
    cardText("journey"),
    cardText(view.journey),
    FRAME_BLANK,
    cardText("method"),
    cardText(view.method),
    FRAME_BLANK,
    ...candidateListLines(view),
    FRAME_BLANK,
    cardText("recommended pull"),
    ...nextMoveLines(view, formatCandidate),
    FRAME_BLANK,
    cardText("boundary"),
    ...cardWrapped("No item was pulled. No lifecycle work was executed."),
    FRAME_BOTTOM,
  ];
  return wrapAriadSurface("pull_candidates", `${lines.join("\n")}\n`);
}
