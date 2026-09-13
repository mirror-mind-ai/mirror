// CV22.DS7.US8 plateau 3 — consuming story authority, once.
//
// Port of `src/memory/builder/story_plan_preauthorization.py`.
//
// The consume is a compare-and-swap against the observed cursor, and every branch
// around it is a safety property:
//
//   * an already-consumed receipt returns `already_approved` and starts NO second
//     implementation, so a retried command is idempotent rather than additive;
//   * a lost CAS re-reads the cursor and returns `already_approved` if another
//     writer got there first, and otherwise refuses with `cursor_changed`;
//   * a mismatch invalidates the receipt BEFORE raising, so a refused authority
//     cannot be retried into acceptance;
//   * the refusal path still leaves the Plan checkpoint pending, which is what makes
//     "fall back to ordinary Navigator approval" true rather than aspirational.

import type { WritableDatabase } from "#db/database.ts";
import { cardText } from "./card.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  DeliveryCursorConflict,
  getDeliveryCursor,
  setDeliveryCursor,
  setTo,
} from "./deliveryCursor.ts";
import { FLOW_UNIT_STORY_BY_STORY } from "./flowUnit.ts";
import {
  invalidatePlanPreauthorization,
  PlanPreauthorizationMismatch,
  planPreauthorizationMismatchReason,
  STORY_PLAN_CONTRACT,
  STORY_PLAN_REQUIRED_SECTIONS,
  unfilledPlanSectionsFor,
} from "./planPreauthorization.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const STORY_LEVELS = new Set(["user_story", "technical_story"]);

/** Python `StoryPlanPreauthorizationReport`. */
export interface StoryPlanPreauthorizationReport {
  readonly cursor: BuilderDeliveryCursor;
  readonly status: string;
  readonly unfilledSections: readonly string[];
  readonly implementationStarted: boolean;
}

/** Python `_is_consumed_story_approval`: all six conditions, or it is not consumed. */
function isConsumedStoryApproval(cursor: BuilderDeliveryCursor): boolean {
  const receipt = cursor.planPreauthorization;
  return (
    receipt !== null &&
    receipt.status === "consumed" &&
    receipt.planContractVersion === STORY_PLAN_CONTRACT &&
    cursor.lastDeliveryEvent === "plan_approved" &&
    cursor.activeCheckpoint === null &&
    cursor.pendingConfirmation === null
  );
}

export interface ApproveWithAuthorityOptions {
  readonly journey: string;
  readonly method: string;
  readonly planArtifactPath: string | null;
}

/** Python `approve_story_plan_with_preauthorization`. */
export function approveStoryPlanWithPreauthorization(
  db: WritableDatabase,
  options: ApproveWithAuthorityOptions,
  deps: CursorWriteDeps,
): StoryPlanPreauthorizationReport {
  const { journey, method } = options;
  const cursor = getDeliveryCursor(db, journey);
  if (cursor === null) throw new Error("delivery cursor is required before story Plan approval");
  if (isConsumedStoryApproval(cursor)) {
    return {
      cursor,
      status: "already_approved",
      unfilledSections: [],
      implementationStarted: false,
    };
  }
  if (cursor.activeItemLevel === null || !STORY_LEVELS.has(cursor.activeItemLevel)) {
    throw new Error("story Plan preauthorization requires a User or Technical Story");
  }
  if (
    cursor.activeCheckpoint !== "after_plan" ||
    cursor.pendingConfirmation !== "navigator_approval"
  ) {
    throw new Error("story Plan approval requires a pending after_plan checkpoint");
  }

  const unfilled = unfilledPlanSectionsFor(options.planArtifactPath, STORY_PLAN_REQUIRED_SECTIONS);
  const mismatch = planPreauthorizationMismatchReason(cursor, {
    journey,
    method,
    flowUnit: FLOW_UNIT_STORY_BY_STORY,
    childWorkItems: [],
    planContractVersion: STORY_PLAN_CONTRACT,
    unfilledSections: unfilled,
  });
  if (mismatch !== null) {
    invalidatePlanPreauthorization(db, cursor, mismatch, deps);
    throw new PlanPreauthorizationMismatch(mismatch);
  }

  const receipt = cursor.planPreauthorization;
  // Unreachable: the mismatch guard establishes a pending receipt. Kept because
  // Python keeps it, and because the type system cannot see that.
  if (receipt === null) throw new PlanPreauthorizationMismatch("authorization_missing");

  let updated: BuilderDeliveryCursor;
  try {
    updated = setDeliveryCursor(
      db,
      {
        journey,
        method,
        activeItem: cursor.activeItem,
        activeItemTitle: cursor.activeItemTitle,
        activeItemLevel: cursor.activeItemLevel,
        activeCheckpoint: null,
        pendingConfirmation: null,
        lastDeliveryEvent: "plan_approved",
        cadenceProfile: cursor.cadenceProfile,
        cadenceLimits: cursor.cadenceLimits,
        granularityDecision: cursor.granularityDecision,
        navigatorFlowUnit: cursor.navigatorFlowUnit,
        childWorkItems: cursor.childWorkItems,
        aggregateCheckpointStatus: cursor.aggregateCheckpointStatus,
        cursorGeneration: cursor.cursorGeneration,
        planPreauthorization: setTo({ ...receipt, status: "consumed", reason: null }),
        expectedCursor: cursor,
        refreshProjection: false,
      },
      deps,
    );
  } catch (error) {
    if (!(error instanceof DeliveryCursorConflict)) throw error;
    const current = getDeliveryCursor(db, journey);
    if (current !== null && isConsumedStoryApproval(current)) {
      return {
        cursor: current,
        status: "already_approved",
        unfilledSections: [],
        implementationStarted: false,
      };
    }
    throw new PlanPreauthorizationMismatch("cursor_changed");
  }

  deps.requestProjectionRefresh?.(journey);
  return {
    cursor: updated,
    status: "approved",
    unfilledSections: unfilled,
    implementationStarted: true,
  };
}

/** Python `cancel_story_plan_preauthorization`. */
export function cancelStoryPlanPreauthorization(
  db: WritableDatabase,
  options: { journey: string; method: string },
  deps: CursorWriteDeps,
): BuilderDeliveryCursor {
  const cursor = getDeliveryCursor(db, options.journey);
  if (cursor === null) {
    throw new Error("delivery cursor is required before Plan preauthorization cancellation");
  }
  if (cursor.method !== options.method) {
    throw new Error("active Builder method does not match cancellation method");
  }
  if (cursor.activeItemLevel === null || !STORY_LEVELS.has(cursor.activeItemLevel)) {
    throw new Error("story Plan cancellation requires a User or Technical Story");
  }
  const receipt = cursor.planPreauthorization;
  if (receipt === null || receipt.status !== "pending") {
    throw new Error("pending Plan preauthorization is required before cancellation");
  }
  return invalidatePlanPreauthorization(db, cursor, "navigator_cancelled", deps);
}

/** Python `render_story_plan_preauthorization_recorded`. */
export function renderStoryPlanPreauthorizationRecorded(cursor: BuilderDeliveryCursor): string {
  const receipt = cursor.planPreauthorization;
  if (receipt === null) throw new Error("Plan preauthorization receipt is required");
  const body = `${[
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧭  PLAN PREAUTHORIZATION RECORDED              │",
    "│                                                        │",
    cardText("Authorized story"),
    cardText(receipt.activeItem),
    "│                                                        │",
    cardText("Story level"),
    cardText(receipt.activeItemLevel),
    "│                                                        │",
    cardText("Policy"),
    cardText(receipt.policy),
    "│                                                        │",
    cardText("Fixed stop"),
    cardText(receipt.stopBoundary),
    "│                                                        │",
    cardText("Boundary"),
    cardText("Single-use authority remains pending until the"),
    cardText("Driver completes the exact story Plan."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("plan_preauthorization_recorded", body);
}

/** Python `render_story_implementation_started`. */
export function renderStoryImplementationStarted(cursor: BuilderDeliveryCursor): string {
  const body = `${[
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🟧  IMPLEMENTATION STARTED                     │",
    "│                                                        │",
    cardText("Active story"),
    cardText(cursor.activeItem ?? "none"),
    "│                                                        │",
    cardText("Boundary"),
    cardText("Local implementation may proceed under the exact"),
    cardText("approved Plan and stops at Navigator Validation."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("implementation_started", body);
}

/** Python `render_story_preauthorization_already_consumed`. */
export function renderStoryPreauthorizationAlreadyConsumed(cursor: BuilderDeliveryCursor): string {
  const body = `${[
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        ✓  PLAN PREAUTHORIZATION ALREADY CONSUMED       │",
    "│                                                        │",
    cardText("Active story"),
    cardText(cursor.activeItem ?? "none"),
    "│                                                        │",
    cardText("Outcome"),
    cardText("No approval or implementation start was repeated."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("plan_preauthorization_already_consumed", body);
}

/** Python `render_story_plan_preauthorization_mismatch`: payload-free by construction. */
export function renderStoryPlanPreauthorizationMismatch(options: {
  activeItem: string | null;
  reason: string;
}): string {
  const body = `${[
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        ✕  PLAN PREAUTHORIZATION MISMATCH               │",
    "│                                                        │",
    cardText("Active story"),
    cardText(options.activeItem ?? "none"),
    "│                                                        │",
    cardText("Reason"),
    cardText(options.reason),
    "│                                                        │",
    cardText("Fallback"),
    cardText("Ordinary Navigator Plan approval remains required."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("plan_preauthorization_mismatch", body);
}
