// CV22.DS7.US8 plateau 1 — the three activation surfaces against the oracle.
//
// `■ BUILDER RESUME`, `■ BUILDER HOME`, and `■ BUILDER ORIENTATION` are what a
// Navigator actually sees when Builder Mode activates, and they are almost
// entirely conditionals. The golden crosses seven refinement states against four
// candidate reports for the two orientation surfaces, and walks seventeen resume
// states, because the defect class here is a collapsed branch rather than a wrong
// string.

import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { availableRefinementMoves, renderBuilderOrientationSurface } from "#builder/homeSurface.ts";
import type { PullCandidatesReport, RoadmapSnapshotReport } from "#builder/pullCandidates.ts";
import {
  findCanonicalRefinementIndex,
  inspectRefinementField,
  type RefinementFieldSnapshot,
} from "#builder/refinementField.ts";
import {
  ACTIVE_ITEM_ACTIONS,
  type BuilderResumeState,
  NO_ACTIVE_ITEM_ACTIONS,
  PENDING_CONFIRMATION_ACTIONS,
  type ResumeCursorView,
  renderBuilderResumeSurface,
  selectAllowedNextActions,
} from "#builder/resumeSurface.ts";
import {
  type AuthoredPackage,
  cvCodeOf,
  type RoadmapScope,
  type ScopedPullCandidates,
  scopePullCandidates,
} from "#builder/roadmapScope.ts";
import golden from "#goldens/builder-orientation.golden.json" with { type: "json" };

const FIXTURES = join(fileURLToPath(new URL("../fixtures/builder-refinement/", import.meta.url)));

interface SnapshotDump {
  active_refinement_story: string | null;
  active_change_request: string | null;
  storage_state: string;
  next_move: string;
  canonical_index: string | null;
}

const oracle = golden as unknown as {
  action_tuples: Record<string, string[]>;
  roadmap_snapshot: RoadmapSnapshotReport;
  candidate_reports: Record<string, PullCandidatesReport>;
  resume: {
    name: string;
    state: Record<string, unknown>;
    roadmap_position: AuthoredPackage | null;
    canonical_refinement_index: string | null;
    expected: string;
  }[];
  orientation: { name: string; refinement: SnapshotDump; candidates: string; expected: string }[];
  refinement_field: {
    name: string;
    project: string;
    canonical_index: string | null;
    expected: SnapshotDump;
  }[];
};

function toRefinement(dump: SnapshotDump): RefinementFieldSnapshot {
  return {
    activeRefinementStory: dump.active_refinement_story,
    activeChangeRequest: dump.active_change_request,
    storageState: dump.storage_state,
    nextMove: dump.next_move,
    canonicalIndex: dump.canonical_index,
  };
}

function fromRefinement(snapshot: RefinementFieldSnapshot): SnapshotDump {
  return {
    active_refinement_story: snapshot.activeRefinementStory,
    active_change_request: snapshot.activeChangeRequest,
    storage_state: snapshot.storageState,
    next_move: snapshot.nextMove,
    canonical_index: snapshot.canonicalIndex,
  };
}

interface CursorDump {
  active_item: string | null;
  active_checkpoint: string | null;
  pending_confirmation: string | null;
  last_delivery_event: string | null;
  release_intent: string | null;
  release_intent_delivery_story: string | null;
}

function toResumeState(dump: Record<string, unknown>): BuilderResumeState {
  const cursorDump = dump.cursor as CursorDump | null;
  const cursor: ResumeCursorView | null =
    cursorDump === null
      ? null
      : {
          activeItem: cursorDump.active_item,
          activeCheckpoint: cursorDump.active_checkpoint,
          pendingConfirmation: cursorDump.pending_confirmation,
          lastDeliveryEvent: cursorDump.last_delivery_event,
          releaseIntent: cursorDump.release_intent,
          releaseIntentDeliveryStory: cursorDump.release_intent_delivery_story,
        };
  return {
    journey: dump.journey as string,
    adoptedMethod: dump.adopted_method as string | null,
    cursor,
    resumable: dump.resumable as boolean,
    reason: dump.reason as string | null,
    allowedNextActions: dump.allowed_next_actions as string[],
  };
}

test("the allowed-next-action tuples match Python", () => {
  assert.deepEqual([...NO_ACTIVE_ITEM_ACTIONS], oracle.action_tuples.no_active_item);
  assert.deepEqual([...ACTIVE_ITEM_ACTIONS], oracle.action_tuples.active_item);
  assert.deepEqual([...PENDING_CONFIRMATION_ACTIONS], oracle.action_tuples.pending_confirmation);
});

test("selectAllowedNextActions ranks pending confirmation over an active item", () => {
  const base: ResumeCursorView = {
    activeItem: null,
    activeCheckpoint: null,
    pendingConfirmation: null,
    lastDeliveryEvent: null,
    releaseIntent: null,
    releaseIntentDeliveryStory: null,
  };
  assert.deepEqual([...selectAllowedNextActions(base)], [...NO_ACTIVE_ITEM_ACTIONS]);
  assert.deepEqual(
    [...selectAllowedNextActions({ ...base, activeItem: "CV22.DS7.US8" })],
    [...ACTIVE_ITEM_ACTIONS],
  );
  assert.deepEqual(
    [
      ...selectAllowedNextActions({
        ...base,
        activeItem: "CV22.DS7.US8",
        pendingConfirmation: "navigator_approval",
      }),
    ],
    [...PENDING_CONFIRMATION_ACTIONS],
    "a pending confirmation outranks an active item",
  );
});

/**
 * The scope a recorded resume row implies (CR002).
 *
 * The oracle recorded a cursor and, separately, the first roadmap file whose
 * status read "Active". The renderer now takes the scope the CURSOR implies:
 * no active item is unscoped whatever the oracle scanned; an active item with a
 * recorded package has that package as its CV's (every such row records CV22 for
 * a CV22 item, asserted); an active item with nothing recorded has nothing
 * authored. The golden's `expected` was edited by the same rule — see
 * `ts/test/goldens/README.md`.
 */
function scopeForRecordedRow(row: (typeof oracle.resume)[number]): RoadmapScope {
  const cursor = row.state.cursor as CursorDump | null;
  if (cursor === null) return { kind: "unscoped", reason: "no_cursor" };
  const activeItem = cursor.active_item;
  if (!activeItem) return { kind: "unscoped", reason: "no_active_item" };
  const cvCode = cvCodeOf(activeItem);
  const recorded = row.roadmap_position;
  if (recorded === null) {
    return { kind: "active_item", activeItem, cvCode, position: { kind: "no_package" } };
  }
  assert.equal(recorded.code, cvCode, `${row.name}: a recorded package stands in only for its CV`);
  return {
    kind: "active_item",
    activeItem,
    cvCode,
    position: { kind: "cv_package", package: recorded },
  };
}

test("BUILDER RESUME renders every recorded state, with the position its cursor implies", () => {
  // 17 before CV22.DS10.TS4; the four Workbench-populated states collapsed
  // into one "no canonical index" state.
  assert.ok(oracle.resume.length >= 14);
  for (const row of oracle.resume) {
    const actual = renderBuilderResumeSurface(toResumeState(row.state), {
      scope: scopeForRecordedRow(row),
      canonicalRefinementIndex: row.canonical_refinement_index,
    });
    assert.equal(actual, row.expected, row.name);
  }
});

test("the CR002 symptom row no longer names a scanned package", () => {
  // The oracle's `cursor_sync_required` row recorded CV22 as the position of a
  // journey with no cursor at all — the shape that told a CV20 journey it was
  // at CV9.DS7. Without a cursor there is no position to state.
  const row = oracle.resume.find((r) => r.name === "cursor_sync_required");
  assert.ok(row?.roadmap_position, "the oracle recorded a scanned package here");
  assert.ok(row.expected.includes("no item pulled yet"));
  assert.ok(!row.expected.includes("cv22-typescript-core-port"));
});

test("release intent needs both fields, so a half-set cursor shows neither", () => {
  const both = oracle.resume.find((row) => row.name === "release_intent_both");
  const onlyIntent = oracle.resume.find((row) => row.name === "release_intent_only_intent");
  const onlyStory = oracle.resume.find((row) => row.name === "release_intent_only_story");
  assert.ok(both && onlyIntent && onlyStory);
  assert.ok(both.expected.includes("release intent"));
  assert.ok(
    !onlyIntent.expected.includes("release intent"),
    "an intent with no Delivery Story must not render the block",
  );
  assert.ok(!onlyStory.expected.includes("release intent"));
});

test("without a canonical index the resume field names the file to create", () => {
  // Replaces a test that pinned `_last_refinement_event` returning "none" while
  // the snapshot carried an event -- a divergence trap that existed only because
  // the field read Workbench rows. There is nothing to read now, so the state is
  // singular and the assertion is about what the Navigator is told to do next.
  const row = oracle.resume.find((r) => r.name === "no_canonical_index");
  assert.ok(row);
  assert.ok(row.expected.includes("authority: project files (not started)"));
  assert.ok(row.expected.includes("create: docs/project/refinement/index.md"));
  assert.ok(!row.expected.includes("last refinement event"));
});

/**
 * `build load` renders this surface only for a cursor with no active item, so
 * every recorded state renders unscoped. The recorded reports still carry
 * Python's project-wide `recommended`, which the scoped view ignores.
 */
const NO_ACTIVE_ITEM: RoadmapScope = { kind: "unscoped", reason: "no_active_item" };

test("BUILDER ORIENTATION renders across refinement x candidate states, unscoped", () => {
  // 28 before CV22.DS10.TS4: the refinement matrix went from seven states to
  // three, since four of them described Workbench rows no read can produce;
  // CV22.DS10.TS5 (D-024) removed the seeded state, leaving two.
  assert.ok(oracle.orientation.length >= 8);
  for (const row of oracle.orientation) {
    const report = oracle.candidate_reports[row.candidates];
    assert.ok(report, `unknown candidate report ${row.candidates}`);
    const actual = renderBuilderOrientationSurface({
      roadmap: oracle.roadmap_snapshot,
      view: scopePullCandidates(report, NO_ACTIVE_ITEM),
      refinement: toRefinement(row.refinement),
    });
    assert.equal(actual, row.expected, row.name);
  }
});

test("an unscoped orientation recommends nothing, even where Python recommended", () => {
  const row = oracle.orientation.find((r) => r.candidates === "recommended");
  assert.ok(row);
  assert.ok(!row.expected.includes("\u25b8"), "no candidate is marked recommended");
  assert.ok(row.expected.includes("no item pulled yet"));
  assert.ok(row.expected.includes("project-wide candidates"));
  assert.ok(row.expected.includes("pull explicitly: mirror build pull-item --journey"));
});

/** A scoped or unscoped view with no candidates, for the moves below. */
function viewWith(recommended: ScopedPullCandidates["recommended"]): ScopedPullCandidates {
  return {
    journey: "demo",
    method: "ariad",
    scope:
      recommended === null
        ? NO_ACTIVE_ITEM
        : {
            kind: "active_item",
            activeItem: "CV1.DS1.US1",
            cvCode: "CV1",
            position: { kind: "no_package" },
          },
    shown: recommended === null ? [] : [recommended],
    outsideCount: 0,
    recommended,
  };
}

const PULL_EXPLICITLY_DEMO =
  'pull explicitly: mirror build pull-item --journey demo --method ariad --item-code <code> --item-title "<title>" --item-level <level> --why-now "<why now>"';

test("the first move pulls the scoped recommendation, or is the literal command", () => {
  const refinement = toRefinement({
    active_refinement_story: null,
    active_change_request: null,
    storage_state: "project files",
    next_move: "inspect canonical Refinement index",
    canonical_index: "docs/project/refinement/index.md",
  });
  const candidate = {
    code: "CV1.DS2",
    title: "Next",
    level: "delivery_story",
    status: "\ud83d\udfe1 Planned",
    path: "docs/project/roadmap/cv1/cv1-ds2/index.md",
  };
  assert.equal(availableRefinementMoves(refinement, viewWith(candidate))[0], "pull CV1.DS2");
  assert.equal(availableRefinementMoves(refinement, viewWith(null))[0], PULL_EXPLICITLY_DEMO);
});

test("a canonical index returns early, so no create move is offered", () => {
  const canonical = toRefinement({
    active_refinement_story: null,
    active_change_request: null,
    storage_state: "project files",
    next_move: "inspect canonical Refinement index",
    canonical_index: "docs/project/refinement/index.md",
  });
  const moves = availableRefinementMoves(canonical, viewWith(null));
  assert.deepEqual(moves, [
    PULL_EXPLICITLY_DEMO,
    "inspect roadmap",
    "inspect canonical Refinement index",
  ]);
  assert.ok(!moves.some((move) => move.startsWith("create ")));
});

test("without a canonical index the last move is always to create it", () => {
  // CV22.DS10.TS4 collapsed the three storage branches with the Workbench that
  // produced them; CV22.DS10.TS5 (D-024) removed the seed count that could add
  // a review move. One shape is left.
  const moves = availableRefinementMoves(
    toRefinement({
      active_refinement_story: null,
      active_change_request: null,
      storage_state: "project files (not started)",
      next_move: "create docs/project/refinement/index.md",
      canonical_index: null,
    }),
    viewWith(null),
  );
  assert.deepEqual(moves, [
    PULL_EXPLICITLY_DEMO,
    "inspect roadmap",
    "create docs/project/refinement/index.md",
  ]);
});

test("the filesystem half of inspectRefinementField matches Python", () => {
  for (const row of oracle.refinement_field) {
    const path = row.project === "missing_entirely" ? null : join(FIXTURES, row.project);
    assert.equal(findCanonicalRefinementIndex(path), row.canonical_index, row.name);
    assert.deepEqual(fromRefinement(inspectRefinementField(path)), row.expected, row.name);
  }
});

test("the canonical index must be a file, not a directory", () => {
  // Python uses `is_file()`. A directory at that path is not an index, and a port
  // using `exists()` would wrongly report the file-first authority.
  const row = oracle.refinement_field.find((r) => r.project === "index_is_a_directory");
  assert.ok(row);
  assert.equal(row.canonical_index, null);
  assert.equal(findCanonicalRefinementIndex(join(FIXTURES, "index_is_a_directory")), null);
});

test("a CV20.DS6 seed plan in the project changes nothing any more (D-024)", () => {
  // The seed-CR scan read a hard-coded path into Mirror Mind's own roadmap
  // inside whatever project a journey named. With it removed, a project that
  // carries that plan is indistinguishable from one that does not.
  const bare = fromRefinement(inspectRefinementField(join(FIXTURES, "bare")));
  for (const project of ["seeded", "unseeded"]) {
    assert.deepEqual(
      fromRefinement(inspectRefinementField(join(FIXTURES, project))),
      bare,
      project,
    );
  }
});
