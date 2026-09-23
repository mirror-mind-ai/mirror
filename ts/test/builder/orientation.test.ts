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

import {
  availableRefinementMoves,
  renderBuilderHomeSurface,
  renderBuilderOrientationSurface,
} from "#builder/homeSurface.ts";
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
import type { RoadmapPosition } from "#builder/roadmapPosition.ts";
import golden from "#goldens/builder-orientation.golden.json" with { type: "json" };

const FIXTURES = join(fileURLToPath(new URL("../fixtures/builder-refinement/", import.meta.url)));

interface SnapshotDump {
  active_refinement_story: string | null;
  active_change_request: string | null;
  storage_state: string;
  seed_change_requests: number;
  seed_change_request_source: string | null;
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
    roadmap_position: RoadmapPosition | null;
    canonical_refinement_index: string | null;
    expected: string;
  }[];
  home: {
    name: string;
    refinement: SnapshotDump;
    candidates: string;
    journey: string;
    method: string;
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
    seedChangeRequests: dump.seed_change_requests,
    seedChangeRequestSource: dump.seed_change_request_source,
    nextMove: dump.next_move,
    canonicalIndex: dump.canonical_index,
  };
}

function fromRefinement(snapshot: RefinementFieldSnapshot): SnapshotDump {
  return {
    active_refinement_story: snapshot.activeRefinementStory,
    active_change_request: snapshot.activeChangeRequest,
    storage_state: snapshot.storageState,
    seed_change_requests: snapshot.seedChangeRequests,
    seed_change_request_source: snapshot.seedChangeRequestSource,
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

test("BUILDER RESUME renders byte-identically to Python across every state", () => {
  // 17 before CV22.DS10.TS4; the four Workbench-populated states collapsed
  // into one "no canonical index" state.
  assert.ok(oracle.resume.length >= 14);
  for (const row of oracle.resume) {
    const actual = renderBuilderResumeSurface(toResumeState(row.state), {
      roadmapPosition: row.roadmap_position,
      canonicalRefinementIndex: row.canonical_refinement_index,
    });
    assert.equal(actual, row.expected, row.name);
  }
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

test("BUILDER HOME renders byte-identically across refinement x candidate states", () => {
  // 29 before CV22.DS10.TS4: the refinement matrix went from seven states to
  // three, since four of them described Workbench rows no read can produce.
  assert.ok(oracle.home.length >= 13);
  for (const row of oracle.home) {
    const report = oracle.candidate_reports[row.candidates];
    assert.ok(report, `unknown candidate report ${row.candidates}`);
    const actual = renderBuilderHomeSurface({
      journey: row.journey,
      method: row.method,
      candidatesReport: report,
      refinement: toRefinement(row.refinement),
    });
    assert.equal(actual, row.expected, row.name);
  }
});

test("BUILDER ORIENTATION renders byte-identically across the same matrix", () => {
  // 28 before CV22.DS10.TS4, for the same reason as home above.
  assert.ok(oracle.orientation.length >= 12);
  for (const row of oracle.orientation) {
    const report = oracle.candidate_reports[row.candidates];
    assert.ok(report, `unknown candidate report ${row.candidates}`);
    const actual = renderBuilderOrientationSurface({
      roadmap: oracle.roadmap_snapshot,
      candidatesReport: report,
      refinement: toRefinement(row.refinement),
    });
    assert.equal(actual, row.expected, row.name);
  }
});

test("a canonical index returns early, so no create move is offered", () => {
  const canonical = toRefinement({
    active_refinement_story: null,
    active_change_request: null,
    storage_state: "project files",
    seed_change_requests: 4,
    seed_change_request_source: "docs/seed.md",
    next_move: "inspect canonical Refinement index",
    canonical_index: "docs/project/refinement/index.md",
  });
  const moves = availableRefinementMoves(canonical, null);
  assert.deepEqual(moves, [
    "pull recommended Delivery item",
    "inspect roadmap",
    "inspect canonical Refinement index",
  ]);
  // Specifically: the seed count is set, but the function returns before the
  // seed and create moves are considered.
  assert.ok(!moves.includes("review seed Change Requests"));
  assert.ok(!moves.some((move) => move.startsWith("create ")));
});

test("without a canonical index the last move is always to create it", () => {
  // CV22.DS10.TS4: the three storage branches (active RS, implemented, not
  // implemented yet) collapsed with the Workbench that produced them. One
  // move remains, and the seed count only adds a review move before it.
  const withoutIndex = (seedCount: number) =>
    availableRefinementMoves(
      toRefinement({
        active_refinement_story: null,
        active_change_request: null,
        storage_state: "project files (not started)",
        seed_change_requests: seedCount,
        seed_change_request_source: seedCount ? "docs/seed.md" : null,
        next_move: "create docs/project/refinement/index.md",
        canonical_index: null,
      }),
      null,
    );
  assert.deepEqual(withoutIndex(0), [
    "pull recommended Delivery item",
    "inspect roadmap",
    "create docs/project/refinement/index.md",
  ]);
  assert.deepEqual(withoutIndex(3), [
    "pull recommended Delivery item",
    "inspect roadmap",
    "review seed Change Requests",
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

test("the seed-CR scan counts only level-three CR headings", () => {
  const row = oracle.refinement_field.find((r) => r.project === "seeded");
  assert.ok(row);
  // Three of the four `CR:` headings in the fixture qualify: a `####` heading is
  // excluded because `^###\s+` requires whitespace after exactly three hashes,
  // while `### CR:third with no space` still matches.
  assert.equal(row.expected.seed_change_requests, 3);
  assert.equal(inspectRefinementField(join(FIXTURES, "seeded")).seedChangeRequests, 3);
});
