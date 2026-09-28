// CR105 — choosing a flow unit records the stop its own surface asks.
//
// `set-flow-unit --unit delivery_story` prints the Delivery Story scope question, and
// `--unit story_by_story` prints the next-story question. Until CR105 neither wrote
// its question to the cursor: Expand's story-by-story stop survived a choice of
// Delivery Story flow, so `build show` and the Builder resume reported a question that
// flow never asks. These tests drive the real commands over a scratch project, through
// both shapes of the flow decision: a Delivery Story expanded by `pull-item`, as a
// Navigator reaches it, and one seeded at `prepare`, as the recorded sequences reach it.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { invokeBuilderArgv } from "#builder/argv.ts";
import { getDeliveryCursor, setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { readBuilderResumeState } from "#builder/resumeState.ts";
import { renderBuilderResumeSurface } from "#builder/resumeSurface.ts";
import { resolveRoadmapScope } from "#builder/roadmapScope.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { createJourney } from "#journey/journeyWrite.ts";

const NOW = "2026-09-28T12:00:00.000000Z";
const JOURNEY = "j";
const SCOPE_STOP = ["delivery_story_scope_confirmation", "navigator_scope_confirmation"];
const STORY_STOP = ["next_story_confirmation", "navigator_story_confirmation"];

const DELIVERY_STORY = `# CV1.DS1 — Checkout address

**Status:** 🟡 Planned
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |
| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |
`;

interface World {
  readonly db: WritableDatabase;
  readonly project: string;
  run(...argv: string[]): { stdout: string; stderr: string; exitCode: number };
  stop(): string[];
  close(): void;
}

function world(): World {
  const root = mkdtempSync(join(tmpdir(), "flow-unit-stops-"));
  const project = join(root, "p");
  const roadmap = join(project, "docs", "project", "roadmap");
  mkdirSync(join(roadmap, "cv1", "ds1"), { recursive: true });
  writeFileSync(join(roadmap, "index.md"), "# Roadmap\n");
  writeFileSync(join(roadmap, "cv1", "index.md"), "# CV1 — Checkout\n\n**Status:** 🟢 Active\n");
  writeFileSync(join(roadmap, "cv1", "ds1", "index.md"), DELIVERY_STORY);
  const db = bootstrapDatabase(join(root, "memory.db"));
  createJourney(db, { id: "j-1", slug: JOURNEY, content: "# J", projectPath: project }, NOW);
  const run = (...argv: string[]) =>
    invokeBuilderArgv(db, [...argv, "--journey", JOURNEY, "--method", "ariad"], {
      nowIso: () => NOW,
    });
  assert.equal(run("adopt").exitCode, 0);
  assert.equal(run("sync-cursor").exitCode, 0);
  return {
    db,
    project,
    run,
    stop() {
      const cursor = getDeliveryCursor(db, JOURNEY);
      return [cursor?.activeCheckpoint ?? "none", cursor?.pendingConfirmation ?? "none"];
    },
    close() {
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function pullDeliveryStory(w: World): void {
  const pulled = w.run(
    "pull-item",
    "--item-code",
    "CV1.DS1",
    "--item-level",
    "delivery_story",
    "--item-title",
    "Checkout address",
    "--why-now",
    "now",
  );
  assert.equal(pulled.exitCode, 0, pulled.stderr);
}

/** The recorded sequences' shape: a Delivery Story at `prepare`, nothing pending. */
function seedPreparedDeliveryStory(w: World, navigatorFlowUnit: string | null = null): void {
  setDeliveryCursor(
    w.db,
    {
      journey: JOURNEY,
      method: "ariad",
      activeItem: "CV1.DS1",
      activeItemTitle: "Checkout address",
      activeItemLevel: "delivery_story",
      lastDeliveryEvent: "prepare",
      childWorkItems: ["CV1.DS1.US1", "CV1.DS1.TS1"],
      navigatorFlowUnit,
    },
    { nowIso: () => NOW },
  );
}

function choose(w: World, unit: string): string {
  const chosen = w.run("set-flow-unit", "--unit", unit);
  assert.equal(chosen.exitCode, 0, chosen.stderr);
  return chosen.stdout;
}

test("after Expand, each flow unit records the question its surface asks, both ways", () => {
  const w = world();
  try {
    pullDeliveryStory(w);
    assert.deepEqual(w.stop(), STORY_STOP, "Expand's own stop");

    assert.match(choose(w, "delivery_story"), /<<<ARIAD:DELIVERY_STORY_SCOPE_CONFIRMATION>>>/u);
    assert.deepEqual(w.stop(), SCOPE_STOP);

    assert.match(choose(w, "story_by_story"), /<<<ARIAD:NEXT_STORY_CONFIRMATION>>>/u);
    assert.deepEqual(w.stop(), STORY_STOP);

    choose(w, "delivery_story");
    assert.deepEqual(w.stop(), SCOPE_STOP);
  } finally {
    w.close();
  }
});

test("on a prepared Delivery Story, each flow unit records its question too", () => {
  const w = world();
  try {
    seedPreparedDeliveryStory(w);
    choose(w, "delivery_story");
    assert.deepEqual(w.stop(), SCOPE_STOP);
    choose(w, "story_by_story");
    assert.deepEqual(w.stop(), STORY_STOP);
  } finally {
    w.close();
  }
});

test("the Builder resume at the scope stop names the scope question and nothing else", () => {
  const w = world();
  try {
    pullDeliveryStory(w);
    choose(w, "delivery_story");
    const state = readBuilderResumeState(w.db, JOURNEY);
    const surface = renderBuilderResumeSurface(state, {
      scope: resolveRoadmapScope(w.project, state.cursor),
    });
    const rows = surface.split("\n").map((line) => line.replaceAll("│", "").trim());
    const after = (label: string) => rows[rows.indexOf(label) + 1];
    assert.equal(after("pending confirmation"), "navigator_scope_confirmation");
    assert.equal(after("active checkpoint"), "delivery_story_scope_confirmation");
    assert.deepEqual(state.allowedNextActions, ["answer_pending_confirmation", "inspect_method"]);
    assert.doesNotMatch(surface, /navigator_story_confirmation|next_story_confirmation/u);
  } finally {
    w.close();
  }
});

test("the Delivery Story Plan replaces the scope stop, and does not require it", () => {
  const w = world();
  try {
    pullDeliveryStory(w);
    choose(w, "delivery_story");
    const plan = (...extra: string[]) =>
      w.run("plan-delivery-story", "--objective", "Checkout takes an address", ...extra);
    assert.equal(plan().exitCode, 0);
    assert.deepEqual(w.stop(), [
      "after_delivery_story_plan",
      "navigator_delivery_story_plan_approval",
    ]);
  } finally {
    w.close();
  }
  // Recorded, not enforced (CR001): a Delivery Story in Delivery Story flow with no
  // stop pending plans all the same.
  const bare = world();
  try {
    seedPreparedDeliveryStory(bare, "delivery_story");
    assert.deepEqual(bare.stop(), ["none", "none"]);
    const planned = bare.run("plan-delivery-story", "--objective", "Checkout takes an address");
    assert.equal(planned.exitCode, 0, planned.stderr);
    assert.deepEqual(bare.stop(), [
      "after_delivery_story_plan",
      "navigator_delivery_story_plan_approval",
    ]);
  } finally {
    bare.close();
  }
});
