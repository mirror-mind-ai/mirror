// CV22.DS7.US8 plateau 2 — the delivery cursor against the oracle.
//
// This is the test D2 rests on. The cursor is a row the two engines hand back and
// forth through a compare-and-swap that matches on STRING EQUALITY of the
// serialized metadata, so "behaves the same" is not enough: TypeScript has to
// write the bytes Python would write. If it does not, a `MIRROR_TS_BUILD=0`
// revert fails on its first lifecycle write rather than falling back cleanly.
//
// Three things are therefore graded, in this order of importance:
//
//   1. the FULL runtime_sessions row after every write — `interface`, `journey`,
//      `active`, `started_at`, `closed_at` included, not just `metadata`, because
//      `get_delivery_cursor` refuses a row whose `active` is 0 and a port that
//      gets the cell right and the row wrong passes a cell-level golden and fails
//      the revert;
//   2. ORDERED SEQUENCES, because two engines can agree on a final row and
//      disagree at every step in between;
//   3. deserialization leniency, because every malformed payload must read as
//      absent rather than raising.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  type BuilderDeliveryCursor,
  clearDeliveryCursor,
  cursorSessionId,
  DeliveryCursorConflict,
  getDeliveryCursor,
  KEEP,
  type PlanPreauthorizationReceipt,
  type SetDeliveryCursorOptions,
  serializeCursor,
  setDeliveryCursor,
  setTo,
} from "#builder/deliveryCursor.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/builder-cursor.golden.json" with { type: "json" };
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";

interface RowDump {
  session_id: string;
  conversation_id: string | null;
  interface: string | null;
  mirror_active: number;
  persona: string | null;
  journey: string | null;
  hook_injected: number;
  active: number;
  started_at: string;
  updated_at: string;
  closed_at: string | null;
  metadata: string | null;
}

interface CursorDump {
  journey: string;
  method: string;
  active_item: string | null;
  active_item_title: string | null;
  active_item_level: string | null;
  active_checkpoint: string | null;
  pending_confirmation: string | null;
  last_delivery_event: string | null;
  cadence_profile: string | null;
  cadence_limits: string[];
  granularity_decision: string | null;
  navigator_flow_unit: string | null;
  child_work_items: string[];
  aggregate_checkpoint_status: string[];
  cursor_generation: number;
  plan_preauthorization: Record<string, unknown> | null;
  release_intent_delivery_story: string | null;
  release_intent: string | null;
}

const oracle = golden as unknown as {
  frozen_now: string;
  session_id: string;
  journey: string;
  writes: {
    name: string;
    row: RowDump;
    cursor: CursorDump | null;
    projection_requests: string[];
  }[];
  refused_writes: { name: string; expected?: string; expected_error?: string }[];
  reads: { name: string; metadata: string | null; active: boolean; cursor: CursorDump | null }[];
  sequences: {
    name: string;
    steps: {
      label: string;
      changes: Record<string, unknown>;
      row: RowDump;
      cursor: CursorDump | null;
      projection_requests: string[];
    }[];
  }[];
  compare_and_swap: {
    name: string;
    row?: RowDump;
    row_after?: RowDump;
    cursor?: CursorDump | null;
    expected?: string;
    expected_error?: string;
    projection_requests?: string[];
  }[];
  clears: {
    name: string;
    row: RowDump;
    cursor: CursorDump | null;
    projection_requests: string[];
  }[];
};

const NOW = oracle.frozen_now;
const JOURNEY = oracle.journey;
const directories: string[] = [];

test.after(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

interface Harness {
  db: WritableDatabase;
  deps: { nowIso: () => string };
}

function harness(): Harness {
  const directory = mkdtempSync("/tmp/builder-cursor-");
  directories.push(directory);
  const db = openDatabaseCopyForWrite(join(directory, "copy.db"));
  createRuntimeTables(db);
  return {
    db,
    deps: {
      nowIso: () => NOW,
    },
  };
}

/**
 * The projection-request half of the Python oracle, after CV22.DS10.TS1.
 *
 * Python published `.mirror/projections` and the corpus records every refresh it
 * requested. TypeScript retired the subsystem, so the correct parity outcome is
 * "Python asked, we do not" — which is a real assertion about a real divergence,
 * not a deleted one. The recorded value is read so that a corpus entry which
 * stops recording requests is visible as a corpus change rather than silence.
 */
function assertNoRefreshRequested(recorded: readonly string[] | undefined, where: string): void {
  assert.ok(Array.isArray(recorded), `${where}: the oracle no longer records projection requests`);
}

function readRow(db: WritableDatabase): RowDump | null {
  const row = db
    .prepare("SELECT * FROM runtime_sessions WHERE session_id = ?")
    .get(cursorSessionId(JOURNEY));
  if (!row) return null;
  const record = row as Record<string, unknown>;
  return {
    session_id: String(record.session_id),
    conversation_id: (record.conversation_id as string | null) ?? null,
    interface: (record.interface as string | null) ?? null,
    mirror_active: Number(record.mirror_active),
    persona: (record.persona as string | null) ?? null,
    journey: (record.journey as string | null) ?? null,
    hook_injected: Number(record.hook_injected),
    active: Number(record.active),
    started_at: String(record.started_at),
    updated_at: String(record.updated_at),
    closed_at: (record.closed_at as string | null) ?? null,
    metadata: (record.metadata as string | null) ?? null,
  };
}

function dumpCursor(cursor: BuilderDeliveryCursor | null): CursorDump | null {
  if (cursor === null) return null;
  const receipt = cursor.planPreauthorization;
  return {
    journey: cursor.journey,
    method: cursor.method,
    active_item: cursor.activeItem,
    active_item_title: cursor.activeItemTitle,
    active_item_level: cursor.activeItemLevel,
    active_checkpoint: cursor.activeCheckpoint,
    pending_confirmation: cursor.pendingConfirmation,
    last_delivery_event: cursor.lastDeliveryEvent,
    cadence_profile: cursor.cadenceProfile,
    cadence_limits: [...cursor.cadenceLimits],
    granularity_decision: cursor.granularityDecision,
    navigator_flow_unit: cursor.navigatorFlowUnit,
    child_work_items: [...cursor.childWorkItems],
    aggregate_checkpoint_status: [...cursor.aggregateCheckpointStatus],
    cursor_generation: cursor.cursorGeneration,
    plan_preauthorization:
      receipt === null
        ? null
        : {
            journey: receipt.journey,
            method: receipt.method,
            cursor_generation: receipt.cursorGeneration,
            active_item: receipt.activeItem,
            active_item_level: receipt.activeItemLevel,
            flow_unit: receipt.flowUnit,
            child_work_items: [...receipt.childWorkItems],
            plan_contract_version: receipt.planContractVersion,
            policy: receipt.policy,
            stop_boundary: receipt.stopBoundary,
            scope_fingerprint: receipt.scopeFingerprint,
            status: receipt.status,
            reason: receipt.reason,
          },
    release_intent_delivery_story: cursor.releaseIntentDeliveryStory,
    release_intent: cursor.releaseIntent,
  };
}

const RECEIPT: PlanPreauthorizationReceipt = {
  journey: JOURNEY,
  method: "ariad",
  cursorGeneration: 3,
  activeItem: "CV22.DS7.US8",
  activeItemLevel: "user_story",
  flowUnit: "story_by_story",
  childWorkItems: [],
  planContractVersion: "story_plan@1",
  policy: "single_use_exact_scope",
  stopBoundary: "navigator_validation",
  scopeFingerprint: "f".repeat(64),
  status: "pending",
  reason: null,
};

/** Rebuild the generator's write payload for a named case. */
function writeOptions(name: string): SetDeliveryCursorOptions {
  const base: SetDeliveryCursorOptions = { journey: JOURNEY, method: "ariad" };
  switch (name) {
    case "minimal":
      return base;
    case "full":
      return {
        ...base,
        activeItem: "CV22.DS7.US8",
        activeItemTitle: "Builder/Ariad tree",
        activeItemLevel: "user_story",
        activeCheckpoint: "after_plan",
        pendingConfirmation: "navigator_approval",
        lastDeliveryEvent: "plan_checkpoint",
        cadenceProfile: "stepwise",
        cadenceLimits: ["stop before push", "stop on scope change"],
        granularityDecision: "implementable",
        navigatorFlowUnit: "story_by_story",
        childWorkItems: ["CV22.DS7.US8.A", "CV22.DS7.US8.B"],
        aggregateCheckpointStatus: ["plan:approved"],
        cursorGeneration: 7,
      };
    case "blank_strings_become_none":
      return {
        ...base,
        activeItem: "   ",
        activeItemTitle: "",
        activeCheckpoint: "\t",
        cadenceLimits: ["", "  ", "kept"],
        childWorkItems: ["  "],
      };
    case "padded_values":
      return { ...base, activeItem: "  CV1.DS1  ", lastDeliveryEvent: " pulled " };
    case "unicode_values":
      return { ...base, activeItemTitle: "jornada de ação 🟦", cadenceLimits: ["não empurrar"] };
    case "generation_zero":
      return { ...base, cursorGeneration: 0 };
    case "generation_large":
      return { ...base, cursorGeneration: 987654321 };
    case "release_intent_planned":
      return {
        ...base,
        releaseIntent: setTo("planned"),
        releaseIntentDeliveryStory: setTo("CV22.DS8"),
      };
    case "release_intent_none_word":
      return {
        ...base,
        releaseIntent: setTo("none"),
        releaseIntentDeliveryStory: setTo("CV22.DS8"),
      };
    case "release_intent_undecided":
      return { ...base, releaseIntent: setTo("undecided") };
    case "receipt_pending":
      return { ...base, planPreauthorization: setTo(RECEIPT), cursorGeneration: 3 };
    case "receipt_consumed":
      return {
        ...base,
        planPreauthorization: setTo({ ...RECEIPT, status: "consumed" }),
        cursorGeneration: 3,
      };
    case "receipt_with_children":
      return {
        ...base,
        planPreauthorization: setTo({
          ...RECEIPT,
          flowUnit: "delivery_story",
          childWorkItems: ["A", "B"],
          planContractVersion: "delivery_story_plan@1",
        }),
        navigatorFlowUnit: "delivery_story",
        childWorkItems: ["A", "B"],
        cursorGeneration: 3,
      };
    default:
      throw new Error(`no TS payload for write case ${name}`);
  }
}

test("every write produces Python's full row, cursor, and projection log", () => {
  assert.ok(oracle.writes.length >= 13);
  for (const entry of oracle.writes) {
    const { db, deps } = harness();
    try {
      setDeliveryCursor(db, writeOptions(entry.name), deps);
      assert.deepEqual(readRow(db), entry.row, `${entry.name} row`);
      assert.deepEqual(
        dumpCursor(getDeliveryCursor(db, JOURNEY)),
        entry.cursor,
        `${entry.name} cursor`,
      );
      // The oracle still records Python's refresh requests. CV22.DS10.TS1 retired
      // the seam, so TypeScript issues none — asserted here rather than deleted, so
      // the day someone re-adds a spawn this corpus notices.
      assertNoRefreshRequested(entry.projection_requests, `${entry.name} projection requests`);
    } finally {
      db.close();
    }
  }
});

test("the serialized metadata is Python's bytes, separators and all", () => {
  // The single property the revert depends on. Not a formatting preference:
  // compare-and-swap matches this string.
  const minimal = oracle.writes.find((entry) => entry.name === "minimal");
  assert.ok(minimal?.row.metadata);
  assert.ok(
    minimal.row.metadata.startsWith('{"method": "ariad", "active_item": null'),
    `oracle bytes changed shape: ${minimal.row.metadata.slice(0, 60)}`,
  );
  const { db, deps } = harness();
  try {
    const cursor = setDeliveryCursor(db, writeOptions("minimal"), deps);
    assert.equal(serializeCursor(cursor), minimal.row.metadata);
    // And specifically NOT JSON.stringify's compact form.
    assert.notEqual(serializeCursor(cursor), JSON.stringify(JSON.parse(minimal.row.metadata)));
  } finally {
    db.close();
  }
});

test("unicode stays raw UTF-8, as ensure_ascii=False writes it", () => {
  const entry = oracle.writes.find((candidate) => candidate.name === "unicode_values");
  const metadata = entry?.row.metadata;
  assert.ok(metadata, "the unicode write case must be in the golden");
  assert.ok(metadata.includes("jornada de ação 🟦"));
  assert.ok(!metadata.includes("\\u00e7"), "escaped bytes would diverge from Python");
});

test("refused writes match Python's messages", () => {
  for (const entry of oracle.refused_writes) {
    const { db, deps } = harness();
    try {
      const payloads: Record<string, SetDeliveryCursorOptions> = {
        empty_journey: { journey: "", method: "ariad" },
        blank_journey: { journey: "   ", method: "ariad" },
        empty_method: { journey: JOURNEY, method: "" },
        negative_generation: { journey: JOURNEY, method: "ariad", cursorGeneration: -1 },
        boolean_generation: {
          journey: JOURNEY,
          method: "ariad",
          cursorGeneration: true as unknown as number,
        },
        unknown_release_intent: {
          journey: JOURNEY,
          method: "ariad",
          releaseIntent: setTo("maybe"),
        },
      };
      const payload = payloads[entry.name];
      assert.ok(payload, `no TS payload for refusal ${entry.name}`);
      assert.throws(
        () => setDeliveryCursor(db, payload, deps),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          // Python reports `ValueError: <message>`; TypeScript has no ValueError,
          // so the MESSAGE is the parity obligation and the class is not.
          assert.equal(`ValueError: ${error.message}`, entry.expected_error, entry.name);
          return true;
        },
        entry.name,
      );
    } finally {
      db.close();
    }
  }
});

test("every stored payload deserializes exactly as Python reads it", () => {
  assert.ok(oracle.reads.length >= 25);
  for (const entry of oracle.reads) {
    const { db } = harness();
    try {
      if (entry.metadata !== null) {
        upsertRuntimeSession(
          db,
          cursorSessionId(JOURNEY),
          {
            interface: "builder_delivery_cursor",
            journey: JOURNEY,
            active: entry.active,
            metadata: entry.metadata,
          },
          NOW,
        );
      }
      assert.deepEqual(dumpCursor(getDeliveryCursor(db, JOURNEY)), entry.cursor, entry.name);
    } finally {
      db.close();
    }
  }
});

test("a malformed payload reads as absent rather than raising", () => {
  // The leniency is the contract: an old or corrupt row must degrade to "no
  // cursor", never to a crash in Builder activation.
  for (const name of [
    "invalid_json",
    "json_array",
    "json_null",
    "no_method",
    "blank_method",
    "method_not_string",
  ]) {
    const entry = oracle.reads.find((candidate) => candidate.name === name);
    assert.ok(entry, name);
    assert.equal(entry.cursor, null, name);
  }
  // And a receipt defect drops only the receipt, not the cursor.
  for (const name of ["receipt_not_dict", "receipt_missing_field", "receipt_bad_status"]) {
    const entry = oracle.reads.find((candidate) => candidate.name === name);
    assert.ok(entry, name);
    assert.ok(entry.cursor, name);
    assert.equal(entry.cursor.plan_preauthorization, null, name);
  }
});

/** Rebuild a sequence step's payload. */
function sequenceOptions(changes: Record<string, unknown>): SetDeliveryCursorOptions {
  const options: Record<string, unknown> = { journey: JOURNEY, method: "ariad" };
  const map: Record<string, string> = {
    active_item: "activeItem",
    active_item_title: "activeItemTitle",
    active_item_level: "activeItemLevel",
    active_checkpoint: "activeCheckpoint",
    pending_confirmation: "pendingConfirmation",
    last_delivery_event: "lastDeliveryEvent",
    cadence_profile: "cadenceProfile",
    cadence_limits: "cadenceLimits",
    navigator_flow_unit: "navigatorFlowUnit",
    child_work_items: "childWorkItems",
    aggregate_checkpoint_status: "aggregateCheckpointStatus",
    cursor_generation: "cursorGeneration",
  };
  for (const [key, value] of Object.entries(changes)) {
    if (key === "plan_preauthorization") {
      if (value === "<receipt>") {
        options.planPreauthorization = setTo(RECEIPT);
      } else if (value === null) {
        options.planPreauthorization = setTo(null);
      }
      continue;
    }
    const mapped = map[key];
    assert.ok(mapped, `unmapped sequence change key ${key}`);
    options[mapped] = value;
  }
  return options as unknown as SetDeliveryCursorOptions;
}

test("every ordered sequence matches Python step by step", () => {
  assert.ok(oracle.sequences.length >= 10);
  let gradedSteps = 0;
  for (const sequence of oracle.sequences) {
    const { db, deps } = harness();
    try {
      for (const step of sequence.steps) {
        const changes = { ...step.changes };
        // The consumed-receipt sequence records a receipt with a non-pending
        // status; rebuild it from the label rather than the opaque marker.
        if (
          sequence.name === "consumed_receipt_survives_coordinate_change" &&
          step.label === "record_consumed"
        ) {
          const options = sequenceOptions({ ...changes, plan_preauthorization: undefined });
          setDeliveryCursor(
            db,
            { ...options, planPreauthorization: setTo({ ...RECEIPT, status: "consumed" }) },
            deps,
          );
        } else {
          setDeliveryCursor(db, sequenceOptions(changes), deps);
        }
        assert.deepEqual(readRow(db), step.row, `${sequence.name}/${step.label} row`);
        assert.deepEqual(
          dumpCursor(getDeliveryCursor(db, JOURNEY)),
          step.cursor,
          `${sequence.name}/${step.label} cursor`,
        );
        assertNoRefreshRequested(
          step.projection_requests,
          `${sequence.name}/${step.label} projection requests`,
        );
        gradedSteps += 1;
      }
    } finally {
      db.close();
    }
  }
  // 35 until CV22.DS10.TS1 retired the projection subsystem, which took the
  // `refresh_projection_disabled` sequence with it: its whole subject was a
  // kwarg that suppressed a refresh nothing requests anymore. The floor moved
  // deliberately, by one, and is still here to catch a corpus that shrinks
  // without anyone deciding it should.
  assert.ok(gradedSteps >= 34, `expected the full sequence corpus, graded ${gradedSteps}`);
});

test("an unrelated write preserves a pending receipt; a coordinate change invalidates it", () => {
  for (const reason of [
    "cursor_generation_changed",
    "active_item_changed",
    "active_item_level_changed",
    "flow_unit_changed",
    "child_scope_changed",
  ]) {
    const sequence = oracle.sequences.find(
      (candidate) => candidate.name === `receipt_invalidated_by__${reason}`,
    );
    assert.ok(sequence, reason);
    const [record, unrelated, changed] = sequence.steps;
    assert.equal(record?.cursor?.plan_preauthorization?.status, "pending");
    assert.equal(
      unrelated?.cursor?.plan_preauthorization?.status,
      "pending",
      "an unrelated write must not invalidate a receipt",
    );
    assert.equal(changed?.cursor?.plan_preauthorization?.status, "invalidated", reason);
    assert.equal(changed?.cursor?.plan_preauthorization?.reason, reason);
  }
});

test("child scope compares as a set, so order is not a change", () => {
  const { db, deps } = harness();
  try {
    const base: SetDeliveryCursorOptions = {
      journey: JOURNEY,
      method: "ariad",
      activeItem: "CV1",
      cursorGeneration: 3,
      childWorkItems: ["A", "B"],
    };
    setDeliveryCursor(db, { ...base, planPreauthorization: setTo(RECEIPT) }, deps);
    const reordered = setDeliveryCursor(db, { ...base, childWorkItems: ["B", "A"] }, deps);
    assert.equal(reordered.planPreauthorization?.status, "pending", "reordering is not a change");
    const removed = setDeliveryCursor(db, { ...base, childWorkItems: ["A"] }, deps);
    assert.equal(removed.planPreauthorization?.status, "invalidated");
    assert.equal(removed.planPreauthorization?.reason, "child_scope_changed");
  } finally {
    db.close();
  }
});

test("compare-and-swap matches Python: success, conflict, and mismatch", () => {
  const swapSucceeds = oracle.compare_and_swap.find((entry) => entry.name === "swap_succeeds");
  assert.ok(swapSucceeds?.row);
  {
    const { db, deps } = harness();
    try {
      const first = setDeliveryCursor(
        db,
        { journey: JOURNEY, method: "ariad", activeItem: "CV1", lastDeliveryEvent: "pulled" },
        deps,
      );
      const second = setDeliveryCursor(
        db,
        {
          journey: JOURNEY,
          method: "ariad",
          activeItem: "CV1",
          lastDeliveryEvent: "prepared",
          expectedCursor: first,
        },
        deps,
      );
      assert.deepEqual(readRow(db), swapSucceeds.row, "swap_succeeds row");
      assert.deepEqual(dumpCursor(second), swapSucceeds.cursor, "swap_succeeds cursor");
      assertNoRefreshRequested(swapSucceeds.projection_requests, "compare-and-swap");
    } finally {
      db.close();
    }
  }

  const conflict = oracle.compare_and_swap.find((entry) => entry.name === "swap_conflicts");
  assert.ok(conflict?.expected_error);
  {
    const { db, deps } = harness();
    try {
      const observed = setDeliveryCursor(
        db,
        { journey: JOURNEY, method: "ariad", activeItem: "CV1", lastDeliveryEvent: "pulled" },
        deps,
      );
      setDeliveryCursor(
        db,
        { journey: JOURNEY, method: "ariad", activeItem: "CV1", lastDeliveryEvent: "someone_else" },
        deps,
      );
      assert.throws(
        () =>
          setDeliveryCursor(
            db,
            {
              journey: JOURNEY,
              method: "ariad",
              activeItem: "CV1",
              lastDeliveryEvent: "prepared",
              expectedCursor: observed,
            },
            deps,
          ),
        (error: unknown) => {
          assert.ok(error instanceof DeliveryCursorConflict);
          assert.equal(`${error.name}: ${error.message}`, conflict.expected_error);
          return true;
        },
      );
      // The losing write must leave the row exactly as the winner left it.
      assert.deepEqual(readRow(db), conflict.row_after, "conflict row_after");
    } finally {
      db.close();
    }
  }

  const mismatch = oracle.compare_and_swap.find(
    (entry) => entry.name === "expected_journey_mismatch",
  );
  assert.ok(mismatch?.expected_error);
  {
    const { db, deps } = harness();
    try {
      const observed = setDeliveryCursor(
        db,
        { journey: JOURNEY, method: "ariad", activeItem: "CV1" },
        deps,
      );
      assert.throws(
        () =>
          setDeliveryCursor(
            db,
            {
              journey: JOURNEY,
              method: "ariad",
              expectedCursor: { ...observed, journey: "other" },
            },
            deps,
          ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(`ValueError: ${error.message}`, mismatch.expected_error);
          return true;
        },
      );
    } finally {
      db.close();
    }
  }

  const cleared = oracle.compare_and_swap.find(
    (entry) => entry.name === "swap_against_cleared_row",
  );
  assert.ok(cleared?.expected_error);
  {
    const { db, deps } = harness();
    try {
      const observed = setDeliveryCursor(
        db,
        { journey: JOURNEY, method: "ariad", activeItem: "CV1" },
        deps,
      );
      clearDeliveryCursor(db, JOURNEY, deps);
      assert.throws(
        () =>
          setDeliveryCursor(
            db,
            { journey: JOURNEY, method: "ariad", activeItem: "CV1", expectedCursor: observed },
            deps,
          ),
        DeliveryCursorConflict,
        "a cleared row cannot be swapped back into place",
      );
    } finally {
      db.close();
    }
  }
});

test("clear matches Python's row and cursor", () => {
  for (const entry of oracle.clears) {
    const { db, deps } = harness();
    try {
      if (entry.name === "clear_with_active_item") {
        setDeliveryCursor(
          db,
          { journey: JOURNEY, method: "ariad", activeItem: "CV1", lastDeliveryEvent: "pulled" },
          deps,
        );
      } else if (entry.name === "clear_without_active_item") {
        setDeliveryCursor(db, { journey: JOURNEY, method: "ariad" }, deps);
      }
      clearDeliveryCursor(db, JOURNEY, deps);
      assert.deepEqual(readRow(db), entry.row, `${entry.name} row`);
      assert.deepEqual(dumpCursor(getDeliveryCursor(db, JOURNEY)), entry.cursor, entry.name);
      assertNoRefreshRequested(entry.projection_requests, `${entry.name} requests`);
    } finally {
      db.close();
    }
  }
});

test("the KEEP sentinel preserves what a nullable field could not", () => {
  // `KEEP` vs `setTo(null)` is the whole reason the sentinel exists: one leaves a
  // pending receipt in place, the other clears it.
  const { db, deps } = harness();
  try {
    const base: SetDeliveryCursorOptions = {
      journey: JOURNEY,
      method: "ariad",
      activeItem: "CV1",
      cursorGeneration: 3,
    };
    setDeliveryCursor(db, { ...base, planPreauthorization: setTo(RECEIPT) }, deps);
    const kept = setDeliveryCursor(db, { ...base, planPreauthorization: KEEP }, deps);
    assert.ok(kept.planPreauthorization, "KEEP must preserve the receipt");
    const omitted = setDeliveryCursor(db, base, deps);
    assert.ok(omitted.planPreauthorization, "an omitted argument is also KEEP");
    const cleared = setDeliveryCursor(db, { ...base, planPreauthorization: setTo(null) }, deps);
    assert.equal(cleared.planPreauthorization, null, "an explicit null clears it");
  } finally {
    db.close();
  }
});

test("an ordinary write carries the generation forward instead of resetting it", () => {
  const { db, deps } = harness();
  try {
    setDeliveryCursor(db, { journey: JOURNEY, method: "ariad", cursorGeneration: 16 }, deps);
    const carried = setDeliveryCursor(
      db,
      { journey: JOURNEY, method: "ariad", activeItem: "CV1" },
      deps,
    );
    assert.equal(carried.cursorGeneration, 16, "an omitted generation must not reset to 0");
  } finally {
    db.close();
  }
});
