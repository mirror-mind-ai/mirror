// CR114 — the table of positions, row by row.
//
// The resume offered Prepare at every position with nothing pending, because it chose
// its list without reading the event. These tests grade the one table that now chooses
// it: each position the runtime writes, at both levels, the lists that outrank the
// table, the positions it does not know, and the skill's words for every step.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  allowedNextActions,
  type CursorPositionView,
  lifecycleStageOf,
  NEXT_ACTIONS,
  STORY_LIFECYCLE_EVENTS,
} from "#builder/cursorPosition.ts";

const INSPECT = ["inspect_roadmap", "inspect_method"];
const NO_ITEM = ["inspect_roadmap", "pull_candidate_if_known", "inspect_method"];
const PENDING = ["answer_pending_confirmation", "inspect_method"];

function at(
  event: string | null,
  level: string,
  pendingConfirmation: string | null = null,
): CursorPositionView {
  return {
    activeItem: level === "delivery_story" ? "CV1.DS1" : "CV1.DS1.US1",
    activeItemLevel: level,
    pendingConfirmation,
    lastDeliveryEvent: event,
  };
}

test("CR114: each position a story rests at offers the steps the runtime accepts next", () => {
  const expected: Record<string, string[]> = {
    pull: ["prepare_active_item", ...INSPECT],
    prepare: ["plan_active_item", ...INSPECT],
    plan_approved: ["implement_active_item", "validate_active_item", ...INSPECT],
    implementation_complete: ["validate_active_item", ...INSPECT],
    validation_passed: ["review_active_item_debt", ...INSPECT],
    review_complete: ["check_active_item_coherence", "close_active_item", ...INSPECT],
    coherence_complete: ["close_active_item", ...INSPECT],
    done_complete: NO_ITEM,
  };
  for (const level of ["user_story", "technical_story"]) {
    for (const [event, list] of Object.entries(expected)) {
      assert.deepEqual([...allowedNextActions(at(event, level))], list, `${level} at ${event}`);
    }
  }
});

test("CR114: each position a Delivery Story rests at offers the steps the runtime accepts next", () => {
  const expected: Record<string, string[]> = {
    pull: ["prepare_active_item", ...INSPECT],
    // Pull runs Expand; a Delivery Story rests here only when its Expand was blocked.
    prepare: ["expand_active_item", ...INSPECT],
    delivery_story_plan_approved: ["implement_active_item", "validate_active_item", ...INSPECT],
    delivery_story_validation_complete: ["review_active_item_debt", ...INSPECT],
    // Coherence is checked inside a Delivery Story's Done.
    delivery_story_review_complete: ["close_active_item", ...INSPECT],
    delivery_story_coherence_complete: ["close_active_item", ...INSPECT],
    delivery_story_done_complete: NO_ITEM,
  };
  for (const [event, list] of Object.entries(expected)) {
    assert.deepEqual([...allowedNextActions(at(event, "delivery_story"))], list, event);
  }
});

test("CR114: an event the runtime writes with a pending confirmation has no step of its own", () => {
  const written: Record<string, [string, string]> = {
    plan: ["user_story", "navigator_approval"],
    validate: ["user_story", "navigator_validation"],
    review: ["user_story", "navigator_debt_decision"],
    coherence: ["user_story", "navigator_coherence"],
    done: ["user_story", "navigator_done"],
    expand: ["delivery_story", "navigator_story_confirmation"],
    navigator_flow_unit_selected: ["delivery_story", "navigator_scope_confirmation"],
    delivery_story_plan: ["delivery_story", "navigator_delivery_story_plan_approval"],
    delivery_story_validation: ["delivery_story", "navigator_delivery_story_validation"],
  };
  for (const [event, [level, pending]] of Object.entries(written)) {
    assert.deepEqual([...allowedNextActions(at(event, level, pending))], PENDING, event);
    // Without its confirmation the position is one the runtime never writes.
    assert.deepEqual(
      [...allowedNextActions(at(event, level))],
      INSPECT,
      `${event}, nothing pending`,
    );
  }
});

test("CR114 (D2): a position the table does not know offers no lifecycle step", () => {
  for (const event of ["pulled", "template_preparation", "implementation_started", null]) {
    assert.deepEqual([...allowedNextActions(at(event, "user_story"))], INSPECT, String(event));
  }
});

test("CR114: no cursor, no item, and a pending confirmation keep their lists", () => {
  assert.deepEqual([...allowedNextActions(null)], ["sync_cursor", "inspect_method"]);
  const empty: CursorPositionView = {
    activeItem: null,
    activeItemLevel: null,
    pendingConfirmation: null,
    lastDeliveryEvent: "template_preparation",
  };
  assert.deepEqual([...allowedNextActions(empty)], NO_ITEM);
  assert.deepEqual(
    [...allowedNextActions({ ...empty, pendingConfirmation: "navigator_approval" })],
    PENDING,
    "a pending confirmation outranks having no item",
  );
  assert.deepEqual(
    [...allowedNextActions(at("done_complete", "user_story", "navigator_approval"))],
    PENDING,
    "and outranks a closed item",
  );
});

test("CR114: the story's events are the table's story rows, in the order a cursor reaches them", () => {
  assert.deepEqual(
    [...STORY_LIFECYCLE_EVENTS],
    [
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
    ],
  );
});

test("CR114: a Delivery Story's own events draw no ribbon stage, as CR067 left them", () => {
  for (const event of [
    "expand",
    "navigator_flow_unit_selected",
    "delivery_story_plan",
    "delivery_story_plan_approved",
    "delivery_story_validation",
    "delivery_story_validation_complete",
    "delivery_story_review_complete",
    "delivery_story_coherence_complete",
    "delivery_story_done_complete",
  ]) {
    assert.equal(lifecycleStageOf(at(event, "delivery_story")), null, event);
  }
  assert.equal(lifecycleStageOf(at("prepare", "delivery_story")), "expand");
});

test("CR114: the Builder skill names every action a Builder surface can offer", () => {
  const skill = readFileSync(
    fileURLToPath(new URL("../../../.pi/skills/mm-build/SKILL.md", import.meta.url)),
    "utf8",
  );
  const unnamed = NEXT_ACTIONS.filter((action) => !skill.includes(`\`${action}\``));
  assert.deepEqual(unnamed, [], "every action is named in mm-build, in backticks");
});
