// CR067 with CR020 — where a story's delivery cursor stands, and refusals that say so.
//
// Hand-written expectations, never goldens: the stage table and the already-complete
// rule are new behavior with no oracle to record them from. The agreement test runs
// the five real lifecycle functions against every event in the table, so the order
// written here and the guards written in `plan.ts` and `closure.ts` cannot drift apart.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { approvePlanCheckpoint } from "#builder/approve.ts";
import { getAriadMethod } from "#builder/ariadMethod.ts";
import { renderCheckpointRefused } from "#builder/checkpointRefused.ts";
import {
  coherenceLifecycleItem,
  doneLifecycleItem,
  reviewLifecycleItem,
  validateLifecycleItem,
} from "#builder/closure.ts";
import { lifecycleStageOf, STORY_LIFECYCLE_EVENTS } from "#builder/cursorPosition.ts";
import { getDeliveryCursor, setDeliveryCursor } from "#builder/deliveryCursor.ts";
import {
  isAlreadyComplete,
  LifecycleRefusal,
  type LifecycleStep,
} from "#builder/lifecycleRefusal.ts";
import { planLifecycleItem } from "#builder/plan.ts";
import { prepareLifecycleItem } from "#builder/prepare.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

const NOW = "2026-09-26T12:00:00+00:00";
const deps = { nowIso: () => NOW };
const directories: string[] = [];

test.after(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

function database(): WritableDatabase {
  // `openDatabaseCopyForWrite` accepts only a target under a literal `tmp/` path.
  const directory = mkdtempSync("/tmp/lifecycle-refusal-");
  directories.push(directory);
  const db = openDatabaseCopyForWrite(join(directory, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  return db;
}

test("CR067: the ribbon stage comes from the cursor's last event", () => {
  const stage = (event: string | null, level = "technical_story") =>
    lifecycleStageOf({ lastDeliveryEvent: event, activeItemLevel: level });
  const expected: Record<string, string> = {
    pull: "prepare",
    prepare: "plan",
    plan: "plan",
    plan_approved: "implement",
    implementation_complete: "validate",
    validate: "validate",
    validation_passed: "debt_review",
    review: "debt_review",
    review_complete: "done",
    coherence: "done",
    coherence_complete: "done",
    done: "done",
    done_complete: "done",
  };
  assert.deepEqual([...STORY_LIFECYCLE_EVENTS].sort(), Object.keys(expected).sort());
  for (const [event, value] of Object.entries(expected)) assert.equal(stage(event), value, event);
  assert.equal(stage("prepare", "delivery_story"), "expand", "a Delivery Story expands next");
  assert.equal(stage("delivery_story_plan"), null, "an event outside the table has no stage");
  assert.equal(stage(null), null);
});

test("CR067: a step is already complete once the cursor reaches its completing event", () => {
  assert.equal(isAlreadyComplete("plan", "prepare"), false);
  assert.equal(isAlreadyComplete("plan", "plan"), true);
  assert.equal(isAlreadyComplete("validate", "validate"), false, "Validation is in progress");
  assert.equal(isAlreadyComplete("validate", "validation_passed"), true);
  assert.equal(isAlreadyComplete("debt_review", "review"), false, "Debt Review re-entry");
  assert.equal(isAlreadyComplete("debt_review", "coherence_complete"), true);
  assert.equal(isAlreadyComplete("coherence", "coherence"), false, "Coherence re-entry");
  assert.equal(isAlreadyComplete("done", "coherence_complete"), false);
  assert.equal(isAlreadyComplete("done", "done_complete"), true);
  assert.equal(isAlreadyComplete("validate", "delivery_story_plan"), false, "outside the table");
  assert.equal(isAlreadyComplete("validate", null), false);
});

/** What each event leaves pending, as the lifecycle itself writes it. */
const PENDING_AFTER: Record<string, string | null> = {
  plan: "navigator_approval",
  validate: "navigator_validation",
  review: "navigator_debt_decision",
  coherence: "navigator_coherence",
  done: "navigator_done",
};

/** Run one step against a cursor at `event`: "proceeds", or the refusal's kind. */
function outcome(step: LifecycleStep, event: string): string {
  const db = database();
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.TS1",
        activeItemTitle: "First slice",
        activeItemLevel: "technical_story",
        lastDeliveryEvent: event,
        pendingConfirmation: PENDING_AFTER[event] ?? null,
        navigatorFlowUnit: "story_by_story",
      },
      deps,
    );
    const common = { journey: "demo", method: getAriadMethod() };
    const run: Record<LifecycleStep, () => unknown> = {
      prepare: () =>
        prepareLifecycleItem(db, { journey: "demo", method: "ariad", projectPath: null }, deps),
      plan: () => planLifecycleItem(db, common, deps),
      // No project: the step order is under test here, not the files (CR112 reads those).
      plan_approval: () =>
        approvePlanCheckpoint(
          db,
          { journey: "demo", method: "ariad", planArtifactPath: null },
          deps,
        ),
      validate: () =>
        validateLifecycleItem(
          db,
          {
            ...common,
            implementationComplete: true,
            automatedChecks: ["npm test"],
            checksStatus: "passed",
            e2eDecision: "not_required",
            e2eEvidence: "unit-level change",
            navigatorValidationRoute: "walk the route",
            navigatorAccepted: true,
            expectedObservation: "the change is visible",
            passCondition: "it is",
            failCondition: "it is not",
          },
          deps,
        ),
      debt_review: () =>
        reviewLifecycleItem(
          db,
          { ...common, debtFindings: ["No debt found"], debtDecision: "no_action" },
          deps,
        ),
      coherence: () =>
        coherenceLifecycleItem(
          db,
          { ...common, processAlignment: "p", projectAlignment: "p", productAlignment: "p" },
          deps,
        ),
      done: () =>
        doneLifecycleItem(
          db,
          {
            ...common,
            historyAction: "h",
            roadmapUpdate: "r",
            nextRecommendation: "n",
            indexArtifactPath: null,
          },
          deps,
        ),
    };
    run[step]();
    return "proceeds";
  } catch (error) {
    if (error instanceof LifecycleRefusal) {
      assert.equal(error.step, step, `${step} at ${event} names its own step`);
      return error.kind;
    }
    throw error;
  } finally {
    db.close();
  }
}

test("CR067: every command's outcome at every event agrees with the stage order", () => {
  const steps: LifecycleStep[] = [
    "prepare",
    "plan",
    "plan_approval",
    "validate",
    "debt_review",
    "coherence",
    "done",
  ];
  for (const step of steps) {
    for (const event of STORY_LIFECYCLE_EVENTS) {
      const result = outcome(step, event);
      assert.equal(
        result === "already_complete",
        isAlreadyComplete(step, event),
        `${step} at ${event}: ${result}`,
      );
      assert.ok(
        [
          "proceeds",
          "already_complete",
          "pending_confirmation",
          "not_reached",
          "missing_evidence",
        ].includes(result),
        `${step} at ${event}: ${result}`,
      );
    }
  }
});

test("CR114 (D3): Prepare is already complete once Plan is reached, and runs again before it", () => {
  assert.equal(isAlreadyComplete("prepare", "pull"), false);
  assert.equal(isAlreadyComplete("prepare", "prepare"), false, "Prepare at Prepare runs again");
  assert.equal(isAlreadyComplete("prepare", "plan"), true);
  assert.equal(isAlreadyComplete("prepare", "done_complete"), true);
});

/** Prepare on a cursor seeded at `event`: "proceeds", or the refusal, and the cursor after. */
function prepareAt(
  event: string | null,
  level: string,
  pendingConfirmation: string | null = null,
): { outcome: string; message: string | null; changed: boolean } {
  const db = database();
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: level === "delivery_story" ? "CV1.DS1" : "CV1.DS1.US1",
        activeItemLevel: level,
        lastDeliveryEvent: event,
        pendingConfirmation,
      },
      deps,
    );
    const before = getDeliveryCursor(db, "demo");
    try {
      prepareLifecycleItem(db, { journey: "demo", method: "ariad", projectPath: null }, deps);
      return { outcome: "proceeds", message: null, changed: true };
    } catch (error) {
      if (!(error instanceof LifecycleRefusal)) throw error;
      assert.equal(error.step, "prepare");
      return {
        outcome: error.kind,
        message: error.message,
        changed: JSON.stringify(getDeliveryCursor(db, "demo")) !== JSON.stringify(before),
      };
    }
  } finally {
    db.close();
  }
}

test("CR114 (D3): Prepare follows Pull, so a Delivery Story's own events and unknown ones refuse it", () => {
  const written: [string, string | null][] = [
    ["expand", "navigator_story_confirmation"],
    ["navigator_flow_unit_selected", "navigator_scope_confirmation"],
    ["delivery_story_plan", "navigator_delivery_story_plan_approval"],
    ["delivery_story_plan_approved", null],
    ["delivery_story_validation", "navigator_delivery_story_validation"],
    ["delivery_story_validation_complete", null],
    ["delivery_story_review_complete", null],
    ["delivery_story_coherence_complete", null],
    ["delivery_story_done_complete", null],
  ];
  for (const [event, pending] of written) {
    const pendingText = pending ? `, pending ${pending}` : "";
    assert.deepEqual(
      prepareAt(event, "delivery_story", pending),
      {
        outcome: "not_reached",
        message: `Prepare follows Pull: CV1.DS1 is at ${event}${pendingText}.`,
        changed: false,
      },
      event,
    );
  }
  assert.deepEqual(prepareAt("pulled", "user_story"), {
    outcome: "not_reached",
    message: "Prepare follows Pull: CV1.DS1.US1 is at pulled.",
    changed: false,
  });
  for (const level of ["user_story", "delivery_story"]) {
    for (const event of ["pull", "prepare", null]) {
      assert.equal(prepareAt(event, level).outcome, "proceeds", `${level} at ${event}`);
    }
  }
});

test("CR067: an already-complete refusal names the step, the item, and where the cursor is", () => {
  const db = database();
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.TS1",
        activeItemLevel: "technical_story",
        lastDeliveryEvent: "plan",
        pendingConfirmation: "navigator_approval",
      },
      deps,
    );
    assert.throws(
      () => planLifecycleItem(db, { journey: "demo", method: getAriadMethod() }, deps),
      (error: unknown) =>
        error instanceof LifecycleRefusal &&
        error.kind === "already_complete" &&
        error.message ===
          "Plan is already complete for CV1.DS1.TS1: the cursor is at plan, pending navigator_approval.",
    );
  } finally {
    db.close();
  }
});

test("CR067: the refusal surface quotes a slug that is not a plain token", () => {
  const surface = renderCheckpointRefused({
    request: "validate-item",
    reason: "Validation is blocked: pending confirmation navigator_approval.",
    journey: "x;touch PWNED",
    cursor: null,
  });
  assert.match(surface, /^<<<ARIAD:CHECKPOINT_REFUSED>>>\n/u);
  assert.ok(surface.includes("--journey 'x;touch PWNED'"), surface);
});

test("CR067: with no cursor the refusal has no ribbon and says no item was pulled", () => {
  const surface = renderCheckpointRefused({
    request: "plan-item",
    reason: "delivery cursor is required before plan",
    journey: "demo",
    cursor: null,
  });
  assert.doesNotMatch(surface, /Delivery Flow/u);
  assert.match(surface, /no item pulled yet/u);
});
