// CR067 with CR020 — refusals that say where a story's delivery cursor stands.
//
// The story lifecycle's guards in `plan.ts` and `closure.ts` each test the cursor's
// last event by hand. This module states which event completes each step, so a refusal
// can tell "not reached yet" from "already done". The order those events come in is
// the table of positions in `cursorPosition.ts` (CR114), which also places the cursor
// on the ribbon and names what it accepts next. The guards stay as written; a
// table-driven test runs every step against every event, so the two expressions cannot
// drift apart.
//
// Delivery Story events are outside the order: a cursor holding one gets no
// already-complete refusal, never a guessed one.

import { STORY_LIFECYCLE_EVENTS } from "./cursorPosition.ts";
import type { BuilderDeliveryCursor } from "./deliveryCursor.ts";

/** The story steps a lifecycle command can be refused at. */
export type LifecycleStep =
  | "prepare"
  | "plan"
  | "plan_approval"
  | "validate"
  | "debt_review"
  | "coherence"
  | "done";

/** Why a step was refused. Only `already_complete` is decided by this module. */
export type RefusalKind =
  | "already_complete"
  | "pending_confirmation"
  | "not_reached"
  | "missing_evidence";

const COMPLETING_EVENT: Readonly<Record<LifecycleStep, string>> = {
  // CR114 (D3): Prepare is complete once the cursor reaches Plan; Prepare at Prepare
  // runs again, which rewrites only what Prepare wrote.
  prepare: "plan",
  plan: "plan",
  plan_approval: "plan_approved",
  validate: "validation_passed",
  debt_review: "review_complete",
  coherence: "coherence_complete",
  done: "done_complete",
};

const STEP_NAME: Readonly<Record<LifecycleStep, string>> = {
  prepare: "Prepare",
  plan: "Plan",
  plan_approval: "Plan approval",
  validate: "Validation",
  debt_review: "Debt Review",
  coherence: "Coherence",
  done: "Done",
};

/** True once the cursor has reached or passed the event that completes `step`. */
export function isAlreadyComplete(step: LifecycleStep, event: string | null): boolean {
  const order = STORY_LIFECYCLE_EVENTS;
  const at = event === null ? -1 : order.indexOf(event);
  return at !== -1 && at >= order.indexOf(COMPLETING_EVENT[step]);
}

/** A lifecycle step refused before any change, with its reason's identity. */
export class LifecycleRefusal extends Error {
  readonly step: LifecycleStep;
  readonly kind: RefusalKind;

  constructor(step: LifecycleStep, kind: RefusalKind, message: string) {
    super(message);
    this.name = "LifecycleRefusal";
    this.step = step;
    this.kind = kind;
  }
}

/**
 * Throw when `step` is already complete for the cursor's item. Every guard calls this
 * first, so a finished step is never refused with a precondition that holds.
 */
export function refuseIfAlreadyComplete(
  step: LifecycleStep,
  cursor: Pick<BuilderDeliveryCursor, "activeItem" | "lastDeliveryEvent" | "pendingConfirmation">,
): void {
  if (!isAlreadyComplete(step, cursor.lastDeliveryEvent)) return;
  const pending = cursor.pendingConfirmation ? `, pending ${cursor.pendingConfirmation}` : "";
  throw new LifecycleRefusal(
    step,
    "already_complete",
    `${STEP_NAME[step]} is already complete for ${cursor.activeItem}: ` +
      `the cursor is at ${cursor.lastDeliveryEvent}${pending}.`,
  );
}
