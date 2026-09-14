// CV22.DS7.US8 — the Navigator flow unit.
//
// Port of `src/memory/builder/flow_unit.py`. Plateau 3 took the read side, because
// Plan needs the EFFECTIVE flow unit before it can record story authority (bounded
// story authority exists only under `story_by_story`). Plateau 5 completes it: the
// write side was re-sequenced out of Scope F by the panel, since the DS smoke opens
// with `set-flow-unit` and seeding the flow unit by a raw cursor write instead
// would be the unrecorded mutation plateau 3a ruled out.
//
// The selection surface is CHOSEN by the unit, not fixed: `delivery_story` renders
// DELIVERY_STORY_SCOPE_CONFIRMATION over the child work packages, `story_by_story`
// renders NEXT_STORY_CONFIRMATION over the first child as the recommended story.
// One function, two surface ids — a port that hard-codes either one fails the
// corpus guard that compares each recorded id against its own wrapped marker.

import type { WritableDatabase } from "#db/database.ts";
import { pyStrip } from "#util/pythonText.ts";
import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
} from "./deliveryCursor.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

export const FLOW_UNIT_STORY_BY_STORY = "story_by_story";
export const FLOW_UNIT_DELIVERY_STORY = "delivery_story";
export const ALLOWED_FLOW_UNITS = [FLOW_UNIT_STORY_BY_STORY, FLOW_UNIT_DELIVERY_STORY] as const;

/**
 * Python `effective_navigator_flow_unit`.
 *
 * An unset or UNRECOGNIZED value falls back to `story_by_story` with source
 * `default`, rather than raising — so a cursor written by a newer engine, or one
 * carrying a typo, still yields a usable flow unit instead of blocking the
 * lifecycle. The source is returned because the Navigator-facing surfaces
 * distinguish "you chose this" from "this is the default".
 */
export function effectiveNavigatorFlowUnit(cursor: BuilderDeliveryCursor): {
  flowUnit: string;
  source: string;
} {
  const current = cursor.navigatorFlowUnit;
  if (current !== null && (ALLOWED_FLOW_UNITS as readonly string[]).includes(current)) {
    return { flowUnit: current, source: "cursor" };
  }
  return { flowUnit: FLOW_UNIT_STORY_BY_STORY, source: "default" };
}

export interface NavigatorFlowUnitReport {
  readonly journey: string;
  readonly method: string;
  readonly activeItem: string | null;
  readonly activeItemTitle: string | null;
  readonly activeItemLevel: string | null;
  readonly flowUnit: string;
  readonly source: string;
  readonly cursor: BuilderDeliveryCursor;
}

/**
 * Python `set_navigator_flow_unit`.
 *
 * Validation BEFORE the cursor read, so an unknown unit reports the allowed values
 * even when no cursor exists. Everything else on the cursor carries forward
 * untouched: choosing a flow unit is not a lifecycle transition, and the only
 * fields it writes are the unit itself and `last_delivery_event`.
 */
export function setNavigatorFlowUnit(
  db: WritableDatabase,
  options: { journey: string; method: string; flowUnit: string },
  deps: CursorWriteDeps,
): NavigatorFlowUnitReport {
  if (!(ALLOWED_FLOW_UNITS as readonly string[]).includes(options.flowUnit)) {
    throw new Error(`navigator flow unit must be one of: ${ALLOWED_FLOW_UNITS.join(", ")}`);
  }
  const existing = getDeliveryCursor(db, options.journey);
  if (existing === null) {
    throw new Error("delivery cursor is required before choosing navigator flow unit");
  }
  const updated = setDeliveryCursor(
    db,
    {
      journey: options.journey,
      method: options.method,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: existing.activeCheckpoint,
      pendingConfirmation: existing.pendingConfirmation,
      lastDeliveryEvent: "navigator_flow_unit_selected",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      granularityDecision: existing.granularityDecision,
      navigatorFlowUnit: options.flowUnit,
      childWorkItems: existing.childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
    },
    deps,
  );
  return {
    journey: options.journey,
    method: options.method,
    activeItem: updated.activeItem,
    activeItemTitle: updated.activeItemTitle,
    activeItemLevel: updated.activeItemLevel,
    flowUnit: options.flowUnit,
    source: "cursor",
    cursor: updated,
  };
}

/** Python `inspect_navigator_flow_unit`. */
export function inspectNavigatorFlowUnit(
  db: WritableDatabase,
  options: { journey: string; method: string },
): NavigatorFlowUnitReport {
  const cursor = getDeliveryCursor(db, options.journey);
  if (cursor === null) {
    throw new Error("delivery cursor is required before inspecting navigator flow unit");
  }
  const { flowUnit, source } = effectiveNavigatorFlowUnit(cursor);
  return {
    journey: options.journey,
    method: options.method,
    activeItem: cursor.activeItem,
    activeItemTitle: cursor.activeItemTitle,
    activeItemLevel: cursor.activeItemLevel,
    flowUnit,
    source,
    cursor,
  };
}

/** Python `_active_delivery`. */
function activeDelivery(report: NavigatorFlowUnitReport): string {
  if (report.activeItem === null) return "none";
  const title = report.activeItemTitle ? ` — ${report.activeItemTitle}` : "";
  return `🟦[${report.activeItem}]${title}`;
}

/** Python `_scope_item_lines`: an EMPTY list renders nothing, not `none`. */
function scopeItemLines(label: string, items: readonly string[]): string[] {
  if (items.length === 0) return [];
  return [
    "│                                                        │",
    cardText(label),
    ...cardPrefixed(items, "-"),
  ];
}

/**
 * Python `_delivery_story_scope_hypothesis`.
 *
 * The checkout/address special case is product copy, not a heuristic worth
 * generalizing: it is reproduced verbatim because the surface is graded byte for
 * byte.
 */
function deliveryStoryScopeHypothesis(report: NavigatorFlowUnitReport): string {
  const title = pyStrip(report.activeItemTitle ?? "");
  const normalized = title.toLowerCase();
  if (normalized.includes("checkout") && normalized.includes("address")) {
    return (
      "This Delivery Story should let the customer enter checkout, provide or confirm " +
      "a delivery address, and leave the order ready for the next checkout step."
    );
  }
  if (title) return `This Delivery Story should deliver the scope implied by: ${title}.`;
  return (
    "I will infer a complete Delivery Story plan from the roadmap and project context; " +
    "correct or add any scope details before I proceed."
  );
}

/** Python `render_flow_unit_scope_confirmation_report`. */
export function renderFlowUnitScopeConfirmationReport(report: NavigatorFlowUnitReport): string {
  const deliveryStory = report.flowUnit === FLOW_UNIT_DELIVERY_STORY;
  const surfaceName = deliveryStory
    ? "delivery_story_scope_confirmation"
    : "next_story_confirmation";
  const title = deliveryStory
    ? "       🧭  DELIVERY STORY SCOPE CONFIRMATION"
    : "       🧭  NEXT STORY CONFIRMATION";
  const understanding = deliveryStory
    ? deliveryStoryScopeHypothesis(report)
    : "We will continue story by story. The next step is to confirm which child story " +
      "becomes the next Navigator-facing lifecycle unit.";
  const scopeLabel = deliveryStory ? "Work packages in scope" : "Recommended story";
  const scopeItems = deliveryStory
    ? report.cursor.childWorkItems
    : report.cursor.childWorkItems.slice(0, 1);
  const prompt = deliveryStory
    ? "Before I create the DS Plan, correct or add anything:"
    : "Before I create the Story Plan, correct or add anything:";
  const question = deliveryStory
    ? "1. Is this the right scope?"
    : "1. Is this the right next story?";
  const body = [
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    cardText(title),
    "│                                                        │",
    cardText("My understanding"),
    ...cardWrapped(understanding),
    "│                                                        │",
    cardText("Active delivery"),
    ...cardWrapped(activeDelivery(report)),
    ...scopeItemLines(scopeLabel, scopeItems),
    "│                                                        │",
    ...cardWrapped(prompt),
    ...cardWrapped(question),
    "│                                                        │",
    ...cardWrapped("Choose the next move when ready."),
    "╰────────────────────────────────────────────────────────╯",
  ];
  return wrapAriadSurface(surfaceName, `${body.join("\n")}\n`);
}

/** Python `_flow_unit_change_summary` / `_description` / `_next_movement`. */
function flowUnitChangeSummary(flowUnit: string): string {
  return flowUnit === FLOW_UNIT_DELIVERY_STORY
    ? "Navigator-facing lifecycle will continue at Delivery Story level."
    : "Navigator-facing lifecycle will continue story by story.";
}

function flowUnitDescription(flowUnit: string): string {
  return flowUnit === FLOW_UNIT_DELIVERY_STORY
    ? "the Delivery Story becomes the lifecycle unit; child stories remain traceable work packages"
    : "child stories get their own Navigator checkpoints";
}

function flowUnitNextMovement(flowUnit: string): string {
  return flowUnit === FLOW_UNIT_DELIVERY_STORY
    ? "Plan the Delivery Story as the Navigator-facing unit."
    : "Confirm the recommended child story, then Plan.";
}

/** Python `render_navigator_flow_unit_report`: the READ face. */
export function renderNavigatorFlowUnitReport(report: NavigatorFlowUnitReport): string {
  const body = [
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧭  FLOW UNIT SELECTED                         │",
    "│                                                        │",
    cardText("What changed?"),
    ...cardWrapped(flowUnitChangeSummary(report.flowUnit)),
    "│                                                        │",
    cardText("Active delivery"),
    ...cardWrapped(activeDelivery(report)),
    "│                                                        │",
    cardText("Selected flow unit"),
    cardText(report.flowUnit),
    ...cardWrapped(flowUnitDescription(report.flowUnit)),
    "│                                                        │",
    cardText("Next movement"),
    ...cardWrapped(flowUnitNextMovement(report.flowUnit)),
    "│                                                        │",
    ...cardWrapped("Choose the next move when ready."),
    "╰────────────────────────────────────────────────────────╯",
  ];
  return wrapAriadSurface("navigator_flow_unit", `${body.join("\n")}\n`);
}
