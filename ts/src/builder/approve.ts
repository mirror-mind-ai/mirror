// CV22.DS7.US8 plateau 3 — ordinary Plan approval.
//
// Port of `approve_plan_checkpoint` and `render_plan_approval` from
// `src/memory/builder/lifecycle.py`.
//
// The detail worth naming: an ordinary approval INVALIDATES a pending authority
// receipt with `ordinary_approval_used`, rather than leaving it pending or dropping
// it. Leaving it pending would let the same authority be consumed a second time
// after the Navigator already approved by hand; dropping it silently would lose the
// record of why it never applied.
//
// CR112: approval reads the plan. Until then an untouched scaffold was approvable,
// because nothing opened `plan.md`. An approval now refuses, before any write, while
// any section the approval requires is missing, empty, pending, or still the
// scaffold's own sentences -- the same list the preauthorized route checks. The
// precondition that the cursor holds a Plan awaiting approval is a refusal too, told
// apart as already complete, waiting on another confirmation, or not reached (CR067).

import { existsSync } from "node:fs";
import type { WritableDatabase } from "#db/database.ts";
import { displayPath } from "./artifacts/artifactSurfaces.ts";
import { unauthoredPlanSectionsFor } from "./artifacts/scaffoldState.ts";
import { cardText, cardWrapped } from "./card.ts";
import { normalizeRequired } from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
  setTo,
} from "./deliveryCursor.ts";
import { LifecycleRefusal, refuseIfAlreadyComplete } from "./lifecycleRefusal.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { PLAN_APPROVAL_SECTIONS } from "./planPreauthorization.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

export interface ApprovePlanOptions {
  readonly journey: string;
  readonly method: string;
  /**
   * The story package's `plan.md`. `null` when the journey has no project, so there
   * is no file to read and approval proceeds as it always did. Required, not optional:
   * the rule lives in this argument, and a caller that could omit it could skip the
   * rule without anyone deciding to (CR112's handoff review, finding 1).
   */
  readonly planArtifactPath: string | null;
  /** The project the refusal prints the path relative to. */
  readonly projectRoot?: string | null;
}

/**
 * Refuse, before any write, a plan that is not yet a plan: any section in
 * `PLAN_APPROVAL_SECTIONS` missing, empty, pending, or still the scaffold's.
 */
function refuseUnauthoredPlan(planPath: string | null, projectRoot: string | null): void {
  if (planPath === null) return;
  const unauthored = unauthoredPlanSectionsFor(planPath, PLAN_APPROVAL_SECTIONS);
  if (unauthored.length === 0) return;
  const shown = displayPath(planPath, projectRoot);
  throw new LifecycleRefusal(
    "plan_approval",
    "missing_evidence",
    existsSync(planPath)
      ? `Plan approval needs an authored plan. Still to author in ${shown}: ${unauthored.join(", ")}.`
      : `Plan approval needs an authored plan, and ${shown} does not exist.`,
  );
}

/** Python `approve_plan_checkpoint`. */
export function approvePlanCheckpoint(
  db: WritableDatabase,
  options: ApprovePlanOptions,
  deps: CursorWriteDeps,
): BuilderDeliveryCursor {
  const journey = normalizeRequired(options.journey, "journey");
  const method = normalizeRequired(options.method, "method");

  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before plan approval");
  refuseIfAlreadyComplete("plan_approval", existing);
  if (
    existing.activeCheckpoint !== "after_plan" ||
    existing.pendingConfirmation !== "navigator_approval"
  ) {
    if (existing.pendingConfirmation && existing.pendingConfirmation !== "navigator_approval") {
      throw new LifecycleRefusal(
        "plan_approval",
        "pending_confirmation",
        `Plan approval is blocked: pending confirmation ${existing.pendingConfirmation}.`,
      );
    }
    throw new LifecycleRefusal(
      "plan_approval",
      "not_reached",
      "Plan approval requires a Plan awaiting approval: run plan-item first.",
    );
  }
  refuseUnauthoredPlan(options.planArtifactPath, options.projectRoot ?? null);

  let receipt = existing.planPreauthorization;
  if (receipt !== null && receipt.status === "pending") {
    receipt = { ...receipt, status: "invalidated", reason: "ordinary_approval_used" };
  }

  return setDeliveryCursor(
    db,
    {
      journey,
      method,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: null,
      pendingConfirmation: null,
      lastDeliveryEvent: "plan_approved",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      granularityDecision: existing.granularityDecision,
      navigatorFlowUnit: existing.navigatorFlowUnit,
      childWorkItems: existing.childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
      cursorGeneration: existing.cursorGeneration,
      planPreauthorization: setTo(receipt),
    },
    deps,
  );
}

/** Python `render_plan_approval`. */
export function renderPlanApproval(cursor: BuilderDeliveryCursor): string {
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("implement"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🟩■  PLAN APPROVED                              │",
    "│                                                        │",
    cardText("active item"),
    cardText(cursor.activeItem ?? "none"),
    "│                                                        │",
    cardText("last delivery event"),
    cardText(cursor.lastDeliveryEvent ?? "none"),
    "│                                                        │",
    cardText("boundary"),
    ...cardWrapped("Implementation may begin under the approved Plan contract."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("plan_approved", body);
}
