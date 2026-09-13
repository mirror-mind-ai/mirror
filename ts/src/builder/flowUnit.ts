// CV22.DS7.US8 plateau 3 — the Navigator flow unit, read side only.
//
// Partial port of `src/memory/builder/flow_unit.py`: Plan needs to know the
// EFFECTIVE flow unit before it can record story authority, because bounded story
// authority exists only under `story_by_story`.
//
// The `set-flow-unit` leaf and its surfaces are Scope F (plateau 6) and land in
// this module then, rather than in a second one.

import type { BuilderDeliveryCursor } from "./deliveryCursor.ts";

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
