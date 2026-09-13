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

import type { WritableDatabase } from "#db/database.ts";
import { cardText, cardWrapped } from "./card.ts";
import { normalizeRequired } from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
  setTo,
} from "./deliveryCursor.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/** Python `approve_plan_checkpoint`. */
export function approvePlanCheckpoint(
  db: WritableDatabase,
  options: { journey: string; method: string },
  deps: CursorWriteDeps,
): BuilderDeliveryCursor {
  const journey = normalizeRequired(options.journey, "journey");
  const method = normalizeRequired(options.method, "method");

  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before plan approval");
  if (
    existing.activeCheckpoint !== "after_plan" ||
    existing.pendingConfirmation !== "navigator_approval"
  ) {
    throw new Error("Plan approval requires a pending after_plan navigator_approval checkpoint");
  }

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
