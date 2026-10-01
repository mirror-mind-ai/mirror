// CR114 — the resume and `build show` name the same next steps, and the runtime takes
// every one of them.
//
// The resume offered Prepare at every position with nothing pending, and the command
// it offered rewound a closed item. A list is only worth reading if each step it
// offers is one the runtime accepts where it was offered. These walks go through a
// story's lifecycle, both of Debt Review's ways out, a Delivery Story's in Delivery
// Story flow, a blocked Expand, and a journey with no cursor, through the front door.
// At every position they compare the resume's list with `build show`'s, and run each
// offered lifecycle step in a world replayed to that position.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { NextAction } from "#builder/cursorPosition.ts";
import { setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { renderBuilderEntrySurface } from "#builder/load.ts";
import { authorPlan, authorStoryIndex } from "#helpers/authorScaffold.ts";
import {
  type BuilderRun,
  type BuilderWorld,
  builderWorld,
  removeBuilderWorlds,
  runBuild,
} from "#helpers/builderWorld.ts";

test.after(removeBuilderWorlds);

const INSPECT: readonly NextAction[] = ["inspect_roadmap", "inspect_method"];
const NO_ITEM: readonly NextAction[] = [
  "inspect_roadmap",
  "pull_candidate_if_known",
  "inspect_method",
];
const PENDING: readonly NextAction[] = ["answer_pending_confirmation", "inspect_method"];

const DS1_INDEX = `# CV1.DS1 — Checkout address

**Status:** 🟡 Planned
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |
| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |
`;

const DS2_BLOCKED = `# CV1.DS2 — Checkout payment

**Status:** 🟡 Planned
**Type:** Delivery Story

## Candidate Stories

| Family | Scope |
|--------|-------|
| cards | pay by card |
`;

const DS2_FIXED = `# CV1.DS2 — Checkout payment

**Status:** 🟡 Planned
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS2.US1 | Pay by card | User Story | 🟡 Planned |
`;

/** A project with one Delivery Story to deliver and one whose table Expand cannot read. */
function world(options: { sync: boolean } = { sync: true }): BuilderWorld {
  return builderWorld({
    sync: options.sync,
    files: {
      "docs/project/roadmap/index.md": "# Roadmap\n",
      "docs/project/roadmap/cv1/index.md": "# CV1 — Checkout\n\n**Status:** 🟢 Active\n",
      "docs/project/roadmap/cv1/ds1/index.md": DS1_INDEX,
      "docs/project/roadmap/cv1/ds2/index.md": DS2_BLOCKED,
    },
  });
}

/** The `allowed next actions` a wrapped surface prints, without their dashes; null if none. */
function listOf(stdout: string, surface: string): string[] | null {
  const block = stdout.match(
    new RegExp(`<<<ARIAD:${surface}>>>\\n([\\s\\S]*?)<<<END:${surface}>>>`, "u"),
  )?.[1];
  assert.ok(block !== undefined, `the output holds ${surface}`);
  const rows = block.split("\n").map((line) => line.replace(/^│ ?/u, "").replace(/ *│$/u, ""));
  const at = rows.indexOf("allowed next actions");
  if (at === -1) return null;
  const list: string[] = [];
  for (const row of rows.slice(at + 1)) {
    if (!row.startsWith("- ")) break;
    list.push(row.slice(2).trim());
  }
  return list;
}

/** The resume's list and `build show`'s, at the position the world stands at. */
function lists(w: BuilderWorld): { resume: string[] | null; show: string[] | null } {
  const entry = renderBuilderEntrySurface(w.db, "demo", w.project);
  const shown = runBuild(w, ["show"]);
  assert.equal(shown.exitCode, 0, shown.stderr);
  return {
    resume: listOf(entry, "BUILDER_RESUME"),
    show: listOf(shown.stdout, "ACTIVE_CHECKPOINT"),
  };
}

function accepted(result: BuilderRun, label: string): void {
  assert.equal(result.exitCode, 0, `${label}: ${result.stderr}${result.stdout}`);
  assert.doesNotMatch(result.stdout, /CHECKPOINT_REFUSED|EXPAND_BLOCKED/u, label);
  assert.doesNotMatch(result.stdout, /│ blocked +│/u, label);
}

const VALIDATE = [
  "validate-item",
  "--implementation-complete",
  "--check",
  "npm test",
  "--checks-status",
  "passed",
  "--e2e-decision",
  "not_required",
  "--e2e-evidence",
  "unit-level change",
  "--navigator-route",
  "walk the route",
  "--navigator-accepted",
  "--expected-observation",
  "it shows",
  "--pass-condition",
  "it does",
  "--fail-condition",
  "it does not",
] as const;

/** Mark every Delivery Story file of CV1.DS1 Done, as the skill asks before its Done. */
function alignDeliveryStoryDone(w: BuilderWorld): void {
  const root = join(w.project, "docs/project/roadmap/cv1/ds1");
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === "index.md") {
        const text = readFileSync(path, "utf8")
          .replaceAll("🟡 Planned", "✅ Done")
          .replace(/^\*\*Status:\*\* .*$/mu, "**Status:** ✅ Done");
        writeFileSync(path, text, "utf8");
      }
    }
  };
  visit(root);
}

type Step = (w: BuilderWorld) => BuilderRun;

/** What each lifecycle step routes to, for a story. */
const STORY_STEPS: Partial<Record<NextAction, Step>> = {
  prepare_active_item: (w) => runBuild(w, ["prepare-item"]),
  plan_active_item: (w) => runBuild(w, ["plan-item"]),
  implement_active_item: (w) => runBuild(w, ["check-implementation"]),
  validate_active_item: (w) => runBuild(w, VALIDATE),
  review_active_item_debt: (w) =>
    runBuild(w, ["review-item", "--debt", "No debt found", "--decision", "no_action"]),
  check_active_item_coherence: (w) =>
    runBuild(w, ["coherence-item", "--process", "p", "--project", "p", "--product", "p"]),
  close_active_item: (w) =>
    runBuild(w, [
      "done-item",
      "--history-action",
      "h",
      "--roadmap-update",
      "r",
      "--next-recommendation",
      "n",
    ]),
  pull_candidate_if_known: (w) =>
    runBuild(w, [
      "pull-item",
      "--item-code",
      "CV1.DS1.TS1",
      "--item-title",
      "Validate the address",
      "--item-level",
      "technical_story",
      "--why-now",
      "next",
    ]),
};

/** What each lifecycle step routes to, for a Delivery Story in Delivery Story flow. */
const DELIVERY_STORY_STEPS: Partial<Record<NextAction, Step>> = {
  implement_active_item: (w) => runBuild(w, ["check-implementation"]),
  validate_active_item: (w) =>
    runBuild(w, ["validate-delivery-story", "--summary", "s", "--navigator-accepted"]),
  review_active_item_debt: (w) =>
    runBuild(w, ["review-delivery-story", "--decision", "no_action", "--summary", "s"]),
  close_active_item: (w) => {
    alignDeliveryStoryDone(w);
    return runBuild(w, ["done-delivery-story", "--summary", "s"]);
  },
  expand_active_item: (w) => {
    writeFileSync(join(w.project, "docs/project/roadmap/cv1/ds2/index.md"), DS2_FIXED, "utf8");
    return runBuild(w, PULL_DS2);
  },
  pull_candidate_if_known: STORY_STEPS.pull_candidate_if_known,
};

const PULL_US1 = [
  "pull-item",
  "--item-code",
  "CV1.DS1.US1",
  "--item-title",
  "Enter an address",
  "--item-level",
  "user_story",
  "--why-now",
  "CR114",
];
const PULL_DS1 = [
  "pull-item",
  "--item-code",
  "CV1.DS1",
  "--item-title",
  "Checkout address",
  "--item-level",
  "delivery_story",
  "--why-now",
  "CR114",
];
const PULL_DS2 = [
  "pull-item",
  "--item-code",
  "CV1.DS2",
  "--item-title",
  "Checkout payment",
  "--item-level",
  "delivery_story",
  "--why-now",
  "CR114",
];

interface Move {
  readonly label: string;
  readonly act: Step;
  /** The list both surfaces must print once the move is made. */
  readonly expect: readonly NextAction[];
}

/**
 * Walk the moves. At each position, both surfaces print the expected list, and every
 * lifecycle step in it is accepted by its command, in a world replayed to that
 * position, so trying a step never changes the walk.
 */
function walk(moves: readonly Move[], steps: Partial<Record<NextAction, Step>>): void {
  const replay = (count: number): BuilderWorld => {
    const w = world();
    for (const move of moves.slice(0, count)) move.act(w);
    return w;
  };
  const w = world();
  try {
    for (const [index, move] of moves.entries()) {
      move.act(w);
      const { resume, show } = lists(w);
      assert.deepEqual(resume, [...move.expect], `${move.label}: the resume`);
      assert.deepEqual(show, [...move.expect], `${move.label}: build show`);
      for (const action of move.expect) {
        if (action.startsWith("inspect_") || action === "answer_pending_confirmation") continue;
        const step = steps[action];
        assert.ok(step, `${move.label}: ${action} routes to a command`);
        const fork = replay(index + 1);
        try {
          accepted(step(fork), `${move.label}: ${action}`);
        } finally {
          fork.db.close();
        }
      }
    }
  } finally {
    w.db.close();
  }
}

const authorPackage: Step = (w) => {
  assert.ok(w.plan, "Plan wrote plan.md");
  authorPlan(w.plan);
  authorStoryIndex(join(w.plan, "..", "index.md"));
  return runBuild(w, ["approve-plan"]);
};

test("CR114: a story's resume and build show name the same steps, and each one is taken", () => {
  walk(
    [
      {
        label: "pulled",
        act: (w) => runBuild(w, PULL_US1),
        expect: ["plan_active_item", ...INSPECT],
      },
      { label: "planned", act: (w) => runBuild(w, ["plan-item"]), expect: PENDING },
      {
        label: "approved",
        act: authorPackage,
        expect: ["implement_active_item", "validate_active_item", ...INSPECT],
      },
      {
        label: "validated",
        act: (w) => runBuild(w, VALIDATE),
        expect: ["review_active_item_debt", ...INSPECT],
      },
      {
        label: "reviewed",
        act: STORY_STEPS.review_active_item_debt as Step,
        expect: ["check_active_item_coherence", "close_active_item", ...INSPECT],
      },
      {
        label: "coherent",
        act: STORY_STEPS.check_active_item_coherence as Step,
        expect: ["close_active_item", ...INSPECT],
      },
      { label: "done", act: STORY_STEPS.close_active_item as Step, expect: NO_ITEM },
      {
        label: "the next story pulled",
        act: STORY_STEPS.pull_candidate_if_known as Step,
        expect: ["plan_active_item", ...INSPECT],
      },
    ],
    STORY_STEPS,
  );
});

test("CR114: a Delivery Story's resume and build show name the same steps, and each one is taken", () => {
  walk(
    [
      { label: "pulled and expanded", act: (w) => runBuild(w, PULL_DS1), expect: PENDING },
      {
        label: "flow chosen",
        act: (w) => runBuild(w, ["set-flow-unit", "--unit", "delivery_story"]),
        expect: PENDING,
      },
      {
        label: "planned",
        act: (w) =>
          runBuild(w, [
            "plan-delivery-story",
            "--objective",
            "Checkout takes an address",
            "--child",
            "CV1.DS1.US1",
            "--child",
            "CV1.DS1.TS1",
          ]),
        expect: PENDING,
      },
      {
        label: "approved",
        act: (w) => runBuild(w, ["approve-delivery-story-plan"]),
        expect: ["implement_active_item", "validate_active_item", ...INSPECT],
      },
      {
        label: "validated",
        act: DELIVERY_STORY_STEPS.validate_active_item as Step,
        expect: ["review_active_item_debt", ...INSPECT],
      },
      {
        label: "reviewed",
        act: DELIVERY_STORY_STEPS.review_active_item_debt as Step,
        expect: ["close_active_item", ...INSPECT],
      },
      { label: "done", act: DELIVERY_STORY_STEPS.close_active_item as Step, expect: NO_ITEM },
    ],
    DELIVERY_STORY_STEPS,
  );
});

test("CR114: a Delivery Story whose Expand was blocked is offered Expand, and Pull runs it", () => {
  walk(
    [
      {
        label: "Expand blocked",
        act: (w) => {
          const result = runBuild(w, PULL_DS2);
          assert.match(result.stdout, /<<<ARIAD:EXPAND_BLOCKED>>>/u);
          return result;
        },
        expect: ["expand_active_item", ...INSPECT],
      },
    ],
    DELIVERY_STORY_STEPS,
  );
});

test("CR114: an item at Prepare whose level Plan refuses is offered no step, since Plan would refuse it", () => {
  // Pull accepts only the three levels, so this cursor is seeded: the handoff review
  // found the table offering Plan here, and Plan refusing it.
  for (const level of [null, "epic"]) {
    const w = world();
    try {
      setDeliveryCursor(
        w.db,
        {
          journey: "demo",
          method: "ariad",
          activeItem: "CV1.X1",
          activeItemLevel: level,
          lastDeliveryEvent: "prepare",
        },
        { nowIso: () => "2026-10-01T12:00:00+00:00" },
      );
      const { resume, show } = lists(w);
      assert.deepEqual(resume, [...INSPECT], `${level}: the resume`);
      assert.deepEqual(show, [...INSPECT], `${level}: build show`);
      const planned = runBuild(w, ["plan-item"]);
      assert.equal(planned.exitCode, 1, `${level}: Plan refuses this level`);
      assert.match(planned.stdout, /CHECKPOINT_REFUSED/u);
    } finally {
      w.db.close();
    }
  }
});

test("CR114 (D3): Prepare refuses a Done story through the front door, and nothing changes", () => {
  const w = world();
  try {
    runBuild(w, PULL_US1);
    runBuild(w, ["plan-item"]);
    authorPackage(w);
    runBuild(w, VALIDATE);
    (STORY_STEPS.review_active_item_debt as Step)(w);
    accepted((STORY_STEPS.close_active_item as Step)(w), "done");
    const cursor = () =>
      (
        w.db
          .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
          .get("__builder_delivery_cursor__:demo") as { metadata: string }
      ).metadata;
    const before = cursor();
    const refused = runBuild(w, ["prepare-item"]);
    assert.equal(refused.exitCode, 1);
    assert.match(refused.stdout, /^<<<ARIAD:CHECKPOINT_REFUSED>>>\n/u);
    assert.match(
      refused.stdout.replace(/[│\s]+/gu, " "),
      /reason Prepare is already complete for CV1\.DS1\.US1: the cursor is at done_complete\. /u,
    );
    assert.equal(cursor(), before, "the cursor did not move");
    assert.deepEqual(lists(w).show, [...NO_ITEM], "the closed story still offers the next pull");
  } finally {
    w.db.close();
  }
});

test("CR114: with no cursor, the resume and build show both say sync, and show gives no Pull", () => {
  const w = world({ sync: false });
  try {
    const { resume, show } = lists(w);
    assert.deepEqual(resume, ["sync_cursor", "inspect_method"]);
    assert.deepEqual(show, ["sync_cursor", "inspect_method"]);
    const shown = runBuild(w, ["show"]).stdout;
    assert.match(shown, /│ no delivery cursor yet +│/u);
    assert.doesNotMatch(shown, /pull explicitly/u, "Pull refuses without a cursor");
    accepted(runBuild(w, ["sync-cursor"]), "sync_cursor");
  } finally {
    w.db.close();
  }
});

test("CR114: with no item pulled, build show lists the moves for no item after its Pull command", () => {
  const w = world();
  try {
    const shown = runBuild(w, ["show"]).stdout;
    assert.deepEqual(listOf(shown, "ACTIVE_CHECKPOINT"), [...NO_ITEM]);
    assert.match(shown, /pull explicitly/u);
    assert.equal(
      listOf(renderBuilderEntrySurface(w.db, "demo", w.project), "BUILDER_ORIENTATION"),
      null,
    );
  } finally {
    w.db.close();
  }
});
