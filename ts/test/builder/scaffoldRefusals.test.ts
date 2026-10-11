// CR112 plateau 3 — approval and Done read the files they judge, and refuse a scaffold.
//
// Each test drives the lifecycle functions over a scratch project: Plan writes the
// scaffold for real, the test authors (or does not) with the same helper every
// lifecycle test uses, and the refusal is checked for its kind, its exact words, and
// for having changed nothing.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { approvePlanCheckpoint } from "#builder/approve.ts";
import { getAriadMethod } from "#builder/ariadMethod.ts";
import { artifactState } from "#builder/artifacts/scaffoldState.ts";
import { renderUserStoryIndex } from "#builder/artifacts/storyIndex.ts";
import { doneLifecycleItem } from "#builder/closure.ts";
import { getDeliveryCursor, setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { LifecycleRefusal } from "#builder/lifecycleRefusal.ts";
import { PlanPreauthorizationMismatch } from "#builder/planPreauthorization.ts";
import {
  approveStoryPlanWithPreauthorization,
  renderStoryPlanPreauthorizationMismatch,
} from "#builder/storyPlanPreauthorization.ts";
import { authorPlan, authorSections, authorStoryIndex } from "#helpers/authorScaffold.ts";
import {
  storyDeps as deps,
  STORY_PACKAGE as PACKAGE,
  planStory,
  removeStoryWorlds,
  type StoryWorld as World,
  storyWorld as world,
} from "#helpers/storyWorld.ts";

test.after(removeStoryWorlds);

function plan(w: World, preauthorize = false): void {
  planStory(w, { preauthorize });
}

function approve(w: World, planPath: string | null = w.plan) {
  return approvePlanCheckpoint(
    w.db,
    { journey: "demo", method: "ariad", planArtifactPath: planPath, projectRoot: w.project },
    deps,
  );
}

/** Run `action`, require a refusal of `kind`, and prove nothing moved. */
function refused(w: World, action: () => unknown, kind: string): string {
  const cursor = JSON.stringify(getDeliveryCursor(w.db, "demo"));
  const files = existsSync(w.plan) ? readFileSync(w.plan, "utf8") : null;
  let message = "";
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof LifecycleRefusal, String(error));
    assert.equal(error.kind, kind);
    message = error.message;
    return true;
  });
  assert.equal(JSON.stringify(getDeliveryCursor(w.db, "demo")), cursor, "the cursor is unchanged");
  assert.equal(
    existsSync(w.plan) ? readFileSync(w.plan, "utf8") : null,
    files,
    "the plan is unchanged",
  );
  return message;
}

test("CR112: ordinary approval refuses the untouched scaffold and names every section to write", () => {
  const w = world();
  plan(w);
  const message = refused(w, () => approve(w), "missing_evidence");
  assert.equal(
    message,
    `Plan approval needs an authored plan. Still to author in ${PACKAGE}/plan.md: Objective, Scope, Acceptance Behavior, Validation Route.`,
  );
});

test("CR112: a partly authored plan is refused for exactly what is left, and an authored one approves", () => {
  const w = world();
  plan(w);
  writeFileSync(w.plan, authorSections(readFileSync(w.plan, "utf8"), ["Scope"]), "utf8");
  const message = refused(w, () => approve(w), "missing_evidence");
  assert.match(message, /: Objective, Acceptance Behavior, Validation Route\.$/u);
  authorPlan(w.plan);
  assert.equal(approve(w).lastDeliveryEvent, "plan_approved");
});

test("CR112: an emptied required section is refused on the ordinary route, as the preauthorized one always did", () => {
  const w = world();
  plan(w);
  authorPlan(w.plan);
  writeFileSync(
    w.plan,
    readFileSync(w.plan, "utf8").replace(/## Non-Goals\n\n[^#]*/u, "## Non-Goals\n\n"),
    "utf8",
  );
  assert.match(
    refused(w, () => approve(w), "missing_evidence"),
    /: Non-Goals\.$/u,
  );
});

test("CR112: every section a refusal names is a heading in the file, by its exact text", () => {
  const w = world();
  plan(w);
  const message = refused(w, () => approve(w), "missing_evidence");
  const named = (message.split(": ").at(-1) ?? "").replace(/\.$/u, "").split(", ");
  const text = readFileSync(w.plan, "utf8");
  for (const name of named) assert.ok(text.includes(`\n## ${name}\n`), `## ${name} is in plan.md`);
});

test("CR112: with a project and no plan.md, approval is refused and says the file is missing", () => {
  const w = world("plan", "navigator_approval");
  setDeliveryCursor(
    w.db,
    {
      journey: "demo",
      method: "ariad",
      activeItem: "CV1.DS1.US1",
      activeItemLevel: "user_story",
      lastDeliveryEvent: "plan",
      activeCheckpoint: "after_plan",
      pendingConfirmation: "navigator_approval",
    },
    deps,
  );
  assert.equal(
    refused(w, () => approve(w), "missing_evidence"),
    `Plan approval needs an authored plan, and ${PACKAGE}/plan.md does not exist.`,
  );
});

test("CR112: with no project there is no file to read, and approval proceeds as it always did", () => {
  const w = world();
  plan(w);
  assert.equal(approve(w, null).lastDeliveryEvent, "plan_approved");
});

test("CR112: the approval precondition is a refusal that says where the cursor stands", () => {
  const notYet = world();
  assert.equal(
    refused(notYet, () => approve(notYet), "not_reached"),
    "Plan approval requires a Plan awaiting approval: run plan-item first.",
  );
  const twice = world();
  plan(twice);
  authorPlan(twice.plan);
  approve(twice);
  assert.equal(
    refused(twice, () => approve(twice), "already_complete"),
    "Plan approval is already complete for CV1.DS1.US1: the cursor is at plan_approved.",
  );
  const elsewhere = world("delivery_story_plan", "navigator_delivery_story_plan_approval");
  assert.equal(
    refused(elsewhere, () => approve(elsewhere), "pending_confirmation"),
    "Plan approval is blocked: pending confirmation navigator_delivery_story_plan_approval.",
  );
});

test("CR112: the preauthorized route refuses the scaffold too, and its surface names the sections", () => {
  const w = world();
  plan(w, true);
  let sections: readonly string[] = [];
  assert.throws(
    () =>
      approveStoryPlanWithPreauthorization(
        w.db,
        { journey: "demo", method: "ariad", planArtifactPath: w.plan },
        deps,
      ),
    (error: unknown) => {
      assert.ok(error instanceof PlanPreauthorizationMismatch);
      assert.equal(error.reason, "plan_incomplete");
      sections = error.sections;
      return true;
    },
  );
  assert.deepEqual(sections, ["Objective", "Scope", "Acceptance Behavior", "Validation Route"]);
  const surface = renderStoryPlanPreauthorizationMismatch({
    activeItem: "CV1.DS1.US1",
    reason: "plan_incomplete",
    toAuthor: sections,
  });
  assert.match(surface, /│ To author in plan\.md +│\n│ - Objective +│\n│ - Scope +│/u);
  // The receipt keeps the reason as a token: a persisted cursor reads back as before.
  assert.equal(getDeliveryCursor(w.db, "demo")?.planPreauthorization?.reason, "plan_incomplete");
});

test("CR112: the preauthorized route approves an authored plan and starts implementation", () => {
  const w = world();
  plan(w, true);
  authorPlan(w.plan);
  const report = approveStoryPlanWithPreauthorization(
    w.db,
    { journey: "demo", method: "ariad", planArtifactPath: w.plan },
    deps,
  );
  assert.equal(report.implementationStarted, true);
  assert.deepEqual(report.unfilledSections, []);
});

// CR111 D4: `build show` read `authored` over an approval that refused, because approval
// also requires Non-Goals and the Implementation Contract and `build show` did not look.
test("CR111 D4: build show names exactly what both approval routes refuse on", () => {
  const stripDefaults = (path: string) =>
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replace(/## Non-Goals\n\n[^#]*/u, "")
        .replace(/## Implementation Contract\n\n[^#]*/u, ""),
      "utf8",
    );

  const ordinary = world();
  plan(ordinary);
  authorPlan(ordinary.plan);
  stripDefaults(ordinary.plan);
  const verdict = artifactState("plan.md", ordinary.plan);
  assert.equal(verdict.state, "partly_authored");
  assert.deepEqual(verdict.toAuthor, ["Non-Goals", "Implementation Contract"]);
  assert.match(
    refused(ordinary, () => approve(ordinary), "missing_evidence"),
    /: Non-Goals, Implementation Contract\.$/u,
  );

  const preauthorized = world();
  plan(preauthorized, true);
  authorPlan(preauthorized.plan);
  stripDefaults(preauthorized.plan);
  assert.throws(
    () =>
      approveStoryPlanWithPreauthorization(
        preauthorized.db,
        { journey: "demo", method: "ariad", planArtifactPath: preauthorized.plan },
        deps,
      ),
    (error: unknown) => {
      assert.ok(error instanceof PlanPreauthorizationMismatch);
      assert.deepEqual(error.sections, verdict.toAuthor);
      return true;
    },
  );
});

test("CR112: another mismatch keeps its surface: no sections, no To author block", () => {
  const surface = renderStoryPlanPreauthorizationMismatch({
    activeItem: "CV1.DS1.US1",
    reason: "authorization_missing",
  });
  assert.doesNotMatch(surface, /To author/u);
});

// --- story Done reads the story's own record (D4) ---------------------------

function reviewed(w: World): void {
  setDeliveryCursor(
    w.db,
    {
      journey: "demo",
      method: "ariad",
      activeItem: "CV1.DS1.US1",
      activeItemTitle: "Enter an address",
      activeItemLevel: "user_story",
      lastDeliveryEvent: "review_complete",
      navigatorFlowUnit: "story_by_story",
    },
    deps,
  );
}

function done(w: World) {
  return doneLifecycleItem(
    w.db,
    {
      journey: "demo",
      method: getAriadMethod(),
      historyAction: "h",
      roadmapUpdate: "r",
      nextRecommendation: "n",
      indexArtifactPath: w.index,
      projectRoot: w.project,
    },
    deps,
  );
}

test("CR112: Done refuses a story whose index still says what Expand wrote", () => {
  const w = world();
  writeFileSync(w.index, renderUserStoryIndex("CV1.DS1.US1", "Enter an address"), "utf8");
  reviewed(w);
  assert.equal(
    refused(w, () => done(w), "missing_evidence"),
    `Done needs the story's own record. Still to author in ${PACKAGE}/index.md: User Story, Outcome, Acceptance Behavior.`,
  );
});

test("CR112: an index edited elsewhere with the template statement is still refused, for the statement", () => {
  const w = world();
  writeFileSync(
    w.index,
    authorSections(renderUserStoryIndex("CV1.DS1.US1", "Enter an address"), [
      "Outcome",
      "Acceptance Behavior",
    ]),
    "utf8",
  );
  reviewed(w);
  assert.match(
    refused(w, () => done(w), "missing_evidence"),
    /index\.md: User Story\.$/u,
  );
});

test("CR112: Done closes an authored index, an index in the Driver's own structure, and no index", () => {
  const authored = world();
  writeFileSync(authored.index, renderUserStoryIndex("CV1.DS1.US1", "Enter an address"), "utf8");
  authorStoryIndex(authored.index);
  reviewed(authored);
  assert.equal(done(authored).cursor.lastDeliveryEvent, "done_complete");

  const own = world();
  writeFileSync(own.index, "# CV1.DS1.US1 — Enter an address\n\n## Why\n\nBecause.\n", "utf8");
  reviewed(own);
  assert.equal(done(own).cursor.lastDeliveryEvent, "done_complete");

  const none = world();
  reviewed(none);
  assert.equal(done(none).cursor.lastDeliveryEvent, "done_complete");
});
