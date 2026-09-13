// CV22.DS7.US8 plateau 2 — the implementation guard.
//
// Port of `assert_implementation_allowed`,
// `render_implementation_guard_allowed`, and
// `render_implementation_guard_blocked` from `src/memory/builder/lifecycle.py`.
// This is the leaf `build check-implementation` answers, and the reason it moved
// out of plateau 1: it reads the delivery cursor.
//
// It is not a boolean. Four outcomes, and the order of the checks decides which
// message a Navigator sees:
//
//   1. no cursor at all                       -> requires a delivery cursor
//   2. ANY pending confirmation               -> blocked on that confirmation,
//      even when the Plan is approved, because an unanswered checkpoint outranks
//      an approval
//   3. `last_delivery_event == "plan_approved"` -> allowed
//   4. the Delivery Story combination        -> allowed, but only with ALL FOUR
//      conditions: event `delivery_story_plan_approved`, level `delivery_story`,
//      flow unit `delivery_story`, and `plan:approved` present in the aggregate
//      checkpoint status. Miss any one and the generic refusal is what prints.
//
// Note what is NOT required: an active item. A cursor whose event is
// `plan_approved` with no active item is ALLOWED, and the surface renders
// `active item / none`. That reads like an oversight and is Python's behavior.

import type { Database } from "#db/database.ts";
import { cardText, cardWrapped } from "./card.ts";
import type { BuilderDeliveryCursor } from "./deliveryCursor.ts";
import { getDeliveryCursor } from "./deliveryCursor.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";
const GUARD_TITLE = "│        🟧■  IMPLEMENTATION GUARD                       │";

/** Python's `PermissionError` from the guard. */
export class ImplementationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImplementationBlockedError";
  }
}

/** Python `_has_approved_delivery_story_plan`: all four conditions. */
export function hasApprovedDeliveryStoryPlan(cursor: BuilderDeliveryCursor): boolean {
  return (
    cursor.lastDeliveryEvent === "delivery_story_plan_approved" &&
    cursor.activeItemLevel === "delivery_story" &&
    cursor.navigatorFlowUnit === "delivery_story" &&
    cursor.aggregateCheckpointStatus.includes("plan:approved")
  );
}

/** Python `assert_implementation_allowed`. */
export function assertImplementationAllowed(db: Database, journey: string): BuilderDeliveryCursor {
  const normalized = typeof journey === "string" ? journey.trim() : "";
  if (!normalized) throw new Error("journey must not be empty");
  const cursor = getDeliveryCursor(db, normalized);
  if (cursor === null) {
    throw new ImplementationBlockedError("Implementation requires a Builder delivery cursor");
  }
  if (cursor.pendingConfirmation) {
    throw new ImplementationBlockedError(
      `Implementation is blocked: pending confirmation ${cursor.pendingConfirmation}.`,
    );
  }
  if (cursor.lastDeliveryEvent === "plan_approved") return cursor;
  if (hasApprovedDeliveryStoryPlan(cursor)) return cursor;
  throw new ImplementationBlockedError(
    "Implementation is blocked: approved Plan is required before Implement.",
  );
}

/** Python `render_implementation_guard_allowed`. */
export function renderImplementationGuardAllowed(cursor: BuilderDeliveryCursor): string {
  const body = [
    "Delivery",
    renderLifecycleRibbon("implement"),
    "",
    FRAME_TOP,
    GUARD_TITLE,
    FRAME_BLANK,
    cardText("status"),
    cardText("allowed"),
    FRAME_BLANK,
    cardText("active item"),
    cardText(cursor.activeItem || "none"),
    FRAME_BLANK,
    cardText("last delivery event"),
    cardText(cursor.lastDeliveryEvent || "none"),
    FRAME_BLANK,
    cardText("boundary"),
    ...cardWrapped("Implementation may begin under the approved Plan contract."),
    FRAME_BOTTOM,
  ].join("\n");
  return wrapAriadSurface("implementation_guard", `${body}\n`);
}

/** Python `render_implementation_guard_blocked`. */
export function renderImplementationGuardBlocked(reason: string): string {
  const body = [
    "Delivery",
    renderLifecycleRibbon("implement"),
    "",
    FRAME_TOP,
    GUARD_TITLE,
    FRAME_BLANK,
    cardText("status"),
    cardText("blocked"),
    FRAME_BLANK,
    cardText("missing checkpoint"),
    ...cardWrapped(reason),
    FRAME_BLANK,
    cardText("boundary"),
    ...cardWrapped("No implementation files may be mutated until the guard allows Implement."),
    FRAME_BOTTOM,
  ].join("\n");
  return wrapAriadSurface("implementation_guard", `${body}\n`);
}
