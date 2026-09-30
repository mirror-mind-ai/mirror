// CR113 (D4) — a stage an item's level never reaches is drawn as not applicable.
//
// A User Story or Technical Story never expands, and the ribbon drew its Expand as
// done once the cursor passed Prepare, and as still to come before. The level is a
// required argument, so every caller decides; which levels never expand is the
// runtime's one predicate, `isImplementableByDefault`.

import assert from "node:assert/strict";
import test from "node:test";
import { DELIVERY_LIFECYCLE_STAGES, renderLifecycleRibbon } from "#builder/lifecycleRibbon.ts";

test("CR113: a story's ribbon draws Expand as not applicable, at every stage", () => {
  assert.equal(
    renderLifecycleRibbon("plan", "user_story"),
    "Delivery Flow: ✓ Pull → ✓ Prepare → – Expand → ◉ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done",
  );
  assert.equal(
    renderLifecycleRibbon("pull", "technical_story"),
    "Delivery Flow: ◉ Pull → ○ Prepare → – Expand → ○ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done",
  );
  for (const stage of DELIVERY_LIFECYCLE_STAGES.filter((stage) => stage !== "expand")) {
    for (const level of ["user_story", "technical_story"]) {
      const ribbon = renderLifecycleRibbon(stage, level);
      assert.match(ribbon, / – Expand → /u, `${level} at ${stage}`);
      assert.doesNotMatch(ribbon, /[✓◉○] Expand/u, `${level} at ${stage}`);
    }
  }
});

test("CR113: a Delivery Story's ribbon, and a ribbon with no level, draw as they always did", () => {
  const before =
    "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ◉ Plan → ○ Implement → ○ Validate → ○ Debt Review → ○ Done";
  assert.equal(renderLifecycleRibbon("plan", "delivery_story"), before);
  assert.equal(renderLifecycleRibbon("plan", null), before);
  assert.match(renderLifecycleRibbon("expand", "delivery_story"), / ◉ Expand → /u);
});
