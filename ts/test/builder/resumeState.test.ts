// CV22.DS7.US8 plateau 2 — resume state, the Workbench read, and the guard.
//
// Everything here was blocked on the delivery cursor, which is why it did not land
// in plateau 1. Three things are graded:
//
//   * `readBuilderResumeState`'s three precedence states and their action tuples;
//   * the implementation guard's four outcomes and two surfaces.
//
// CV22.DS10.TS4 removed the Workbench read this file used to grade, and with it
// the asymmetry that was worth reading first: Python's Home path swallowed a
// missing-tables error while the Resume path raised, so a pre-CV20.DS6 database
// degraded in one and failed in the other. Both engines now ignore those tables,
// so what is pinned is the absence of that failure.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { cardText } from "#builder/card.ts";
import { type SetDeliveryCursorOptions, setDeliveryCursor } from "#builder/deliveryCursor.ts";
import {
  assertImplementationAllowed,
  ImplementationBlockedError,
  renderImplementationGuardAllowed,
  renderImplementationGuardBlocked,
} from "#builder/implementationGuard.ts";
import {
  renderChangeRequestLifecycleRibbon,
  renderLifecycleRibbon,
  renderRefinementLifecycleRibbon,
} from "#builder/lifecycleRibbon.ts";
import { setAdoptedMethod } from "#builder/methodAdoption.ts";
import { readBuilderResumeState } from "#builder/resumeState.ts";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import golden from "#goldens/builder-resume-state.golden.json" with { type: "json" };
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

interface StateDump {
  journey: string;
  adopted_method: string | null;
  cursor_active_item: string | null;
  cursor_present: boolean;
  resumable: boolean;
  reason: string | null;
  allowed_next_actions: string[];
}

const oracle = golden as unknown as {
  frozen_now: string;
  journey: string;
  ribbons: Record<string, Record<string, string>>;
  ribbon_refusals: { kind: string; expected?: string; expected_error?: string }[];
  guards: {
    name: string;
    cursor: Record<string, unknown> | null;
    outcome: string;
    reason?: string;
    surface: string;
  }[];
  resume: { name: string; seed: Record<string, unknown>; expected: StateDump }[];
  resume_empty_journey: { expected?: string; expected_error?: string };
  resume_missing_tables: { expected: StateDump };
};

const NOW = oracle.frozen_now;
const JOURNEY = oracle.journey;
const directories: string[] = [];

test.after(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

/** The three Workbench tables, in the production shape. */
const WORKBENCH_DDL = `
  CREATE TABLE builder_refinement_stories (
    id TEXT PRIMARY KEY, journey TEXT NOT NULL, display_code TEXT NOT NULL,
    title TEXT NOT NULL, description TEXT, status TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual',
    provenance TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    pulled_at TEXT, closed_at TEXT
  );
  CREATE TABLE builder_change_requests (
    id TEXT PRIMARY KEY, journey TEXT NOT NULL, display_code TEXT NOT NULL,
    refinement_story_id TEXT REFERENCES builder_refinement_stories(id),
    title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual',
    provenance TEXT, outcome_notes TEXT, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, completed_at TEXT
  );
  CREATE TABLE builder_refinement_cursors (
    journey TEXT PRIMARY KEY,
    active_refinement_story_id TEXT REFERENCES builder_refinement_stories(id),
    active_change_request_id TEXT REFERENCES builder_change_requests(id),
    last_refinement_event TEXT, updated_at TEXT NOT NULL
  );
`;

function harness(options: { workbenchTables?: boolean } = {}) {
  const directory = mkdtempSync("/tmp/builder-resume-state-");
  directories.push(directory);
  const db = openDatabaseCopyForWrite(join(directory, "copy.db"));
  createRuntimeTables(db);
  if (options.workbenchTables ?? true) db.exec(WORKBENCH_DDL);
  return { db, deps: { nowIso: () => NOW } };
}

/** Mirror the generator's `_seed_workbench`. */
function dumpState(state: ReturnType<typeof readBuilderResumeState>): StateDump {
  return {
    journey: state.journey,
    adopted_method: state.adoptedMethod,
    cursor_active_item: state.cursor?.activeItem ?? null,
    cursor_present: state.cursor !== null,
    resumable: state.resumable,
    reason: state.reason,
    allowed_next_actions: [...state.allowedNextActions],
  };
}

/** Rebuild a cursor payload from the golden's recorded changes. */
function cursorOptions(changes: Record<string, unknown>): SetDeliveryCursorOptions {
  const map: Record<string, string> = {
    active_item: "activeItem",
    active_item_level: "activeItemLevel",
    active_checkpoint: "activeCheckpoint",
    pending_confirmation: "pendingConfirmation",
    last_delivery_event: "lastDeliveryEvent",
    navigator_flow_unit: "navigatorFlowUnit",
    aggregate_checkpoint_status: "aggregateCheckpointStatus",
  };
  const options: Record<string, unknown> = { journey: JOURNEY, method: "ariad" };
  for (const [key, value] of Object.entries(changes)) {
    const mapped = map[key];
    assert.ok(mapped, `unmapped cursor key ${key}`);
    options[mapped] = value;
  }
  return options as unknown as SetDeliveryCursorOptions;
}

test("every lifecycle ribbon matches Python", () => {
  for (const [stage, expected] of Object.entries(oracle.ribbons.delivery ?? {})) {
    assert.equal(renderLifecycleRibbon(stage), expected, `delivery/${stage}`);
  }
  for (const [stage, expected] of Object.entries(oracle.ribbons.refinement ?? {})) {
    assert.equal(renderRefinementLifecycleRibbon(stage), expected, `refinement/${stage}`);
  }
  for (const [stage, expected] of Object.entries(oracle.ribbons.change_request ?? {})) {
    assert.equal(renderChangeRequestLifecycleRibbon(stage), expected, `change_request/${stage}`);
  }
});

test("an unknown ribbon stage refuses with Python's vocabulary-specific message", () => {
  const renderers: Record<string, (stage: string) => string> = {
    delivery: renderLifecycleRibbon,
    refinement: renderRefinementLifecycleRibbon,
    change_request: renderChangeRequestLifecycleRibbon,
  };
  for (const entry of oracle.ribbon_refusals) {
    const renderer = renderers[entry.kind];
    assert.ok(renderer, entry.kind);
    assert.throws(
      () => renderer("bogus"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(`ValueError: ${error.message}`, entry.expected_error, entry.kind);
        return true;
      },
      entry.kind,
    );
  }
});

test("readBuilderResumeState matches Python in all three precedence states", () => {
  // 9 before CV22.DS10.TS4, which removed the three cases that existed only
  // to exercise the Workbench seed and the include_refinement switch.
  assert.ok(oracle.resume.length >= 6);
  for (const entry of oracle.resume) {
    const seed = entry.seed as {
      adopt: boolean;
      cursor: Record<string, unknown> | null;
    };
    const { db, deps } = harness();
    try {
      if (seed.adopt) setAdoptedMethod(db, JOURNEY, "ariad", () => NOW);
      if (seed.cursor !== null) setDeliveryCursor(db, cursorOptions(seed.cursor), deps);
      const state = readBuilderResumeState(db, JOURNEY);
      assert.deepEqual(dumpState(state), entry.expected, entry.name);
    } finally {
      db.close();
    }
  }
});

test("a database without the Workbench tables resumes instead of raising", () => {
  // CV22.DS10.TS4 removed the asymmetry this test used to pin: Python called
  // the Workbench read unguarded here and wrapped it on the Home path, so a
  // pre-CV20.DS6 database degraded there and RAISED here. Nothing reads those
  // tables now, so the path that used to fail is the one graded.
  const { db, deps } = harness({ workbenchTables: false });
  try {
    setAdoptedMethod(db, JOURNEY, "ariad", () => NOW);
    setDeliveryCursor(db, { journey: JOURNEY, method: "ariad", activeItem: "CV1" }, deps);
    assert.deepEqual(
      dumpState(readBuilderResumeState(db, JOURNEY)),
      oracle.resume_missing_tables.expected,
    );
  } finally {
    db.close();
  }
});

test("readBuilderResumeState refuses an empty journey", () => {
  const { db } = harness();
  try {
    assert.throws(
      () => readBuilderResumeState(db, "   "),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(`ValueError: ${error.message}`, oracle.resume_empty_journey.expected_error);
        return true;
      },
    );
  } finally {
    db.close();
  }
});

test("the implementation guard matches Python in all eleven states, surfaces included", () => {
  assert.ok(oracle.guards.length >= 11);
  for (const entry of oracle.guards) {
    const { db, deps } = harness();
    try {
      if (entry.cursor !== null) setDeliveryCursor(db, cursorOptions(entry.cursor), deps);
      if (entry.outcome === "allowed") {
        const cursor = assertImplementationAllowed(db, JOURNEY);
        assert.equal(renderImplementationGuardAllowed(cursor), entry.surface, entry.name);
        continue;
      }
      assert.throws(
        () => assertImplementationAllowed(db, JOURNEY),
        (error: unknown) => {
          assert.ok(error instanceof ImplementationBlockedError, entry.name);
          assert.equal(error.message, entry.reason, `${entry.name} reason`);
          assert.equal(renderImplementationGuardBlocked(error.message), entry.surface, entry.name);
          return true;
        },
        entry.name,
      );
    } finally {
      db.close();
    }
  }
});

test("a pending confirmation outranks an approved Plan", () => {
  const entry = oracle.guards.find(
    (candidate) => candidate.name === "pending_confirmation_blocks_even_when_approved",
  );
  assert.ok(entry);
  assert.equal(entry.outcome, "blocked");
  assert.match(entry.reason ?? "", /pending confirmation navigator_approval\.$/u);
});

test("the Delivery Story combination needs all four conditions", () => {
  const complete = oracle.guards.find((entry) => entry.name === "ds_plan_approved_complete");
  assert.equal(complete?.outcome, "allowed");
  for (const name of [
    "ds_plan_wrong_level",
    "ds_plan_wrong_flow_unit",
    "ds_plan_without_aggregate_status",
    "ds_plan_other_aggregate_status",
  ]) {
    const entry = oracle.guards.find((candidate) => candidate.name === name);
    assert.equal(entry?.outcome, "blocked", name);
    // Each failure produces the GENERIC refusal, not a specific one — so the
    // Navigator cannot tell which condition was missing.
    assert.equal(
      entry?.reason,
      "Implementation is blocked: approved Plan is required before Implement.",
      name,
    );
  }
});

test("an active item is not required for the guard to allow implementation", () => {
  // Reads like an oversight; it is Python's behavior, and the surface prints
  // `active item / none`.
  const entry = oracle.guards.find(
    (candidate) => candidate.name === "plan_approved_without_active_item",
  );
  assert.ok(entry);
  assert.equal(entry.outcome, "allowed");
  // Both are padded card rows, so the assertion is on the rows themselves.
  assert.ok(entry.surface.includes(cardText("active item")));
  assert.ok(entry.surface.includes(cardText("none")));
});
