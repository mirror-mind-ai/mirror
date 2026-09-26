// CV22.DS7.US8 plateau 5 — the Delivery Story Plan checkpoint and its approval.
//
// Port of `src/memory/builder/delivery_story_plan.py`.
//
// This is the aggregate face of Plan: one checkpoint over a whole Delivery Story
// and its child work packages, chosen by the Navigator through `set-flow-unit`.
// The story-level Plan in `plan.ts` stays exactly as it was — the two are separate
// state machines over the same cursor, and the flow unit decides which one may run.
//
// Three things a port gets wrong here, all pinned by the corpus:
//
//   1. **`replaceStatus` APPENDS.** `aggregate_checkpoint_status` is an ordered
//      list cell, and replacing an entry removes it and pushes the new value to the
//      END. Re-validating after a debt review therefore REORDERS the list without
//      changing its set — and the cursor's compare-and-swap matches on the
//      serialized bytes, so an in-place replace passes every set-wise assertion and
//      breaks the swap of a cursor the Python engine wrote.
//   2. **`plan.md` is preserved, not upserted.** Python's own docstring says it is
//      "upserted on every call"; both branches of its `if report.status ==
//      "approved"` guard write only `if not plan_existed`, so the branches are
//      identical and the file survives. The corpus pins the CODE
//      (`delivery_story_plan_preserves_authored_plan`), and this comment exists so
//      nobody ports the docstring.
//   3. **Approval under authority uses compare-and-swap.** `expectedCursor` is
//      passed only on the preauthorized path, and a conflict there is answered by
//      re-reading: a concurrent writer that already consumed the receipt yields
//      `already_approved`, anything else is a bounded mismatch. That branch cannot
//      be reached from the corpus (the replay has no way to interpose a write
//      between the read and the swap), so it is graded by an injected-conflict test
//      instead, and declared as corpus-unreachable rather than implied.

import type { WritableDatabase } from "#db/database.ts";
import { pyStrip } from "#util/pythonText.ts";
import type { MaterializedArtifact } from "./artifacts/artifactSurfaces.ts";
import {
  unfilledDeliveryStoryPlanSections,
  writeDeliveryStoryPackage,
} from "./artifacts/deliveryStoryArtifacts.ts";
import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  DeliveryCursorConflict,
  getDeliveryCursor,
  type PlanPreauthorizationReceipt,
  setDeliveryCursor,
} from "./deliveryCursor.ts";
import { FLOW_UNIT_DELIVERY_STORY } from "./flowUnit.ts";
import {
  createPlanPreauthorizationReceipt,
  DELIVERY_STORY_PLAN_CONTRACT,
  invalidatePlanPreauthorization,
  PlanPreauthorizationMismatch,
  PREAUTHORIZATION_STOP,
  planPreauthorizationMismatchReason,
} from "./planPreauthorization.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

export interface DeliveryStoryPlanReport {
  readonly journey: string;
  readonly method: string;
  readonly deliveryStory: string;
  readonly deliveryStoryTitle: string | null;
  readonly childWorkItems: readonly string[];
  readonly objective: string;
  readonly status: string;
  readonly cursor: BuilderDeliveryCursor;
  readonly planArtifactPath: string | null;
  readonly materializedArtifacts: readonly MaterializedArtifact[];
  readonly unfilledSections: readonly string[];
  readonly implementationStarted: boolean;
}

/**
 * Python `_replace_status`.
 *
 * Keep every entry whose prefix differs, then APPEND. Shared with
 * `deliveryStoryClosure.ts`, which needs the identical rule.
 */
export function replaceStatus(
  existing: readonly string[],
  checkpoint: string,
  status: string,
): string[] {
  const prefix = `${checkpoint}:`;
  return [...existing.filter((item) => !item.startsWith(prefix)), `${checkpoint}:${status}`];
}

/** Python `_normalize_items`: strip, drop empties, preserve order. */
function normalizeItems(items: readonly string[]): string[] {
  return items.map((item) => pyStrip(item)).filter((item) => item !== "");
}

export interface PlanDeliveryStoryOptions {
  readonly journey: string;
  readonly method: string;
  readonly objective: string;
  readonly childWorkItems?: readonly string[];
  readonly planArtifactPath?: string | null;
  /** The project the package must stay inside (CR079). */
  readonly projectRoot?: string | null;
  readonly preauthorize?: boolean;
  readonly stopBoundary?: string;
}

/**
 * Python `plan_delivery_story_checkpoint`.
 *
 * The four guards run in Python's order, and the order is behavior: cursor, then
 * level, then flow unit, then active item — so a story-level cursor under
 * `delivery_story` flow reports the LEVEL, not the flow unit.
 */
export function planDeliveryStoryCheckpoint(
  db: WritableDatabase,
  options: PlanDeliveryStoryOptions,
  deps: CursorWriteDeps,
): DeliveryStoryPlanReport {
  const cursor = getDeliveryCursor(db, options.journey);
  if (cursor === null) {
    throw new Error("delivery cursor is required before Delivery Story Plan");
  }
  if (cursor.activeItemLevel !== "delivery_story") {
    throw new Error("Delivery Story Plan requires an active Delivery Story");
  }
  if (cursor.navigatorFlowUnit !== FLOW_UNIT_DELIVERY_STORY) {
    throw new Error("Delivery Story Plan requires navigator_flow_unit=delivery_story");
  }
  if (!cursor.activeItem) {
    throw new Error("active Delivery Story is required before Delivery Story Plan");
  }
  const requested = normalizeItems(options.childWorkItems ?? []);
  const children = requested.length > 0 ? requested : [...cursor.childWorkItems];
  if (children.length === 0) {
    throw new Error("Delivery Story Plan requires at least one child work item");
  }
  const objective = pyStrip(options.objective);
  if (objective === "") {
    throw new Error("Delivery Story Plan objective must not be empty");
  }
  const stopBoundary = options.stopBoundary ?? PREAUTHORIZATION_STOP;
  let receipt: PlanPreauthorizationReceipt | null = null;
  if (options.preauthorize) {
    if (stopBoundary !== PREAUTHORIZATION_STOP) {
      throw new Error("unsupported Plan preauthorization stop boundary");
    }
    receipt = createPlanPreauthorizationReceipt(cursor, {
      method: options.method,
      childWorkItems: children,
      planContractVersion: DELIVERY_STORY_PLAN_CONTRACT,
      stopBoundary,
    });
  }
  const updated = setDeliveryCursor(
    db,
    {
      journey: options.journey,
      method: options.method,
      activeItem: cursor.activeItem,
      activeItemTitle: cursor.activeItemTitle,
      activeItemLevel: cursor.activeItemLevel,
      activeCheckpoint: "after_delivery_story_plan",
      pendingConfirmation: "navigator_delivery_story_plan_approval",
      lastDeliveryEvent: "delivery_story_plan",
      cadenceProfile: cursor.cadenceProfile,
      cadenceLimits: cursor.cadenceLimits,
      granularityDecision: cursor.granularityDecision,
      navigatorFlowUnit: cursor.navigatorFlowUnit,
      childWorkItems: children,
      aggregateCheckpointStatus: replaceStatus(cursor.aggregateCheckpointStatus, "plan", "pending"),
      cursorGeneration: cursor.cursorGeneration,
      planPreauthorization: { kind: "set", value: receipt },
    },
    deps,
  );
  const report: DeliveryStoryPlanReport = {
    journey: options.journey,
    method: options.method,
    deliveryStory: cursor.activeItem,
    deliveryStoryTitle: cursor.activeItemTitle,
    childWorkItems: children,
    objective,
    status: "pending_approval",
    cursor: updated,
    planArtifactPath: options.planArtifactPath ?? null,
    materializedArtifacts: [],
    unfilledSections: [],
    implementationStarted: false,
  };
  const materialized = materializePackage(report, options.projectRoot);
  return { ...report, materializedArtifacts: materialized };
}

export interface ApproveDeliveryStoryPlanOptions {
  readonly journey: string;
  readonly method: string;
  readonly planArtifactPath?: string | null;
  /** The project the package must stay inside (CR079). */
  readonly projectRoot?: string | null;
  readonly usePreauthorization?: boolean;
}

/** Python `_is_consumed_approval`: the idempotence test for a repeated consume. */
function isConsumedApproval(cursor: BuilderDeliveryCursor): boolean {
  const receipt = cursor.planPreauthorization;
  return (
    receipt !== null &&
    receipt.status === "consumed" &&
    cursor.lastDeliveryEvent === "delivery_story_plan_approved" &&
    cursor.aggregateCheckpointStatus.includes("plan:approved")
  );
}

function alreadyApprovedReport(
  cursor: BuilderDeliveryCursor,
  options: ApproveDeliveryStoryPlanOptions,
): DeliveryStoryPlanReport {
  return {
    journey: options.journey,
    method: options.method,
    deliveryStory: cursor.activeItem ?? "",
    deliveryStoryTitle: cursor.activeItemTitle,
    childWorkItems: cursor.childWorkItems,
    objective: "Delivery Story Plan was already approved.",
    status: "already_approved",
    cursor,
    planArtifactPath: options.planArtifactPath ?? null,
    materializedArtifacts: [],
    unfilledSections: [],
    implementationStarted: false,
  };
}

/** Python `approve_delivery_story_plan`. */
export function approveDeliveryStoryPlan(
  db: WritableDatabase,
  options: ApproveDeliveryStoryPlanOptions,
  deps: CursorWriteDeps,
): DeliveryStoryPlanReport {
  const usePreauthorization = options.usePreauthorization ?? false;
  const cursor = getDeliveryCursor(db, options.journey);
  if (cursor === null) {
    throw new Error("delivery cursor is required before Delivery Story Plan approval");
  }
  if (usePreauthorization && isConsumedApproval(cursor)) {
    return alreadyApprovedReport(cursor, options);
  }
  if (cursor.activeCheckpoint !== "after_delivery_story_plan") {
    throw new Error(
      "Delivery Story Plan approval requires an after_delivery_story_plan checkpoint",
    );
  }
  if (cursor.pendingConfirmation !== "navigator_delivery_story_plan_approval") {
    throw new Error("Delivery Story Plan approval requires navigator approval");
  }
  if (!cursor.activeItem) {
    throw new Error("active Delivery Story is required before Delivery Story Plan approval");
  }
  // The DS rule, not the story rule: see `unfilledDeliveryStoryPlanSections`.
  const unfilled = unfilledDeliveryStoryPlanSections(options.planArtifactPath ?? null);
  if (usePreauthorization) {
    const mismatch = planPreauthorizationMismatchReason(cursor, {
      journey: options.journey,
      method: options.method,
      flowUnit: FLOW_UNIT_DELIVERY_STORY,
      childWorkItems: cursor.childWorkItems,
      planContractVersion: DELIVERY_STORY_PLAN_CONTRACT,
      unfilledSections: unfilled,
    });
    if (mismatch !== null) {
      invalidatePlanPreauthorization(db, cursor, mismatch, deps);
      throw new PlanPreauthorizationMismatch(mismatch);
    }
  }
  let receipt = cursor.planPreauthorization;
  if (receipt !== null && receipt.status === "pending") {
    receipt = {
      ...receipt,
      status: usePreauthorization ? "consumed" : "invalidated",
      reason: usePreauthorization ? null : "ordinary_approval_used",
    };
  }
  let updated: BuilderDeliveryCursor;
  try {
    updated = setDeliveryCursor(
      db,
      {
        journey: options.journey,
        method: options.method,
        activeItem: cursor.activeItem,
        activeItemTitle: cursor.activeItemTitle,
        activeItemLevel: cursor.activeItemLevel,
        activeCheckpoint: null,
        pendingConfirmation: null,
        lastDeliveryEvent: "delivery_story_plan_approved",
        cadenceProfile: cursor.cadenceProfile,
        cadenceLimits: cursor.cadenceLimits,
        granularityDecision: cursor.granularityDecision,
        navigatorFlowUnit: cursor.navigatorFlowUnit,
        childWorkItems: cursor.childWorkItems,
        aggregateCheckpointStatus: replaceStatus(
          cursor.aggregateCheckpointStatus,
          "plan",
          "approved",
        ),
        cursorGeneration: cursor.cursorGeneration,
        planPreauthorization: { kind: "set", value: receipt },
        expectedCursor: usePreauthorization ? cursor : null,
      },
      deps,
    );
  } catch (error) {
    if (!(error instanceof DeliveryCursorConflict)) throw error;
    // Corpus-unreachable by construction: reaching it needs a write between the
    // read above and the swap. Graded by an injected-conflict test instead.
    const current = getDeliveryCursor(db, options.journey);
    if (usePreauthorization && current !== null && isConsumedApproval(current)) {
      return alreadyApprovedReport(current, options);
    }
    if (usePreauthorization) {
      throw new PlanPreauthorizationMismatch("cursor_changed");
    }
    throw new Error("delivery cursor changed before Plan approval");
  }
  const report: DeliveryStoryPlanReport = {
    journey: options.journey,
    method: options.method,
    deliveryStory: cursor.activeItem,
    deliveryStoryTitle: cursor.activeItemTitle,
    childWorkItems: cursor.childWorkItems,
    objective: "Delivery Story Plan approved.",
    status: "approved",
    cursor: updated,
    planArtifactPath: options.planArtifactPath ?? null,
    materializedArtifacts: [],
    unfilledSections: [],
    implementationStarted: true,
  };
  const materialized = materializePackage(report, options.projectRoot);
  return { ...report, materializedArtifacts: materialized, unfilledSections: unfilled };
}

/** Python `cancel_delivery_story_plan_preauthorization`. */
export function cancelDeliveryStoryPlanPreauthorization(
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
  const receipt = cursor.planPreauthorization;
  if (receipt === null || receipt.status !== "pending") {
    throw new Error("pending Plan preauthorization is required before cancellation");
  }
  invalidatePlanPreauthorization(db, cursor, "navigator_cancelled", deps);
  const cancelled = getDeliveryCursor(db, options.journey);
  if (cancelled === null) {
    throw new Error("delivery cursor disappeared during cancellation");
  }
  return cancelled;
}

// --- package materialization ------------------------------------------------

/**
 * Python `_write_delivery_story_package`, called with the report's own plan path.
 *
 * Both branches of Python's `status == "approved"` test write `plan.md` only when
 * it is absent, so the branches are IDENTICAL and an authored plan survives both
 * Plan and approval. Python's docstring claims an upsert; the code does not. The
 * writer keeps one branch, and the corpus proves it is the right one.
 */
function materializePackage(
  report: DeliveryStoryPlanReport,
  projectRoot: string | null | undefined,
): readonly MaterializedArtifact[] {
  const planPath = report.planArtifactPath;
  if (planPath === null) return [];
  return writeDeliveryStoryPackage(planPath, report, projectRoot);
}

// --- surfaces ---------------------------------------------------------------

/** Python `_active_delivery`. */
function activeDelivery(report: DeliveryStoryPlanReport): string {
  const title = report.deliveryStoryTitle ? ` — ${report.deliveryStoryTitle}` : "";
  return `🟦[${report.deliveryStory}]${title}`;
}

const RIBBON_PLANNING =
  "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ◉ DS Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done";
const RIBBON_IMPLEMENTING =
  "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ◉ Implement → ○ Validate → ○ Debt Review → ○ Done";

const APPROVED_STATUSES = ["approved", "already_approved"];

/** Python `_next_movement`. */
function nextMovement(report: DeliveryStoryPlanReport): string {
  if (report.status === "already_approved") {
    return "No transition was repeated; continue from the existing approved state.";
  }
  if (report.status === "approved") return "Begin implementation under the approved plan.";
  return "Review the plan artifact, then approve or revise.";
}

/** Python `render_delivery_story_plan_report`. */
export function renderDeliveryStoryPlanReport(report: DeliveryStoryPlanReport): string {
  const approved = APPROVED_STATUSES.includes(report.status);
  const body: string[] = [
    "Delivery",
    report.status === "approved" ? RIBBON_IMPLEMENTING : RIBBON_PLANNING,
    "",
    "╭────────────────────────────────────────────────────────╮",
    cardText(
      approved ? "       🧭  DELIVERY STORY PLAN APPROVED" : "       🧭  DELIVERY STORY PLAN",
    ),
    "│                                                        │",
  ];
  if (approved) {
    body.push(
      cardText("What was approved?"),
      ...cardWrapped(activeDelivery(report)),
      "│                                                        │",
      cardText("Approved work packages"),
      ...cardPrefixed(report.childWorkItems, "-"),
    );
    if (report.unfilledSections.length > 0) {
      body.push(
        "│                                                        │",
        cardText("Sections still pending"),
        ...cardPrefixed(report.unfilledSections, "-"),
      );
    }
  } else {
    body.push(
      cardText("What is being planned?"),
      ...cardWrapped(activeDelivery(report)),
      "│                                                        │",
      cardText("Plan objective"),
      ...cardWrapped(report.objective),
      "│                                                        │",
      cardText("Work packages"),
      ...cardPrefixed(report.childWorkItems, "-"),
    );
  }
  body.push(
    "│                                                        │",
    cardText("Next movement"),
    ...cardWrapped(nextMovement(report)),
  );
  if (!approved) {
    body.push(
      "│                                                        │",
      ...cardWrapped("Choose the next move when ready."),
    );
  }
  body.push("╰────────────────────────────────────────────────────────╯");
  return wrapAriadSurface("delivery_story_plan_checkpoint", `${body.join("\n")}\n`);
}

/** Python `render_plan_preauthorization_recorded`. */
export function renderPlanPreauthorizationRecorded(report: DeliveryStoryPlanReport): string {
  const receipt = report.cursor.planPreauthorization;
  if (receipt === null) {
    throw new Error("Plan preauthorization receipt is required");
  }
  const body = [
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧭  PLAN PREAUTHORIZATION RECORDED              │",
    "│                                                        │",
    cardText("Authorized delivery"),
    ...cardWrapped(receipt.activeItem),
    "│                                                        │",
    cardText("Policy"),
    ...cardWrapped(receipt.policy),
    "│                                                        │",
    cardText("Exact child set"),
    ...cardPrefixed(receipt.childWorkItems, "-"),
    "│                                                        │",
    cardText("Fixed stop"),
    ...cardWrapped(receipt.stopBoundary),
    "│                                                        │",
    cardText("Boundary"),
    ...cardWrapped(
      "Single-use authority remains pending until the Driver completes the Plan and every structural coordinate matches.",
    ),
    "╰────────────────────────────────────────────────────────╯",
  ];
  return wrapAriadSurface("plan_preauthorization_recorded", `${body.join("\n")}\n`);
}

/** Python `render_plan_preauthorization_mismatch`. */
export function renderPlanPreauthorizationMismatch(options: {
  activeItem: string | null;
  reason: string;
}): string {
  const body = [
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        ⛔  PLAN PREAUTHORIZATION NOT CONSUMED          │",
    "│                                                        │",
    cardText("Active delivery"),
    ...cardWrapped(options.activeItem || "none"),
    "│                                                        │",
    cardText("Bounded reason"),
    ...cardWrapped(options.reason),
    "│                                                        │",
    cardText("Result"),
    ...cardWrapped("Plan approval remains blocked; ordinary Navigator approval is available."),
    "╰────────────────────────────────────────────────────────╯",
  ];
  return wrapAriadSurface("plan_preauthorization_mismatch", `${body.join("\n")}\n`);
}

/** Python `render_delivery_story_implementation_started`. */
export function renderDeliveryStoryImplementationStarted(report: DeliveryStoryPlanReport): string {
  const body = [
    "Delivery",
    RIBBON_IMPLEMENTING,
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🟧  IMPLEMENTATION STARTED                     │",
    "│                                                        │",
    cardText("What changed?"),
    ...cardWrapped("The approved Delivery Story Plan now authorizes implementation work."),
    "│                                                        │",
    cardText("Active delivery"),
    ...cardWrapped(activeDelivery(report)),
    "│                                                        │",
    cardText("Work packages"),
    ...cardPrefixed(report.childWorkItems, "-"),
    "│                                                        │",
    cardText("Boundary"),
    ...cardWrapped(
      "Implementation may mutate local project files under the approved plan. Push, release, deploy, purchase, or externally irreversible actions still require explicit Navigator authorization.",
    ),
    "│                                                        │",
    cardText("Driver action"),
    ...cardWrapped("Begin implementing the approved plan now."),
    "╰────────────────────────────────────────────────────────╯",
  ];
  return wrapAriadSurface("implementation_started", `${body.join("\n")}\n`);
}
