// CR117 — a flow unit belongs to the Delivery Story it was chosen for.
//
// Pull carried `navigator_flow_unit` to whatever item came next, so after a Delivery
// Story ran in Delivery Story flow every story pulled after it held `delivery_story`,
// could not choose otherwise (CR105), and was refused a preauthorized Plan under
// `accelerated` and under the Navigator's explicit delegation, with a remedy the
// runtime refused. Pulling the story again did not clear it either.
//
// Now Pull keeps the unit only when the pulled code equals the cursor's active item and
// the level is `delivery_story` (D1), and the refusal a cursor written before this
// change still meets names where the unit came from and the Pull that clears it (D2).

import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { getDeliveryCursor, setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { pullLifecycleItem } from "#builder/pull.ts";
import { authorPlan, authorStoryIndex } from "#helpers/authorScaffold.ts";
import {
  type BuilderRun,
  type BuilderWorld,
  builderWorld,
  removeBuilderWorlds,
  runBuild,
} from "#helpers/builderWorld.ts";

test.after(removeBuilderWorlds);

const NOW = "2026-10-05T12:00:00+00:00";
const deps = { nowIso: () => NOW };

function dsIndex(n: number): string {
  return (
    `# CV1.DS${n} — Delivery ${n}\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n## Candidate Stories\n\n` +
    "| Code | Story | Type | Status |\n|------|-------|------|--------|\n" +
    `| CV1.DS${n}.US1 | Story ${n} | User Story | 🟡 Planned |\n` +
    `| CV1.DS${n}.US2 | Story ${n} b | User Story | 🟡 Planned |\n` +
    `| CV1.DS${n}.US3 | Story ${n} c | User Story | 🟡 Planned |\n`
  );
}

function world(): BuilderWorld {
  return builderWorld({
    files: {
      "docs/project/roadmap/index.md": "# Roadmap\n",
      "docs/project/roadmap/cv1/index.md": "# CV1 — Checkout\n\n**Status:** 🟢 Active\n",
      "docs/project/roadmap/cv1/ds1/index.md": dsIndex(1),
      "docs/project/roadmap/cv1/ds2/index.md": dsIndex(2),
    },
  });
}

test("CR117 D1: Pull keeps a flow unit only for the same Delivery Story", () => {
  const cases: readonly [string, string, string, string | null][] = [
    [
      "the Delivery Story re-pulled as the same item",
      "CV1.DS1",
      "delivery_story",
      "delivery_story",
    ],
    ["a story in another Delivery Story", "CV1.DS2.US1", "user_story", null],
    ["a story in the same Delivery Story", "CV1.DS1.US1", "user_story", null],
    ["another Delivery Story", "CV1.DS2", "delivery_story", null],
    ["the same code pulled at another level", "CV1.DS1", "user_story", null],
  ];
  for (const [label, code, level, expected] of cases) {
    const w = world();
    try {
      setDeliveryCursor(
        w.db,
        {
          journey: "demo",
          method: "ariad",
          activeItem: "CV1.DS1",
          activeItemLevel: "delivery_story",
          lastDeliveryEvent: "delivery_story_plan_approved",
          navigatorFlowUnit: "delivery_story",
          cadenceProfile: "checkpoint",
        },
        deps,
      );
      const report = pullLifecycleItem(
        w.db,
        { journey: "demo", method: "ariad", item: { code, title: "t", level, whyNow: "now" } },
        deps,
      );
      assert.equal(report.cursor.navigatorFlowUnit, expected, label);
      assert.equal(report.cursor.cadenceProfile, "checkpoint", `${label}: the cadence is carried`);
    } finally {
      w.db.close();
    }
  }
  // The same story pulled again, holding a unit a cursor written before this change left.
  const w = world();
  try {
    setDeliveryCursor(
      w.db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS2.US1",
        activeItemLevel: "user_story",
        lastDeliveryEvent: "prepare",
        navigatorFlowUnit: "delivery_story",
      },
      deps,
    );
    const report = pullLifecycleItem(
      w.db,
      {
        journey: "demo",
        method: "ariad",
        item: { code: "CV1.DS2.US1", title: "t", level: "user_story", whyNow: "now" },
      },
      deps,
    );
    assert.equal(report.cursor.navigatorFlowUnit, null, "the same story pulled again");
  } finally {
    w.db.close();
  }
});

function ran(w: BuilderWorld, argv: readonly string[], label: string): BuilderRun {
  const result = runBuild(w, argv);
  assert.equal(result.exitCode, 0, `${label}: ${result.stderr}${result.stdout}`);
  return result;
}

function pull(w: BuilderWorld, code: string, level: string, label: string): BuilderRun {
  return ran(
    w,
    [
      "pull-item",
      "--item-code",
      code,
      "--item-level",
      level,
      "--item-title",
      code,
      "--why-now",
      "next",
    ],
    label,
  );
}

function flowUnit(w: BuilderWorld): string | null {
  return getDeliveryCursor(w.db, "demo")?.navigatorFlowUnit ?? null;
}

function selected(w: BuilderWorld): string {
  const shown = ran(w, ["set-flow-unit"], "inspect the flow unit");
  const row = shown.stdout.match(/│ Selected flow unit\s+│\n│ (\S+)/u);
  assert.ok(row, "the surface names the selected flow unit");
  return row[1] ?? "";
}

const PLAN_PREAUTHORIZED =
  /<<<ARIAD:PLAN_CHECKPOINT>>>[\s\S]*<<<ARIAD:PLAN_PREAUTHORIZATION_RECORDED>>>/u;

test("CR117: a story after a Delivery Story in Delivery Story flow starts story by story", () => {
  const w = world();
  ran(w, ["set-cadence", "--profile", "checkpoint"], "cadence");
  pull(w, "CV1.DS1", "delivery_story", "pull the Delivery Story");
  ran(w, ["set-flow-unit", "--unit", "delivery_story"], "choose Delivery Story flow");
  ran(
    w,
    [
      "plan-delivery-story",
      "--objective",
      "o",
      "--child",
      "CV1.DS1.US1",
      "--child",
      "CV1.DS1.US2",
      "--child",
      "CV1.DS1.US3",
    ],
    "plan",
  );
  // The Delivery Story re-pulled mid-flow keeps its unit, with its children.
  pull(w, "CV1.DS1", "delivery_story", "re-pull the Delivery Story");
  assert.equal(flowUnit(w), "delivery_story", "the same Delivery Story keeps its unit");
  assert.deepEqual(getDeliveryCursor(w.db, "demo")?.childWorkItems, [
    "CV1.DS1.US1",
    "CV1.DS1.US2",
    "CV1.DS1.US3",
  ]);

  // A story in another Delivery Story: the default, and both preauthorized routes.
  pull(w, "CV1.DS2.US1", "user_story", "pull a story in DS2");
  assert.equal(flowUnit(w), null);
  assert.equal(selected(w), "story_by_story");
  ran(w, ["set-cadence", "--profile", "accelerated"], "accelerated");
  assert.match(ran(w, ["plan-item"], "plan under accelerated").stdout, PLAN_PREAUTHORIZED);

  ran(w, ["set-cadence", "--profile", "checkpoint"], "checkpoint");
  pull(w, "CV1.DS2.US2", "user_story", "pull the next story");
  assert.match(
    ran(
      w,
      ["plan-item", "--preauthorize-approval", "--stop-after", "navigator_validation"],
      "the delegation route",
    ).stdout,
    PLAN_PREAUTHORIZED,
  );

  // A child of the Delivery Story the unit was chosen for: a story, so the default.
  pull(w, "CV1.DS1.US1", "user_story", "pull a child of DS1");
  assert.equal(flowUnit(w), null, "a child of the closed Delivery Story");
  assert.equal(selected(w), "story_by_story");

  // The Delivery Story pulled again after other items is back at its flow decision.
  pull(w, "CV1.DS1", "delivery_story", "pull DS1 again");
  assert.equal(flowUnit(w), null, "a Delivery Story pulled after other items");
});

test("CR117 D2: a cursor written before this change is refused with the remedy, and the remedy works", () => {
  const w = world();
  // As the `finances` journey's cursor stands: a story holding delivery_story.
  setDeliveryCursor(
    w.db,
    {
      journey: "demo",
      method: "ariad",
      activeItem: "CV1.DS2.US3",
      activeItemLevel: "user_story",
      activeItemTitle: "Story 2 c",
      lastDeliveryEvent: "prepare",
      navigatorFlowUnit: "delivery_story",
      cadenceProfile: "accelerated",
    },
    deps,
  );
  const refused = runBuild(w, ["plan-item"]);
  assert.equal(refused.exitCode, 1);
  assert.equal(
    refused.stderr.trim(),
    "Error: story Plan preauthorization requires story_by_story flow; the cursor holds " +
      "delivery_story from a Delivery Story pulled before this story. Pull the story again " +
      "to start it in story_by_story flow.",
  );
  pull(w, "CV1.DS2.US3", "user_story", "pull the story again");
  assert.equal(flowUnit(w), null);
  const planned = ran(w, ["plan-item"], "plan under accelerated after the re-pull");
  assert.match(planned.stdout, PLAN_PREAUTHORIZED);
  const pkg = planned.stdout.match(/^story_package_path=(.+)$/mu)?.[1];
  assert.ok(pkg);
  authorPlan(join(pkg, "plan.md"));
  authorStoryIndex(join(pkg, "index.md"));
  assert.match(
    ran(w, ["approve-plan", "--use-preauthorization"], "consume the receipt").stdout,
    /IMPLEMENTATION_STARTED/u,
  );
});
