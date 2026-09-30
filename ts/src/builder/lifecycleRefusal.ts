// CR067 with CR020 — where a story's delivery cursor stands, and refusals that say so.
//
// The story lifecycle's guards in `plan.ts` and `closure.ts` each test the cursor's
// last event by hand. This module is the one place that states the order those events
// come in, so a refusal can tell "not reached yet" from "already done" and a surface
// can place the cursor on the ribbon. The guards stay as written; a table-driven test
// runs every step against every event here, so the two expressions cannot drift apart.
//
// Delivery Story events are deliberately outside the table: a cursor holding one gets
// no stage marker and no already-complete refusal, never a guessed one.

import type { BuilderDeliveryCursor } from "./deliveryCursor.ts";

/** The story lifecycle's events, in the order a cursor reaches them. */
export const STORY_LIFECYCLE_EVENTS = [
  "pull",
  "prepare",
  "plan",
  "plan_approved",
  "implementation_complete",
  "validate",
  "validation_passed",
  "review",
  "review_complete",
  "coherence",
  "coherence_complete",
  "done",
  "done_complete",
] as const;

/** The ribbon stage a cursor stands at, by its last event (CR067's stage table). */
const STAGE_AFTER: Readonly<Record<string, string>> = {
  pull: "prepare",
  prepare: "plan",
  plan: "plan",
  plan_approved: "implement",
  implementation_complete: "validate",
  validate: "validate",
  validation_passed: "debt_review",
  review: "debt_review",
  review_complete: "done",
  coherence: "done",
  coherence_complete: "done",
  done: "done",
  done_complete: "done",
};

/**
 * The lifecycle stage the cursor stands at, for the ribbon; `null` for an event
 * outside the table. A prepared Delivery Story expands next rather than plans.
 */
export function lifecycleStageOf(
  cursor: Pick<BuilderDeliveryCursor, "lastDeliveryEvent" | "activeItemLevel">,
): string | null {
  const event = cursor.lastDeliveryEvent;
  if (event === null || !Object.hasOwn(STAGE_AFTER, event)) return null;
  if (event === "prepare" && cursor.activeItemLevel === "delivery_story") return "expand";
  return STAGE_AFTER[event] ?? null;
}

/** The story steps a lifecycle command can be refused at. */
export type LifecycleStep =
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
  plan: "plan",
  plan_approval: "plan_approved",
  validate: "validation_passed",
  debt_review: "review_complete",
  coherence: "coherence_complete",
  done: "done_complete",
};

const STEP_NAME: Readonly<Record<LifecycleStep, string>> = {
  plan: "Plan",
  plan_approval: "Plan approval",
  validate: "Validation",
  debt_review: "Debt Review",
  coherence: "Coherence",
  done: "Done",
};

/** True once the cursor has reached or passed the event that completes `step`. */
export function isAlreadyComplete(step: LifecycleStep, event: string | null): boolean {
  const order: readonly string[] = STORY_LIFECYCLE_EVENTS;
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
