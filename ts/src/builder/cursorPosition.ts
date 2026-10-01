// CR114 — where a delivery cursor stands, and what it accepts next.
//
// CR067 placed a cursor on the ribbon from a table in `lifecycleRefusal.ts`, beside
// the order of the story's events. The Builder resume chose its next actions from two
// other facts, whether a confirmation was pending and whether an item was active, and
// never read the event. So it offered Prepare at every position with nothing pending,
// a freshly pulled story's and a closed one's alike, and `build show`, which printed
// no list, could not disagree with it.
//
// This module is the one table of positions. Each event the runtime writes for an
// item names the ribbon stage a story draws after it, and the steps the runtime
// accepts next when nothing is pending. The story's event order is its story rows,
// read in order. The resume and `build show` both choose their list through
// `allowedNextActions`, and nothing else chooses it.
//
// Delivery Story events carry their steps and no stage: CR067 left them off the
// ribbon, never a guessed stage, and that holds. A position the table does not know
// is offered no lifecycle step, only the two inspections (CR114, D2): the same rule,
// applied to the list.

/** Every action a Builder surface can offer: one closed vocabulary (CR114, D1). */
export const NEXT_ACTIONS = [
  "adopt_method",
  "sync_cursor",
  "inspect_method",
  "inspect_roadmap",
  "pull_candidate_if_known",
  "answer_pending_confirmation",
  "prepare_active_item",
  "expand_active_item",
  "plan_active_item",
  "implement_active_item",
  "validate_active_item",
  "review_active_item_debt",
  "check_active_item_coherence",
  "close_active_item",
] as const;

export type NextAction = (typeof NEXT_ACTIONS)[number];

/** A journey that has adopted no method. */
export const NOT_ADOPTED_ACTIONS: readonly NextAction[] = ["adopt_method", "inspect_method"];

/** An adopted journey whose delivery cursor was never synced. */
export const NO_CURSOR_ACTIONS: readonly NextAction[] = ["sync_cursor", "inspect_method"];

/** No item pulled, or the item closed: the next move is a Pull. */
export const NO_ACTIVE_ITEM_ACTIONS: readonly NextAction[] = [
  "inspect_roadmap",
  "pull_candidate_if_known",
  "inspect_method",
];

/** A confirmation is pending: answering it is the one lifecycle move (CR105, A1). */
export const PENDING_CONFIRMATION_ACTIONS: readonly NextAction[] = [
  "answer_pending_confirmation",
  "inspect_method",
];

/** The read-only moves every open item's list ends with. */
const INSPECTIONS: readonly NextAction[] = ["inspect_roadmap", "inspect_method"];

interface Position {
  /** The ribbon stage a story stands at after the event; `null` off the ribbon. */
  readonly stage: string | null;
  /** The steps the runtime accepts next when nothing is pending, or `closed`. */
  readonly next: readonly NextAction[] | "closed";
}

/**
 * The positions, in the order a cursor reaches them: the story's rows first, then the
 * Delivery Story's. A row with no next step is one the runtime writes with a pending
 * confirmation, which outranks it. `template_preparation`, which `sync-cursor` writes,
 * is no item's position, so it has no row.
 */
const POSITIONS: ReadonlyArray<readonly [string, Position]> = [
  ["pull", { stage: "prepare", next: ["prepare_active_item"] }],
  ["prepare", { stage: "plan", next: ["plan_active_item"] }],
  ["plan", { stage: "plan", next: [] }],
  [
    "plan_approved",
    { stage: "implement", next: ["implement_active_item", "validate_active_item"] },
  ],
  ["implementation_complete", { stage: "validate", next: ["validate_active_item"] }],
  ["validate", { stage: "validate", next: [] }],
  ["validation_passed", { stage: "debt_review", next: ["review_active_item_debt"] }],
  ["review", { stage: "debt_review", next: [] }],
  [
    "review_complete",
    { stage: "done", next: ["check_active_item_coherence", "close_active_item"] },
  ],
  ["coherence", { stage: "done", next: [] }],
  ["coherence_complete", { stage: "done", next: ["close_active_item"] }],
  ["done", { stage: "done", next: [] }],
  ["done_complete", { stage: "done", next: "closed" }],
  ["expand", { stage: null, next: [] }],
  ["navigator_flow_unit_selected", { stage: null, next: [] }],
  ["delivery_story_plan", { stage: null, next: [] }],
  [
    "delivery_story_plan_approved",
    { stage: null, next: ["implement_active_item", "validate_active_item"] },
  ],
  ["delivery_story_validation", { stage: null, next: [] }],
  ["delivery_story_validation_complete", { stage: null, next: ["review_active_item_debt"] }],
  ["delivery_story_review_complete", { stage: null, next: ["close_active_item"] }],
  ["delivery_story_coherence_complete", { stage: null, next: ["close_active_item"] }],
  ["delivery_story_done_complete", { stage: null, next: "closed" }],
];

const POSITION_AFTER: ReadonlyMap<string, Position> = new Map(POSITIONS);

/** A prepared Delivery Story expands next rather than plans: Pull runs its Expand. */
const DELIVERY_STORY_PREPARED: Position = { stage: "expand", next: ["expand_active_item"] };

/** The story lifecycle's events, in the order a cursor reaches them: the story rows. */
export const STORY_LIFECYCLE_EVENTS: readonly string[] = POSITIONS.filter(
  ([, position]) => position.stage !== null,
).map(([event]) => event);

/** The cursor fields a position is read from. */
export interface CursorPositionView {
  readonly activeItem: string | null;
  readonly activeItemLevel: string | null;
  readonly pendingConfirmation: string | null;
  readonly lastDeliveryEvent: string | null;
}

function positionOf(
  cursor: Pick<CursorPositionView, "lastDeliveryEvent" | "activeItemLevel">,
): Position | null {
  const event = cursor.lastDeliveryEvent;
  if (event === null) return null;
  if (event === "prepare" && cursor.activeItemLevel === "delivery_story") {
    return DELIVERY_STORY_PREPARED;
  }
  return POSITION_AFTER.get(event) ?? null;
}

/**
 * The lifecycle stage the cursor stands at, for the ribbon; `null` for an event the
 * ribbon does not draw.
 */
export function lifecycleStageOf(
  cursor: Pick<CursorPositionView, "lastDeliveryEvent" | "activeItemLevel">,
): string | null {
  return positionOf(cursor)?.stage ?? null;
}

/**
 * What the cursor accepts next, in the order to offer it: the one list the resume and
 * `build show` print. No cursor is `null`; a journey that adopted no method is the
 * resume's own case, `NOT_ADOPTED_ACTIONS`, since `build show` refuses it.
 */
export function allowedNextActions(cursor: CursorPositionView | null): readonly NextAction[] {
  if (cursor === null) return NO_CURSOR_ACTIONS;
  if (cursor.pendingConfirmation) return PENDING_CONFIRMATION_ACTIONS;
  if (!cursor.activeItem) return NO_ACTIVE_ITEM_ACTIONS;
  const next = positionOf(cursor)?.next ?? [];
  if (next === "closed") return NO_ACTIVE_ITEM_ACTIONS;
  return [...next, ...INSPECTIONS];
}
