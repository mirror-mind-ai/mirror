// CV22.DS7.US8 plateau 1 — the `■ BUILDER RESUME` surface.
//
// Port of `src/memory/builder/resume_surface.py`, plus the pure half of
// `resume_state.py`: the three allowed-next-action tuples and the rule that picks
// between them. The DB-backed composition (`read_builder_resume_state`) arrives in
// plateau 2 with the delivery cursor, because the cursor's reader and writer share
// one serialization and D2's revert argument rests on those bytes being symmetric.
//
// Three conditional shapes a port merges by accident:
//
//   * the `reason` block renders only when a reason exists;
//   * `release intent` needs BOTH `release_intent` AND
//     `release_intent_delivery_story` — `and`, not `or`, so a cursor carrying one
//     of them shows neither;
//   * `_last_refinement_event` reports `"none"` whenever there is no active
//     Refinement Story, EVEN WHEN an event is recorded. Reading the field
//     directly is the obvious port and it is wrong.
//
// `_resume_phase` exists in Python and is never called by anything. It is not
// ported: dead code that the surface does not reach is not parity surface, and
// carrying it forward would import a maintenance obligation with no observable
// behavior. Recorded in the story's debt list instead.

import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import type { WorkbenchSnapshotView } from "./refinementField.ts";
import type { RoadmapPosition } from "./roadmapPosition.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

/** Python `NO_ACTIVE_ITEM_ACTIONS`. */
export const NO_ACTIVE_ITEM_ACTIONS = [
  "inspect_roadmap",
  "pull_candidate_if_known",
  "inspect_method",
] as const;

/** Python `ACTIVE_ITEM_ACTIONS`. */
export const ACTIVE_ITEM_ACTIONS = [
  "prepare_active_item",
  "inspect_roadmap",
  "inspect_method",
] as const;

/** Python `PENDING_CONFIRMATION_ACTIONS`. */
export const PENDING_CONFIRMATION_ACTIONS = [
  "answer_pending_confirmation",
  "inspect_method",
] as const;

/** The cursor fields the resume surface reads. */
export interface ResumeCursorView {
  readonly activeItem: string | null;
  readonly activeCheckpoint: string | null;
  readonly pendingConfirmation: string | null;
  readonly lastDeliveryEvent: string | null;
  readonly releaseIntent: string | null;
  readonly releaseIntentDeliveryStory: string | null;
}

/** Python `BuilderResumeState`. */
export interface BuilderResumeState {
  readonly journey: string;
  readonly adoptedMethod: string | null;
  readonly cursor: ResumeCursorView | null;
  readonly resumable: boolean;
  readonly reason: string | null;
  readonly allowedNextActions: readonly string[];
  readonly refinement: WorkbenchSnapshotView | null;
}

/**
 * Python's branch inside `read_builder_resume_state`: pending confirmation wins
 * over an active item, which wins over neither.
 */
export function selectAllowedNextActions(cursor: ResumeCursorView): readonly string[] {
  if (cursor.pendingConfirmation) return PENDING_CONFIRMATION_ACTIONS;
  if (cursor.activeItem) return ACTIVE_ITEM_ACTIONS;
  return NO_ACTIVE_ITEM_ACTIONS;
}

/** Python `_format_roadmap_position`. */
function formatRoadmapPosition(position: RoadmapPosition | null): string {
  if (position === null) return "none";
  return `${position.code} — ${position.title} (${position.status}) [${position.path}]`;
}

/** Python `_release_intent_lines`: both fields, or no block at all. */
function releaseIntentLines(cursor: ResumeCursorView | null): string[] {
  const intent = cursor?.releaseIntent ?? null;
  const deliveryStory = cursor?.releaseIntentDeliveryStory ?? null;
  if (!intent || !deliveryStory) return [];
  return [
    FRAME_BLANK,
    cardText("release intent"),
    ...cardWrapped(`${deliveryStory}: ${intent}`),
    ...cardWrapped("intent is not release authorization"),
  ];
}

/** Python `_last_refinement_event`: `"none"` unless an active RS exists. */
function lastRefinementEvent(refinement: WorkbenchSnapshotView | null): string {
  if (refinement === null || refinement.activeRefinementStory === null) return "none";
  return refinement.lastRefinementEvent || "none";
}

/** Python `_next_refinement_move`. */
function nextRefinementMove(refinement: WorkbenchSnapshotView): string {
  if (refinement.activeChangeRequest !== null) return "continue active Change Request";
  if (refinement.activeRefinementStory !== null) {
    return "select next Change Request or review Refinement Story";
  }
  return "none";
}

/** Python `_refinement_field_lines`, all three shapes. */
function refinementFieldLines(
  state: BuilderResumeState,
  canonicalRefinementIndex: string | null,
): string[] {
  if (canonicalRefinementIndex) {
    return [
      cardText("authority: project files"),
      ...cardWrapped(`index: ${canonicalRefinementIndex}`),
    ];
  }
  const refinement = state.refinement;
  if (refinement === null) {
    return [cardText("active RS: none"), cardText("active CR: none")];
  }
  const activeRs = refinement.activeRefinementStory
    ? `${refinement.activeRefinementStory.displayCode}: ${refinement.activeRefinementStory.title}`
    : "none";
  const activeCr = refinement.activeChangeRequest
    ? `${refinement.activeChangeRequest.displayCode}: ${refinement.activeChangeRequest.title}`
    : "none";
  return [
    ...cardWrapped(`active RS: ${activeRs}`),
    ...cardWrapped(`active CR: ${activeCr}`),
    cardText(`last refinement event: ${lastRefinementEvent(refinement)}`),
    ...cardWrapped(`next refinement move: ${nextRefinementMove(refinement)}`),
  ];
}

/** Python `render_builder_resume_surface`. */
export function renderBuilderResumeSurface(
  state: BuilderResumeState,
  options: {
    roadmapPosition?: RoadmapPosition | null;
    canonicalRefinementIndex?: string | null;
  } = {},
): string {
  const roadmapPosition = options.roadmapPosition ?? null;
  const canonicalRefinementIndex = options.canonicalRefinementIndex ?? null;
  const cursor = state.cursor;
  const lines: string[] = [
    "Delivery",
    "",
    FRAME_TOP,
    "│        ■  BUILDER RESUME                               │",
    FRAME_BLANK,
    cardText("journey"),
    cardText(state.journey),
    FRAME_BLANK,
    cardText("adopted method"),
    cardText(state.adoptedMethod || "none"),
    FRAME_BLANK,
    cardText("resumable"),
    cardText(state.resumable ? "yes" : "no"),
  ];
  if (state.reason) {
    lines.push(FRAME_BLANK, cardText("reason"), ...cardWrapped(state.reason));
  }
  lines.push(
    FRAME_BLANK,
    cardText("roadmap position"),
    ...cardWrapped(formatRoadmapPosition(roadmapPosition)),
    FRAME_BLANK,
    cardText("active item"),
    cardText(cursor?.activeItem || "none"),
    FRAME_BLANK,
    cardText("active checkpoint"),
    cardText(cursor?.activeCheckpoint || "none"),
    FRAME_BLANK,
    cardText("pending confirmation"),
    cardText(cursor?.pendingConfirmation || "none"),
    FRAME_BLANK,
    cardText("last delivery event"),
    cardText(cursor?.lastDeliveryEvent || "none"),
    ...releaseIntentLines(cursor),
    FRAME_BLANK,
    cardText("🧰 Refinement field"),
    ...refinementFieldLines(state, canonicalRefinementIndex),
    FRAME_BLANK,
    cardText("allowed next actions"),
    ...cardPrefixed(state.allowedNextActions, "-"),
    FRAME_BLANK,
    cardText("boundary"),
    ...cardWrapped("Builder resumes context only; no story lifecycle work was executed."),
    FRAME_BOTTOM,
  );
  return wrapAriadSurface("builder_resume", `${lines.join("\n")}\n`);
}
