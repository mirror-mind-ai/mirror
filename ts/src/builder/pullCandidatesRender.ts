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
//   `roadmap field … none`         57   (one long)
//   `  Backlog … none`             58   (two long)
//
// That is not a defect to fix here. The author padded them by eye against a
// terminal, where an astral-plane glyph occupies two columns but one code point,
// so the literals are visually aligned and numerically inconsistent. A port that
// normalizes them to 56 produces a prettier card and fails parity on four lines.
// They are copied verbatim and the golden grades them.

import { cardLine, cardPrefixed, cardText, cardWrapped } from "./card.ts";
import {
  candidateLines,
  focusItem,
  formatCandidate,
  type PullCandidate,
  type PullCandidatesReport,
  type RoadmapSnapshotItem,
  type RoadmapSnapshotReport,
  recommend,
  statusMarker,
} from "./pullCandidates.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

/** Python `_title_leaf`-by-hand: every renderer does `title.split("/")[-1].strip()`. */
function lastTitleSegment(title: string): string {
  const segments = title.split("/");
  return (segments[segments.length - 1] ?? "").trim();
}

/** Python `_format_project_recommendation`. */
function formatProjectRecommendation(candidate: PullCandidate | null): string {
  if (candidate === null) return "No pull candidate is available.";
  return `🟦[${candidate.code}] ${lastTitleSegment(candidate.title)} — recommended next pull`;
}

/**
 * Python `_project_focus_lines`. The progress line strips the marker glyphs from
 * `statusMarker`'s output with three sequential replaces, so a status whose text
 * itself contains `◉ ` would lose it too.
 */
function projectFocusLines(
  focus: RoadmapSnapshotItem | null,
  candidates: readonly PullCandidate[],
): string[] {
  if (focus === null) return [cardText("no roadmap focus")];
  const marker = statusMarker(focus.status);
  const lines = cardWrapped(`🟪[${focus.code}] ${focus.title}`);
  const progress = marker.replace("◉ ", "").replace("○ ", "").replace("✓ ", "");
  lines.push(...cardWrapped(`progress: ${progress}`));
  if (candidates.length === 0) lines.push(...cardWrapped("available candidates: none"));
  return lines;
}

/** Python `render_project_position_report`. */
export function renderProjectPositionReport(
  report: RoadmapSnapshotReport,
  options: { candidates?: readonly PullCandidate[]; justMoved?: string | null } = {},
): string {
  const candidates = options.candidates ?? [];
  const justMoved = options.justMoved ?? null;
  const focus = focusItem(report.items, candidates);
  const recommended = candidates.length > 0 ? recommend(candidates) : null;
  const lines: string[] = [
    "Roadmap",
    "",
    FRAME_TOP,
    "│        🧭  PROJECT POSITION                           │",
    FRAME_BLANK,
    cardText("Where are we now?"),
    ...projectFocusLines(focus, candidates),
    FRAME_BLANK,
  ];
  if (justMoved) {
    lines.push(cardText("What just moved?"), ...cardWrapped(justMoved), FRAME_BLANK);
  }
  lines.push(
    cardText("What looks next?"),
    ...cardWrapped(formatProjectRecommendation(recommended)),
    FRAME_BLANK,
    cardText("Available path"),
    ...cardPrefixed(candidateLines(candidates), "-"),
    FRAME_BLANK,
    ...cardWrapped("Choose a pull when ready."),
    FRAME_BOTTOM,
  );
  return wrapAriadSurface("project_position", `${lines.join("\n")}\n`);
}

/**
 * Python `render_roadmap_snapshot_report`.
 *
 * The `current` row is chosen by running `_recommend` over only the focus CV's
 * OWN delivery candidates (`code.startswith(f"{focus.code}.")`), which is a
 * different question from the report-level recommendation — so the two rows can
 * name different stories, and do whenever the recommended pull belongs to
 * another CV.
 */
export function renderRoadmapSnapshotReport(
  report: RoadmapSnapshotReport,
  options: { candidates?: readonly PullCandidate[] } = {},
): string {
  const candidates = options.candidates ?? [];
  const focus = focusItem(report.items, candidates);
  const result = candidates.length > 0 ? "ready to pull" : "no pull candidates";
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
    lines.push(
      "│ roadmap field                                      none │",
      FRAME_BLANK,
      "│   Backlog                                           none │",
    );
  } else {
    lines.push(
      cardLine(`🟪[${focus.code}]  ${focus.title}`, statusMarker(focus.status)),
      cardText(`value: ${focus.title}`),
      FRAME_BLANK,
    );
    const deliveryCandidates = candidates.filter((candidate) =>
      candidate.code.startsWith(`${focus.code}.`),
    );
    const current = deliveryCandidates.length > 0 ? recommend(deliveryCandidates) : null;
    if (current !== null) {
      const codeTail = current.code.split(".").pop() ?? current.code;
      lines.push(
        cardLine(`   └─ 🟦[${codeTail}] ${lastTitleSegment(current.title)}`, "◉ current"),
        cardText("      progress: not started"),
        FRAME_BLANK,
      );
    }
    lines.push(cardText("      Backlog"));
    if (deliveryCandidates.length > 0) {
      for (const candidate of deliveryCandidates) {
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

/** Python `render_pull_candidates_report`. */
export function renderPullCandidatesReport(report: PullCandidatesReport): string {
  const lines: string[] = [
    "Delivery",
    "",
    FRAME_TOP,
    "│        🟪■  PULL CANDIDATES                            │",
    FRAME_BLANK,
    cardText("journey"),
    cardText(report.journey),
    FRAME_BLANK,
    cardText("method"),
    cardText(report.method),
    FRAME_BLANK,
    cardText("available candidates"),
    ...cardPrefixed(candidateLines(report.candidates), "-"),
    FRAME_BLANK,
    cardText("recommended pull"),
    ...cardWrapped(report.recommended ? formatCandidate(report.recommended) : "none"),
    FRAME_BLANK,
    cardText("boundary"),
    ...cardWrapped("No item was pulled. No lifecycle work was executed."),
    FRAME_BOTTOM,
  ];
  return wrapAriadSurface("pull_candidates", `${lines.join("\n")}\n`);
}
