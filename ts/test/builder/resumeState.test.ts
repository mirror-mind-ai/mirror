// CV22.DS7.US8 plateau 2 — resume state, the Workbench read, and the guard.
//
// Everything here was blocked on the delivery cursor, which is why it did not land
// in plateau 1. Three things are graded:
//
//   * `readBuilderResumeState`'s three precedence states and their action tuples;
//   * `getWorkbenchSnapshot`, the one Workbench read D1 could not retire,
//     including the database that has no Workbench tables at all;
//   * the implementation guard's four outcomes and two surfaces.
//
// The asymmetry test is the one to read first: Python's Home path swallows a
// missing-tables error and the Resume path does not, so a pre-CV20.DS6 database
// degrades in one and raises in the other. Both halves are pinned, because
// "fixing" it in the port would make TS diverge from the engine it is replacing.

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
import {
  getWorkbenchSnapshot,
  safeWorkbenchSnapshot,
  WorkbenchTablesMissingError,
} from "#builder/workbenchSnapshot.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/builder-resume-state.golden.json" with { type: "json" };
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

interface SnapshotDump {
  storage_state: string;
  active_refinement_story: { display_code: string; title: string; status: string } | null;
  active_change_request: { display_code: string; title: string; status: string } | null;
  last_refinement_event: string | null;
  refinement_story_count: number;
  change_request_count: number;
  unassigned_change_request_count: number;
}

interface StateDump {
  journey: string;
  adopted_method: string | null;
  cursor_active_item: string | null;
  cursor_present: boolean;
  resumable: boolean;
  reason: string | null;
  allowed_next_actions: string[];
  refinement: SnapshotDump | null;
}

const oracle = golden as unknown as {
  frozen_now: string;
  journey: string;
  ribbons: Record<string, Record<string, string>>;
  ribbon_refusals: { kind: string; expected?: string; expected_error?: string }[];
  workbench: { name: string; seed: Record<string, unknown>; expected: SnapshotDump }[];
  workbench_missing_tables: { expected?: string; expected_error?: string };
  guards: {
    name: string;
    cursor: Record<string, unknown> | null;
    outcome: string;
    reason?: string;
    surface: string;
  }[];
  resume: { name: string; seed: Record<string, unknown>; expected: StateDump }[];
  resume_empty_journey: { expected?: string; expected_error?: string };
  resume_missing_tables: { expected_error?: string; excluded_ok?: StateDump };
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
function seedWorkbench(
  db: WritableDatabase,
  seed: { stories: number; crs: number; unassigned: number; active: boolean },
): void {
  for (let index = 0; index < seed.stories; index += 1) {
    db.prepare(
      `INSERT INTO builder_refinement_stories
       (id, journey, display_code, title, description, status, position, source,
        provenance, created_at, updated_at, pulled_at, closed_at)
       VALUES (?, ?, ?, ?, NULL, 'active', ?, 'manual', NULL, ?, ?, NULL, NULL)`,
    ).run(
      `rs-${index}`,
      JOURNEY,
      `RS-${String(index + 1).padStart(3, "0")}`,
      `Refinement story ${index + 1}`,
      index,
      NOW,
      NOW,
    );
  }
  for (let index = 0; index < seed.crs; index += 1) {
    const assigned = index < seed.unassigned ? null : "rs-0";
    db.prepare(
      `INSERT INTO builder_change_requests
       (id, journey, display_code, refinement_story_id, title, body, status, position,
        source, provenance, outcome_notes, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, 'body', 'captured', ?, 'manual', NULL, NULL, ?, ?, NULL)`,
    ).run(
      `cr-${index}`,
      JOURNEY,
      `CR-${String(index + 1).padStart(3, "0")}`,
      assigned,
      `Change request ${index + 1}`,
      index,
      NOW,
      NOW,
    );
  }
  if (seed.active) {
    db.prepare(
      `INSERT INTO builder_refinement_cursors
       (journey, active_refinement_story_id, active_change_request_id,
        last_refinement_event, updated_at)
       VALUES (?, 'rs-0', 'cr-0', 'change_request_selected', ?)`,
    ).run(JOURNEY, NOW);
  }
}

function dumpSnapshot(
  snapshot: ReturnType<typeof getWorkbenchSnapshot> | null,
): SnapshotDump | null {
  if (snapshot === null) return null;
  const reduce = (row: { displayCode: string; title: string; status: string } | null) =>
    row === null ? null : { display_code: row.displayCode, title: row.title, status: row.status };
  return {
    storage_state: snapshot.storageState,
    active_refinement_story: reduce(snapshot.activeRefinementStory),
    active_change_request: reduce(snapshot.activeChangeRequest),
    last_refinement_event: snapshot.lastRefinementEvent,
    refinement_story_count: snapshot.refinementStoryCount,
    change_request_count: snapshot.changeRequestCount,
    unassigned_change_request_count: snapshot.unassignedChangeRequestCount,
  };
}

function dumpState(state: ReturnType<typeof readBuilderResumeState>): StateDump {
  return {
    journey: state.journey,
    adopted_method: state.adoptedMethod,
    cursor_active_item: state.cursor?.activeItem ?? null,
    cursor_present: state.cursor !== null,
    resumable: state.resumable,
    reason: state.reason,
    allowed_next_actions: [...state.allowedNextActions],
    refinement: dumpSnapshot(state.refinement as ReturnType<typeof getWorkbenchSnapshot> | null),
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

test("getWorkbenchSnapshot matches Python across row shapes", () => {
  assert.ok(oracle.workbench.length >= 4);
  for (const entry of oracle.workbench) {
    const { db } = harness();
    try {
      seedWorkbench(
        db,
        entry.seed as { stories: number; crs: number; unassigned: number; active: boolean },
      );
      assert.deepEqual(dumpSnapshot(getWorkbenchSnapshot(db, JOURNEY)), entry.expected, entry.name);
    } finally {
      db.close();
    }
  }
});

test("a database without the Workbench tables raises, and the Home path swallows it", () => {
  // Python: `get_workbench_snapshot` raises `sqlite3.OperationalError`;
  // `_safe_workbench_snapshot` returns None. Both halves must hold.
  assert.equal(oracle.workbench_missing_tables.expected_error, "OperationalError");
  const { db } = harness({ workbenchTables: false });
  try {
    assert.throws(() => getWorkbenchSnapshot(db, JOURNEY), WorkbenchTablesMissingError);
    assert.equal(safeWorkbenchSnapshot(db, JOURNEY), null, "the Home path degrades");
    assert.equal(safeWorkbenchSnapshot(null, JOURNEY), null, "no database is also None");
    assert.equal(safeWorkbenchSnapshot(db, null), null, "no journey is also None");
  } finally {
    db.close();
  }
});

test("readBuilderResumeState matches Python in all three precedence states", () => {
  assert.ok(oracle.resume.length >= 9);
  for (const entry of oracle.resume) {
    const seed = entry.seed as {
      adopt: boolean;
      cursor: Record<string, unknown> | null;
      workbench: { stories: number; crs: number; unassigned: number; active: boolean } | null;
      include_refinement: boolean;
    };
    const { db, deps } = harness();
    try {
      if (seed.adopt) setAdoptedMethod(db, JOURNEY, "ariad", () => NOW);
      if (seed.cursor !== null) setDeliveryCursor(db, cursorOptions(seed.cursor), deps);
      if (seed.workbench !== null) seedWorkbench(db, seed.workbench);
      const state = readBuilderResumeState(db, JOURNEY, {
        includeRefinement: seed.include_refinement,
      });
      assert.deepEqual(dumpState(state), entry.expected, entry.name);
    } finally {
      db.close();
    }
  }
});

test("the resume path raises on a pre-CV20.DS6 database where Home degrades", () => {
  // The asymmetry is Python's: `read_builder_resume_state` calls the Workbench
  // read with no guard. Reproduced rather than fixed, and recorded as debt.
  assert.equal(oracle.resume_missing_tables.expected_error, "OperationalError");
  const { db, deps } = harness({ workbenchTables: false });
  try {
    setAdoptedMethod(db, JOURNEY, "ariad", () => NOW);
    setDeliveryCursor(db, { journey: JOURNEY, method: "ariad", activeItem: "CV1" }, deps);
    assert.throws(() => readBuilderResumeState(db, JOURNEY), WorkbenchTablesMissingError);
    // And the escape hatch a file-first project takes.
    const excluded = readBuilderResumeState(db, JOURNEY, { includeRefinement: false });
    assert.deepEqual(dumpState(excluded), oracle.resume_missing_tables.excluded_ok);
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
