// CV22.DS7.US8 plateau 3 — the story-lifecycle corpus and its burn-down.
//
// The story's rule is that a golden is generated from Python BEFORE the port
// exists, which means for one commit the corpus knows more than the code. A golden
// nobody reads is not evidence, so this file exists from the moment the corpus
// does, and it does two jobs:
//
// 1. It declares the burn-down. Every lifecycle operation the corpus grades is
//    either ported or pending, and `the pending list cannot go stale` fails as soon
//    as a pending one becomes reachable — so implementing `pull` forces its
//    sequences into the graded loop instead of leaving them unread.
// 2. It grades the corpus itself, which is worth doing before any TypeScript
//    consumes it. The invariants below caught real defects while the generator was
//    being written: an absolute path leaking into a surface (machine-dependent
//    golden), and a path region collapsing rows that were already relative.
//
// Commit 2 ports `pull` and `expand`; commit 3 the rest. Each moves names from
// PENDING_OPS to PORTED_OPS and the assertions here start comparing bytes.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { approvePlanCheckpoint, renderPlanApproval } from "#builder/approve.ts";
import { getAriadMethod } from "#builder/ariadMethod.ts";
import {
  type MaterializedArtifact,
  renderArtifactsMaterializedSurface,
} from "#builder/artifacts/artifactSurfaces.ts";
import { planPackageArtifacts } from "#builder/artifacts/planArtifacts.ts";
import {
  coherenceLifecycleItem,
  doneLifecycleItem,
  renderCoherenceCheckpoint,
  renderDoneCheckpoint,
  renderReviewCheckpoint,
  renderValidationCheckpoint,
  reviewLifecycleItem,
  validateLifecycleItem,
} from "#builder/closure.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
  setTo,
} from "#builder/deliveryCursor.ts";
import {
  closureArtifactManifest,
  coherenceDeliveryStory,
  doneDeliveryStory,
  renderDeliveryStoryClosureReport,
  reviewDeliveryStory,
  validateDeliveryStory,
} from "#builder/deliveryStoryClosure.ts";
import {
  approveDeliveryStoryPlan,
  cancelDeliveryStoryPlanPreauthorization,
  planDeliveryStoryCheckpoint,
  renderDeliveryStoryImplementationStarted,
  renderDeliveryStoryPlanReport,
  renderPlanPreauthorizationMismatch,
  renderPlanPreauthorizationRecorded,
} from "#builder/deliveryStoryPlan.ts";
import { renderDeliveryStoryReadyReport } from "#builder/deliveryStoryReady.ts";
import { inspectAuthoredClosure } from "#builder/deliveryStoryRoadmapClosure.ts";
import { ExpandBlockedError, expandDeliveryStory, renderExpandBlocked } from "#builder/expand.ts";
import {
  inspectNavigatorFlowUnit,
  renderFlowUnitScopeConfirmationReport,
  renderNavigatorFlowUnitReport,
  setNavigatorFlowUnit,
} from "#builder/flowUnit.ts";
import { planLifecycleItem, renderPlanCheckpoint } from "#builder/plan.ts";
import { PlanPreauthorizationMismatch } from "#builder/planPreauthorization.ts";
import { prepareLifecycleItem, renderPrepareReport } from "#builder/prepare.ts";
import {
  placementCvTitle,
  pullLifecycleItem,
  pullPlacement,
  renderPullReport,
} from "#builder/pull.ts";
import {
  inspectReleaseIntent,
  renderReleaseIntentReport,
  setReleaseIntent,
} from "#builder/releaseIntent.ts";
import {
  createStoryDirectory,
  resolveStoryDirectory,
  StoryPackageAmbiguityError,
} from "#builder/storyPaths.ts";
import {
  approveStoryPlanWithPreauthorization,
  cancelStoryPlanPreauthorization,
  renderStoryImplementationStarted,
  renderStoryPlanPreauthorizationMismatch,
  renderStoryPlanPreauthorizationRecorded,
  renderStoryPreauthorizationAlreadyConsumed,
} from "#builder/storyPlanPreauthorization.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/builder-lifecycle.golden.json" with { type: "json" };
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { pyTitle } from "#util/pythonText.ts";

interface Surface {
  id: string;
  text: string;
}

interface Step {
  index: number;
  op: string;
  input: Record<string, unknown>;
  cursor: Record<string, unknown> | null;
  metadata: string | null;
  projection_requests: string[];
  files: Record<string, string>;
  surfaces?: Surface[];
  artifacts?: { kind: string; path: string; status: string }[];
  error?: string;
  materialized_paths?: string[];
  status?: string;
  implementation_started?: boolean;
  unfilled_sections?: string[];
  missing_evidence?: string[];
  missing_decision?: string[];
  missing_coherence?: string[];
  missing_done?: string[];
  /** Plateau 5: the aggregate extras. Every one of them is asserted below. */
  flow_unit?: string;
  source?: string;
  checkpoint?: string;
  authored_ready?: boolean;
  authored_issues?: string[];
  release_intent?: string;
  release_delivery_story?: string;
  release_changed?: boolean;
}

interface Sequence {
  name: string;
  journey: string;
  project_root: string;
  steps: Step[];
}

const sequences = (golden as unknown as { sequences: Sequence[] }).sequences;

/** Harness operations: they seed state, they are not leaves under port. */
const HARNESS_OPS = ["delete_file", "seed_cursor", "seed_receipt", "write_file"] as const;

/** Lifecycle operations TypeScript can execute today. */
const PORTED_OPS: readonly string[] = [
  "approve",
  "release_intent",
  "approve_delivery_story",
  "authored_closure",
  "cancel_delivery_story_preauthorization",
  "coherence_delivery_story",
  "done_delivery_story",
  "inspect_flow_unit",
  "plan_delivery_story",
  "review_delivery_story",
  "set_flow_unit",
  "validate_delivery_story",
  "coherence",
  "done",
  "review",
  "validate",
  "approve_with_preauthorization",
  "cancel_preauthorization",
  "expand",
  "plan",
  "prepare",
  "pull",
];

/**
 * Lifecycle operations the corpus grades and TypeScript cannot execute yet.
 *
 * Refilled by plateau 5's oracle, exactly as plateaus 3 and 4 did: the corpus is
 * generated from Python before the port exists, so for one commit it knows more than
 * the code. `the pending list cannot go stale` forces each entry out again.
 *
 * The Delivery Story face of the lifecycle. `authored_closure` is the odd one: it
 * is not a cursor transition at all but the read-only preflight Python runs inside
 * `cmd_done_delivery_story`, graded here as its own step because its refusals are
 * the safety property the whole plateau turns on.
 */
const PENDING_OPS: readonly string[] = [];

const lifecycleOps = (step: Step): boolean => !(HARNESS_OPS as readonly string[]).includes(step.op);

/** A sequence is gradable once every lifecycle op it exercises is ported. */
const isGradable = (sequence: Sequence): boolean =>
  sequence.steps.filter(lifecycleOps).every((step) => PORTED_OPS.includes(step.op));

test("every operation in the corpus is declared ported, pending, or harness", () => {
  const ops = new Set(sequences.flatMap((sequence) => sequence.steps.map((step) => step.op)));
  const declared = new Set<string>([...HARNESS_OPS, ...PORTED_OPS, ...PENDING_OPS]);
  const undeclared = [...ops].filter((op) => !declared.has(op)).sort();
  assert.deepEqual(
    undeclared,
    [],
    "the generator grew an operation this test does not know about — declare it",
  );
  assert.equal(
    PORTED_OPS.filter((op) => (PENDING_OPS as readonly string[]).includes(op)).length,
    0,
    "an operation cannot be both ported and pending",
  );
});

test("the pending list cannot go stale", () => {
  // The declaration is checked against the replayer itself: a pending op must
  // still appear in the corpus, and must still be unreachable. Implementing one
  // without moving it here fails, which is what keeps its sequences from sitting
  // ungraded. Vacuous while the list is empty, which is the point of an emptied
  // burn-down: plateau 4 refills it.
  for (const op of PENDING_OPS) {
    const used = sequences.some((sequence) => sequence.steps.some((step) => step.op === op));
    assert.ok(used, `${op} is declared pending but the corpus never exercises it`);
    assert.throws(
      () => replayLifecycleStep(null as unknown as ReplayContext, { op } as Step),
      /unsupported lifecycle op/,
      `${op} is reachable now — move it to PORTED_OPS so its sequences are graded`,
    );
  }
});

test("every gradable sequence matches Python step for step", () => {
  const graded = sequences.filter(isGradable);
  // A RATCHET, not an equality: plateau 3 brought 53 sequences under grading, and no
  // later plateau may reduce that while adding its own. Asserting `graded.length ===
  // sequences.length` would be wrong the moment a plateau lands its oracle first, and
  // asserting the count of sequences without pending ops would just restate
  // `isGradable`.
  assert.ok(
    graded.length >= 53,
    `coverage regressed: ${graded.length} of ${sequences.length} sequences graded`,
  );
  for (const sequence of graded) {
    replaySequence(sequence);
  }
});

test("the corpus covers the lifecycle shapes plateaus 3 and 4 have to port", () => {
  assert.ok(sequences.length >= 53, `expected the full sequence matrix, got ${sequences.length}`);
  const names = new Set(sequences.map((sequence) => sequence.name));
  for (const required of [
    // The happy path, and the rule that protects a Driver's authored work.
    "story_lifecycle_happy_path",
    "plan_preserves_authored_plan",
    // Expand's candidate-table grammar, both column shapes, and its refusals.
    "expand_reads_four_column_candidate_table",
    "expand_parses_generated_five_column_table",
    "expand_recommends_first_pending_child",
    "expand_blocks_on_non_canonical_candidate_table",
    "expand_blocks_on_duplicate_heading",
    // Resolution by heading code rather than by arithmetic on code and title.
    "expand_resolves_authored_dotted_code_package",
    "expand_resolves_by_heading_not_folder_name",
    // The only US8 surface with a traversal shape.
    "expand_sanitizes_path_bearing_code_cell",
    // Expand's title rule, the same on both sides since CR018: a child slugs its whole
    // title, and so does the story Expand invents for a Delivery Story with no package.
    "expand_slugs_the_full_child_title",
    "expand_fallback_uses_the_whole_delivery_story_title",
    // Bounded story authority: recorded, consumed once, refused, cancelled.
    "story_authority_recorded_user_story",
    "authority_blocks_incomplete_plan_0",
    "authority_rejects_tampered_fingerprint",
    "navigator_cancels_pending_authority",
    // Scope D. The pending/complete fork of each verb, the two exact-state
    // re-entries, the closure Done accepts without Coherence, and CR079's overwrite.
    "closure_happy_path",
    "done_directly_after_review_complete",
    "validate_pending_then_accepted",
    "review_pending_then_answered",
    "coherence_pending_then_corrected",
    "done_blocks_pending_coherence_confirmation",
    "closure_preserves_authored_artifacts",
  ]) {
    assert.ok(names.has(required), `the corpus lost the ${required} sequence`);
  }
  const refusals = sequences.flatMap((sequence) =>
    sequence.steps.filter((step) => step.error !== undefined),
  );
  assert.ok(refusals.length >= 27, `expected the refusal matrix, got ${refusals.length}`);
});

test("every recorded surface is a complete Ariad transport block", () => {
  // The story's transport invariant is that a surface crosses the boundary
  // verbatim, so a port that drops a marker or trims the trailing newline breaks
  // the contract before anyone reads the body. Plan's four `*_path=` lines are the
  // agent's and follow its end marker (CR082, D1), so for Plan the marker sits four
  // lines higher, with exactly those lines under it.
  const AGENT_LINES = /^(story_package|index_artifact|plan_artifact|test_guide_artifact)_path=/u;
  let graded = 0;
  for (const sequence of sequences) {
    for (const step of sequence.steps) {
      for (const surface of step.surfaces ?? []) {
        const marker = surface.id.toUpperCase();
        const lines = surface.text.split("\n");
        assert.equal(
          lines[0],
          `<<<ARIAD:${marker}>>>`,
          `${sequence.name} step ${step.index} ${surface.id}: begin marker`,
        );
        const below = lines.slice(lines.indexOf(`<<<END:${marker}>>>`) + 1, -1);
        assert.deepEqual(
          below.map((line) => AGENT_LINES.test(line)),
          surface.id === "plan_checkpoint" ? [true, true, true, true] : [],
          `${sequence.name} step ${step.index} ${surface.id}: end marker`,
        );
        assert.ok(
          surface.text.endsWith("\n"),
          `${sequence.name} step ${step.index} ${surface.id}: trailing newline`,
        );
        graded += 1;
      }
    }
  }
  assert.ok(graded >= 109, `expected the full surface matrix, got ${graded}`);
});

test("no recorded path is machine-dependent", () => {
  // The corpus is only portable because every path it records is project-relative.
  // An absolute path here is byte-stable on one machine and wrong on every other —
  // the failure CI caught for the roadmap golden, and the reason the corpus once
  // collapsed such rows to a token, until CR082 made every card name its paths
  // relative to the project. Asserted on the committed artifact, so a hand edit
  // cannot reintroduce it quietly.
  const absolute = /\/(?:Users|home|private\/var|var\/folders)\//;
  for (const sequence of sequences) {
    assert.ok(
      sequence.project_root.startsWith("tmp/parity/builder-lifecycle/"),
      `${sequence.name}: project root must be the disposable relative one`,
    );
    for (const step of sequence.steps) {
      for (const path of Object.keys(step.files)) {
        assert.ok(!path.startsWith("/"), `${sequence.name}: absolute key in files: ${path}`);
      }
      for (const artifact of step.artifacts ?? []) {
        assert.ok(
          !artifact.path.startsWith("/") && artifact.path !== "<OUTSIDE PROJECT>",
          `${sequence.name}: artifact path is not project-relative: ${artifact.path}`,
        );
      }
      for (const path of step.materialized_paths ?? []) {
        assert.ok(!path.startsWith("/"), `${sequence.name}: absolute materialized path: ${path}`);
      }
      for (const surface of step.surfaces ?? []) {
        assert.ok(
          !absolute.test(surface.text),
          `${sequence.name} step ${step.index} ${surface.id}: absolute path in surface`,
        );
        // A stricter "no card row may start with `/`" was tried here and removed:
        // it flags legitimate project-relative chunks, because wrapping can split
        // `…/roadmap/story` so a continuation row begins with `/story`. Since CR082
        // no card prints a path whose chunks depend on a root's length, and
        // `pathsWalk.test.ts` runs every command that prints one under a known root.
      }
      if (step.error !== undefined) {
        assert.ok(!absolute.test(step.error), `${sequence.name}: absolute path in error`);
      }
    }
  }
});

test("every recorded cursor cell is the serialized shape Python writes", () => {
  // D2 rests on TypeScript writing the bytes Python writes, so the corpus must
  // record parseable metadata wherever a cursor exists, and none where it does not.
  for (const sequence of sequences) {
    for (const step of sequence.steps) {
      assert.equal(
        step.metadata === null,
        step.cursor === null,
        `${sequence.name} step ${step.index}: cursor and metadata must agree on existence`,
      );
      if (step.metadata === null) continue;
      const parsed = JSON.parse(step.metadata) as Record<string, unknown>;
      assert.equal(
        parsed.method,
        step.cursor?.method,
        `${sequence.name} step ${step.index}: metadata method must match the cursor`,
      );
      assert.equal(
        parsed.active_item ?? null,
        step.cursor?.active_item ?? null,
        `${sequence.name} step ${step.index}: metadata active item must match the cursor`,
      );
    }
  }
});

test("steps are recorded in order, so transitions can be graded as sequences", () => {
  for (const sequence of sequences) {
    assert.deepEqual(
      sequence.steps.map((step) => step.index),
      sequence.steps.map((_step, index) => index),
      `${sequence.name}: step indices must be dense and ordered`,
    );
  }
});

// --- replay harness --------------------------------------------------------
//
// The corpus records a sequence as ordered STEPS, each with the state Python
// reached after it. The harness replays the same steps against the TypeScript
// modules and compares everything the golden captured: the serialized cursor
// cell, the cursor fields, the rendered surfaces, the files on disk, the artifact
// statuses, the projection requests, and the refusal messages.
//
// Seeding steps (`write_file`, `seed_cursor`) are replayed rather than skipped —
// they are how the sequence reaches the state the lifecycle op is graded from.
// `write_file` reconstructs its content from the snapshot the step recorded,
// which keeps the corpus self-contained.

const NOW = "2026-01-01T00:00:00+00:00";

interface ReplayContext {
  readonly db: WritableDatabase;
  /** Relative, because that is what the surfaces must RENDER. */
  readonly project: string;
  /**
   * Resolved, because that is what path MATH needs: `storyPaths` resolves, so
   * refusal messages and Expand's materialized paths are absolute even when the
   * project root is not.
   */
  readonly projectAbsolute: string;
  readonly journey: string;
  readonly deps: CursorWriteDeps;
  /**
   * The reports a later step composes with, exactly as the CLI holds them.
   * `delivery_story_ready` needs Pull, Prepare, AND Expand, so Expand renders it
   * only when the same sequence pulled and prepared first — which is the CLI's own
   * condition.
   */
  reports: {
    pull?: ReturnType<typeof pullLifecycleItem>;
    prepare?: ReturnType<typeof prepareLifecycleItem>;
    plan?: ReturnType<typeof planLifecycleItem>;
  };
  /** The Plan artifact path this sequence used, which authority consumption re-reads. */
  planPath: string | null;
  /**
   * Which package files existed BEFORE the step that is running, sampled the way the
   * CLI samples it. Without this, a preserved file would report `created` and the
   * preservation rule would look identical to an overwrite.
   */
  existedBefore: Map<string, boolean>;
}

function memoryDatabase(directory: string): WritableDatabase {
  // `openDatabaseCopyForWrite` refuses a target outside a `tmp/` path — the guard
  // that keeps a write probe off a real database — and on macOS `os.tmpdir()` is
  // `/var/folders/...`, which does not satisfy it. `commands.test.ts` hit the same
  // wall and settled on the literal prefix.
  const db = openDatabaseCopyForWrite(join(directory, "copy.db"));
  createRuntimeTables(db);
  return db;
}

/** Every file under the project, project-relative, exactly as the generator recorded it. */
function snapshotFiles(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else snapshot[relative(root, absolute).split(sep).join("/")] = readFileSync(absolute, "utf8");
    }
  };
  walk(root);
  return Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The golden's snake_case cursor dump, rebuilt from the TypeScript cursor. */
function cursorDump(cursor: BuilderDeliveryCursor | null): Record<string, unknown> | null {
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

/** The stored metadata cell — the bytes D2's revert contract rests on. */
function storedMetadata(db: WritableDatabase, journey: string): string | null {
  const row = db
    .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
    .get(`__builder_delivery_cursor__:${journey}`) as { metadata: string | null } | undefined;
  return row?.metadata ?? null;
}

/** `seed_cursor`'s recorded kwargs, mapped onto the TypeScript options. */
function seedCursor(context: ReplayContext, input: Record<string, unknown>): void {
  const value = <T>(key: string): T | undefined => input[key] as T | undefined;
  setDeliveryCursor(
    context.db,
    {
      journey: context.journey,
      method: value<string>("method") ?? "ariad",
      activeItem: value<string | null>("active_item") ?? null,
      activeItemTitle: value<string | null>("active_item_title") ?? null,
      activeItemLevel: value<string | null>("active_item_level") ?? null,
      activeCheckpoint: value<string | null>("active_checkpoint") ?? null,
      pendingConfirmation: value<string | null>("pending_confirmation") ?? null,
      lastDeliveryEvent: value<string | null>("last_delivery_event") ?? null,
      cadenceProfile: value<string | null>("cadence_profile") ?? null,
      cadenceLimits: value<string[]>("cadence_limits") ?? [],
      granularityDecision: value<string | null>("granularity_decision") ?? null,
      navigatorFlowUnit: value<string | null>("navigator_flow_unit") ?? null,
      childWorkItems: value<string[]>("child_work_items") ?? [],
      aggregateCheckpointStatus: value<string[]>("aggregate_checkpoint_status") ?? [],
      cursorGeneration: value<number | null>("cursor_generation") ?? null,
      // KEEP when the seed does not mention them, SET when it does.
      //
      // Python's `set_delivery_cursor` defaults both to its `_KEEP` sentinel, so a
      // seed that names neither PRESERVES whatever the row already carried. This
      // replay set them to `null` instead, which is invisible until a scenario
      // records an intent and then seeds a new cursor — exactly what plateau 6's
      // `release_intent_is_scoped_to_its_delivery_story` does, and how the bug was
      // found. An absent key is not the value `null`.
      releaseIntentDeliveryStory:
        "release_intent_delivery_story" in input
          ? setTo(value<string | null>("release_intent_delivery_story") ?? null)
          : { kind: "keep" as const },
      releaseIntent:
        "release_intent" in input
          ? setTo(value<string | null>("release_intent") ?? null)
          : { kind: "keep" as const },
    },
    context.deps,
  );
}

/**
 * `seed_receipt`: rewrite the cursor carrying a MUTATED receipt, which is how the
 * tamper scenarios reach a receipt whose fields no longer hash to its fingerprint.
 */
function seedReceipt(context: ReplayContext, input: Record<string, unknown>): void {
  const current = getDeliveryCursor(context.db, context.journey);
  assert.ok(current?.planPreauthorization, "seed_receipt needs an existing receipt");
  const changes = (input.receipt_changes ?? {}) as Record<string, unknown>;
  const camel = (key: string): string =>
    key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  const receipt = { ...current.planPreauthorization } as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) receipt[camel(key)] = value;
  const value = <T>(key: string): T | undefined => input[key] as T | undefined;
  setDeliveryCursor(
    context.db,
    {
      journey: context.journey,
      method: value<string>("method") ?? "ariad",
      activeItem: value<string | null>("active_item") ?? null,
      activeItemTitle: value<string | null>("active_item_title") ?? null,
      activeItemLevel: value<string | null>("active_item_level") ?? null,
      activeCheckpoint: value<string | null>("active_checkpoint") ?? null,
      pendingConfirmation: value<string | null>("pending_confirmation") ?? null,
      lastDeliveryEvent: value<string | null>("last_delivery_event") ?? null,
      cadenceProfile: value<string | null>("cadence_profile") ?? null,
      cadenceLimits: value<string[]>("cadence_limits") ?? [],
      granularityDecision: value<string | null>("granularity_decision") ?? null,
      navigatorFlowUnit: value<string | null>("navigator_flow_unit") ?? null,
      childWorkItems: value<string[]>("child_work_items") ?? [],
      aggregateCheckpointStatus: value<string[]>("aggregate_checkpoint_status") ?? [],
      cursorGeneration: value<number | null>("cursor_generation") ?? null,
      planPreauthorization: setTo(
        receipt as unknown as NonNullable<BuilderDeliveryCursor["planPreauthorization"]>,
      ),
      releaseIntentDeliveryStory: setTo(
        value<string | null>("release_intent_delivery_story") ?? null,
      ),
      releaseIntent: setTo(value<string | null>("release_intent") ?? null),
    },
    context.deps,
  );
}

interface ReplayOutcome {
  readonly surfaces: { id: string; text: string }[];
  readonly artifacts?: { kind: string; path: string; status: string }[];
  readonly materializedPaths?: string[];
  readonly error?: string;
  /** `approve_with_preauthorization` records these alongside its surfaces. */
  readonly status?: string;
  readonly implementationStarted?: boolean;
  readonly unfilledSections?: string[];
  /** The closure verbs each record their own missing-evidence tuple. */
  readonly missingEvidence?: string[];
  readonly missingDecision?: string[];
  readonly missingCoherence?: string[];
  readonly missingDone?: string[];
  /** The flow-unit faces record the effective unit and where it came from. */
  readonly flowUnit?: string;
  readonly source?: string;
  /** The aggregate closure verbs record their checkpoint alongside the status. */
  readonly checkpoint?: string;
  /** The Done preflight records its verdict and its project-relative evidence. */
  readonly authoredReady?: boolean;
  readonly authoredIssues?: string[];
  /** Release intent records the pair it resolved, and whether it changed anything. */
  readonly releaseIntent?: string;
  readonly releaseDeliveryStory?: string;
  readonly releaseChanged?: boolean;
}

/**
 * Run one lifecycle step and return what the golden records for it.
 *
 * An unported op throws `unsupported lifecycle op`, which is what
 * `the pending list cannot go stale` asserts against.
 */
function replayLifecycleStep(context: ReplayContext, step: Step): ReplayOutcome {
  switch (step.op) {
    case "pull": {
      const input = step.input as Record<string, string>;
      try {
        const report = pullLifecycleItem(
          context.db,
          {
            journey: context.journey,
            method: input.method ?? "ariad",
            item: {
              code: input.code ?? "",
              title: input.title ?? "",
              level: input.level ?? "",
              whyNow: input.why_now ?? "",
            },
          },
          context.deps,
        );
        context.reports.pull = report;
        const placement = pullPlacement(context.project, report.cursor);
        return {
          surfaces: [{ id: "item_activated", text: renderPullReport(report, placement) }],
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "expand": {
      const before = getDeliveryCursor(context.db, context.journey);
      try {
        const report = expandDeliveryStory(
          context.db,
          {
            journey: context.journey,
            method: (step.input as Record<string, string>).method ?? "ariad",
            projectPath: context.project,
          },
          context.deps,
        );
        const ready =
          context.reports.pull !== undefined && context.reports.prepare !== undefined
            ? [
                {
                  id: "delivery_story_ready",
                  text: renderDeliveryStoryReadyReport({
                    pull: context.reports.pull,
                    prepare: context.reports.prepare,
                    expand: report,
                    cvTitle: placementCvTitle(context.project, context.reports.pull.cursor),
                  }),
                },
              ]
            : [];
        return {
          // No command prints `EXPAND_DECISION`, in either engine, so it left (CR082, D5).
          surfaces: [
            ...ready,
            {
              id: "artifacts_materialized",
              text: renderArtifactsMaterializedSurface({
                context: `Expand — ${report.deliveryStory}`,
                artifacts: report.materializedArtifacts,
                projectPath: context.project,
                boundary: "Files were materialized only. No Plan or implementation was executed.",
              }),
            },
          ],
          artifacts: report.materializedArtifacts.map((artifact) =>
            artifactRecord(artifact, context.projectAbsolute),
          ),
          materializedPaths: report.materializedPaths.map((path) =>
            projectRelativePath(path, context.projectAbsolute),
          ),
        };
      } catch (error) {
        if (error instanceof ExpandBlockedError || error instanceof StoryPackageAmbiguityError) {
          const message = error.message;
          return {
            surfaces: [
              {
                id: "expand_blocked",
                text: renderExpandBlocked(before?.activeItem ?? "none", message),
              },
            ],
            error: pythonError(error),
          };
        }
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "prepare": {
      const input = step.input as { method?: string; with_project?: boolean };
      try {
        const report = prepareLifecycleItem(
          context.db,
          {
            journey: context.journey,
            method: input.method ?? "ariad",
            projectPath: input.with_project === false ? null : context.project,
          },
          context.deps,
        );
        context.reports.prepare = report;
        return { surfaces: [{ id: "prepare_field_reading", text: renderPrepareReport(report) }] };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "plan": {
      const input = step.input as {
        objective?: string | null;
        scope?: string[];
        non_goals?: string[];
        acceptance_behavior?: string[];
        validation_route?: string[];
        e2e_decision?: string | null;
        local_rules?: string[];
        preauthorize?: boolean;
        stop_boundary?: string;
        artifact?: boolean;
        plan_relative?: string | null;
      };
      // The generator derives the Plan artifact path the way `cli/build.py` does:
      // an explicit relative path when the scenario names one, otherwise resolve or
      // create the canonical package.
      let planPath: string | null = null;
      if (input.plan_relative != null) {
        planPath = join(context.project, input.plan_relative);
      } else if (input.artifact !== false) {
        planPath = canonicalPlanPath(context);
      }
      context.planPath = planPath;
      if (planPath !== null) {
        const directory = dirname(planPath);
        for (const path of [
          join(directory, "index.md"),
          planPath,
          join(directory, "test-guide.md"),
        ]) {
          context.existedBefore.set(path, existsSync(path));
        }
      }
      // CR111 D3: Plan composes its scaffold from one vocabulary and takes no section
      // text. Every recorded Plan step passed none; a step that did would now be
      // ignored silently, so the harness refuses it instead.
      for (const field of [
        "scope",
        "non_goals",
        "acceptance_behavior",
        "validation_route",
      ] as const) {
        assert.deepEqual(input[field] ?? [], [], `a recorded Plan step passes ${field}`);
      }
      assert.equal(input.e2e_decision ?? null, null, "a recorded Plan step passes e2e_decision");
      try {
        const report = planLifecycleItem(
          context.db,
          {
            journey: context.journey,
            method: getAriadMethod(),
            objective: input.objective ?? null,
            localRules: input.local_rules ?? [],
            planArtifactPath: planPath,
            projectRoot: context.project,
            preauthorize: input.preauthorize ?? false,
            stopBoundary: input.stop_boundary ?? "navigator_validation",
          },
          context.deps,
        );
        context.reports.plan = report;
        const surfaces = [
          {
            id: "plan_checkpoint",
            text: renderPlanCheckpoint(report),
          },
        ];
        if (report.preauthorizationRecorded) {
          surfaces.push({
            id: "plan_preauthorization_recorded",
            text: renderStoryPlanPreauthorizationRecorded(report.cursor),
          });
        }
        const artifacts = planPackageArtifacts(planPath, context.existedBefore);
        if (artifacts.length > 0) {
          surfaces.push({
            id: "artifacts_materialized",
            text: renderArtifactsMaterializedSurface({
              context: `Plan — ${report.activeItem}`,
              artifacts,
              projectPath: context.project,
              boundary:
                "Plan artifacts were materialized. Implementation remains blocked until approval.",
            }),
          });
        }
        return {
          surfaces,
          artifacts: artifacts.map((artifact) => artifactRecord(artifact, context.projectAbsolute)),
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "approve": {
      try {
        // The package's plan, resolved as the command resolves it (CR112).
        const cursor = approvePlanCheckpoint(
          context.db,
          {
            journey: context.journey,
            method: (step.input as { method?: string }).method ?? "ariad",
            planArtifactPath: closureArtifactPath(context, "plan.md"),
            projectRoot: context.project,
          },
          context.deps,
        );
        return { surfaces: [{ id: "plan_approved", text: renderPlanApproval(cursor) }] };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "approve_with_preauthorization": {
      try {
        const report = approveStoryPlanWithPreauthorization(
          context.db,
          {
            journey: context.journey,
            method: (step.input as { method?: string }).method ?? "ariad",
            planArtifactPath: context.planPath,
          },
          context.deps,
        );
        if (report.status === "already_approved") {
          return {
            surfaces: [
              {
                id: "plan_preauthorization_already_consumed",
                text: renderStoryPreauthorizationAlreadyConsumed(report.cursor),
              },
            ],
            status: report.status,
            implementationStarted: report.implementationStarted,
            unfilledSections: [...report.unfilledSections],
          };
        }
        return {
          surfaces: [
            { id: "plan_approved", text: renderPlanApproval(report.cursor) },
            {
              id: "implementation_started",
              text: renderStoryImplementationStarted(report.cursor),
            },
          ],
          status: report.status,
          implementationStarted: report.implementationStarted,
          unfilledSections: [...report.unfilledSections],
        };
      } catch (error) {
        if (error instanceof PlanPreauthorizationMismatch) {
          const cursor = getDeliveryCursor(context.db, context.journey);
          return {
            surfaces: [
              {
                id: "plan_preauthorization_mismatch",
                text: renderStoryPlanPreauthorizationMismatch({
                  activeItem: cursor?.activeItem ?? null,
                  reason: error.reason,
                  toAuthor: error.sections,
                }),
              },
            ],
            error: `PlanPreauthorizationMismatch: ${error.reason}`,
          };
        }
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "cancel_preauthorization": {
      try {
        const cursor = cancelStoryPlanPreauthorization(
          context.db,
          {
            journey: context.journey,
            method: (step.input as { method?: string }).method ?? "ariad",
          },
          context.deps,
        );
        return {
          surfaces: [
            {
              id: "plan_preauthorization_mismatch",
              text: renderStoryPlanPreauthorizationMismatch({
                activeItem: cursor.activeItem,
                reason: "navigator_cancelled",
              }),
            },
          ],
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "validate": {
      const input = step.input as Record<string, unknown>;
      try {
        const report = validateLifecycleItem(
          context.db,
          {
            journey: context.journey,
            method: getAriadMethod(),
            automatedChecks: (input.automated_checks as string[]) ?? [],
            checksStatus: (input.checks_status as string) ?? "not_run",
            e2eDecision: (input.e2e_decision as string) ?? "not_required",
            e2eEvidence: (input.e2e_evidence as string | null) ?? null,
            navigatorValidationRoute: (input.navigator_validation_route as string | null) ?? null,
            navigatorAccepted: (input.navigator_accepted as boolean) ?? false,
            expectedObservation: (input.expected_observation as string | null) ?? null,
            passCondition: (input.pass_condition as string | null) ?? null,
            failCondition: (input.fail_condition as string | null) ?? null,
            implementationComplete: (input.implementation_complete as boolean) ?? false,
            validationArtifactPath: closureArtifactPath(context, input.artifact as string | null),
            projectRoot: context.project,
          },
          context.deps,
        );
        return {
          surfaces: [{ id: "validation_checkpoint", text: renderValidationCheckpoint(report) }],
          missingEvidence: [...report.missingEvidence],
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "review": {
      const input = step.input as Record<string, unknown>;
      try {
        const report = reviewLifecycleItem(
          context.db,
          {
            journey: context.journey,
            method: getAriadMethod(),
            debtFindings: (input.debt_findings as string[]) ?? [],
            debtDecision: (input.debt_decision as string) ?? "pending",
            deferReason: (input.defer_reason as string | null) ?? null,
            revisitTrigger: (input.revisit_trigger as string | null) ?? null,
            reviewArtifactPath: closureArtifactPath(context, input.artifact as string | null),
            projectRoot: context.project,
          },
          context.deps,
        );
        return {
          surfaces: [{ id: "debt_review_checkpoint", text: renderReviewCheckpoint(report) }],
          missingDecision: [...report.missingDecision],
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "coherence": {
      const input = step.input as Record<string, unknown>;
      try {
        const report = coherenceLifecycleItem(
          context.db,
          {
            journey: context.journey,
            method: getAriadMethod(),
            processAlignment: (input.process_alignment as string | null) ?? null,
            projectAlignment: (input.project_alignment as string | null) ?? null,
            productAlignment: (input.product_alignment as string | null) ?? null,
            localDifferences: (input.local_differences as string[]) ?? [],
            coherenceArtifactPath: closureArtifactPath(context, input.artifact as string | null),
            projectRoot: context.project,
          },
          context.deps,
        );
        return {
          surfaces: [{ id: "coherence_checkpoint", text: renderCoherenceCheckpoint(report) }],
          missingCoherence: [...report.missingCoherence],
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "done": {
      const input = step.input as Record<string, unknown>;
      try {
        const report = doneLifecycleItem(
          context.db,
          {
            journey: context.journey,
            method: getAriadMethod(),
            historyAction: (input.history_action as string | null) ?? null,
            roadmapUpdate: (input.roadmap_update as string | null) ?? null,
            nextRecommendation: (input.next_recommendation as string | null) ?? null,
            doneArtifactPath: closureArtifactPath(context, input.artifact as string | null),
            indexArtifactPath: closureArtifactPath(context, "index.md"),
            projectRoot: context.project,
          },
          context.deps,
        );
        return {
          surfaces: [{ id: "done_checkpoint", text: renderDoneCheckpoint(report) }],
          missingDone: [...report.missingDone],
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    // -- Delivery Story ops (plateau 5) ------------------------------------
    case "inspect_flow_unit": {
      try {
        const report = inspectNavigatorFlowUnit(context.db, {
          journey: context.journey,
          method: (step.input as Record<string, string>).method ?? "ariad",
        });
        return {
          surfaces: [{ id: "navigator_flow_unit", text: renderNavigatorFlowUnitReport(report) }],
          flowUnit: report.flowUnit,
          source: report.source,
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "set_flow_unit": {
      const input = step.input as Record<string, string>;
      try {
        const report = setNavigatorFlowUnit(
          context.db,
          {
            journey: context.journey,
            method: input.method ?? "ariad",
            flowUnit: input.flow_unit ?? "",
          },
          context.deps,
        );
        // The id follows the UNIT, exactly as Python's renderer chooses it.
        return {
          surfaces: [
            {
              id:
                report.flowUnit === "delivery_story"
                  ? "delivery_story_scope_confirmation"
                  : "next_story_confirmation",
              text: renderFlowUnitScopeConfirmationReport(report),
            },
          ],
          flowUnit: report.flowUnit,
          source: report.source,
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "plan_delivery_story": {
      const input = step.input as Record<string, unknown>;
      const planPath = input.artifact === false ? null : canonicalPlanPath(context);
      try {
        const report = planDeliveryStoryCheckpoint(
          context.db,
          {
            journey: context.journey,
            method: (input.method as string) ?? "ariad",
            objective: (input.objective as string) ?? "",
            childWorkItems: (input.child_work_items as string[]) ?? [],
            planArtifactPath: planPath,
            projectRoot: context.project,
            preauthorize: (input.preauthorize as boolean) ?? false,
            stopBoundary: (input.stop_boundary as string) ?? "navigator_validation",
          },
          context.deps,
        );
        const surfaces = [
          {
            id: "delivery_story_plan_checkpoint",
            text: renderDeliveryStoryPlanReport(report),
          },
        ];
        if (input.preauthorize === true) {
          surfaces.push({
            id: "plan_preauthorization_recorded",
            text: renderPlanPreauthorizationRecorded(report),
          });
        }
        surfaces.push({
          id: "artifacts_materialized",
          text: renderArtifactsMaterializedSurface({
            context: `Delivery Story Plan — ${report.cursor.activeItem ?? "active item"}`,
            artifacts: report.materializedArtifacts,
            projectPath: context.project,
            boundary:
              "Plan artifacts were materialized. Implementation remains blocked until approval.",
          }),
        });
        return {
          surfaces,
          artifacts: report.materializedArtifacts.map((artifact) =>
            artifactRecord(artifact, context.projectAbsolute),
          ),
          status: report.status,
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "approve_delivery_story": {
      const input = step.input as Record<string, unknown>;
      const before = getDeliveryCursor(context.db, context.journey);
      try {
        const report = approveDeliveryStoryPlan(
          context.db,
          {
            journey: context.journey,
            method: (input.method as string) ?? "ariad",
            planArtifactPath: canonicalPlanPath(context),
            projectRoot: context.project,
            usePreauthorization: (input.use_preauthorization as boolean) ?? false,
          },
          context.deps,
        );
        const surfaces = [
          {
            id: "delivery_story_plan_checkpoint",
            text: renderDeliveryStoryPlanReport(report),
          },
        ];
        if (report.status !== "already_approved") {
          surfaces.push({
            id: "artifacts_materialized",
            text: renderArtifactsMaterializedSurface({
              context: `Delivery Story Plan Approval — ${report.cursor.activeItem ?? "active item"}`,
              artifacts: report.materializedArtifacts,
              projectPath: context.project,
              boundary:
                "Plan approval artifacts were materialized. Implementation may proceed under the approved plan.",
            }),
          });
          if (report.implementationStarted) {
            surfaces.push({
              id: "implementation_started",
              text: renderDeliveryStoryImplementationStarted(report),
            });
          }
        }
        return {
          surfaces,
          artifacts:
            report.status === "already_approved"
              ? []
              : report.materializedArtifacts.map((artifact) =>
                  artifactRecord(artifact, context.projectAbsolute),
                ),
          status: report.status,
          implementationStarted: report.implementationStarted,
          unfilledSections: [...report.unfilledSections],
        };
      } catch (error) {
        if (error instanceof PlanPreauthorizationMismatch) {
          return {
            surfaces: [
              {
                id: "plan_preauthorization_mismatch",
                text: renderPlanPreauthorizationMismatch({
                  activeItem: before?.activeItem ?? null,
                  reason: error.reason,
                }),
              },
            ],
            error: `PlanPreauthorizationMismatch: ${error.reason}`,
          };
        }
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "cancel_delivery_story_preauthorization": {
      try {
        const cursor = cancelDeliveryStoryPlanPreauthorization(
          context.db,
          {
            journey: context.journey,
            method: (step.input as Record<string, string>).method ?? "ariad",
          },
          context.deps,
        );
        return {
          surfaces: [
            {
              id: "plan_preauthorization_mismatch",
              text: renderPlanPreauthorizationMismatch({
                activeItem: cursor.activeItem,
                reason: "navigator_cancelled",
              }),
            },
          ],
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "validate_delivery_story":
    case "review_delivery_story":
    case "coherence_delivery_story":
    case "done_delivery_story":
      return replayDeliveryStoryClosure(context, step);
    case "release_intent": {
      const input = step.input as Record<string, string | null>;
      const method = input.method ?? "ariad";
      try {
        const report =
          input.intent === null || input.intent === undefined
            ? inspectReleaseIntent(context.db, { journey: context.journey, method })
            : setReleaseIntent(
                context.db,
                { journey: context.journey, method, intent: input.intent },
                context.deps,
              );
        return {
          surfaces: [{ id: "release_intent", text: renderReleaseIntentReport(report) }],
          releaseIntent: report.intent,
          releaseDeliveryStory: report.deliveryStory,
          releaseChanged: report.changed,
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    case "authored_closure": {
      const cursor = getDeliveryCursor(context.db, context.journey);
      try {
        const report = inspectAuthoredClosure(context.project, {
          deliveryStory: cursor?.activeItem ?? "",
          childWorkItems: cursor?.childWorkItems ?? [],
        });
        return {
          surfaces: [],
          authoredReady: report.ready,
          authoredIssues: [...report.issues],
        };
      } catch (error) {
        return { surfaces: [], error: pythonError(error) };
      }
    }
    default:
      throw new Error(`unsupported lifecycle op: ${step.op}`);
  }
}

/**
 * The four aggregate closure verbs, which differ only in the call and the artifact
 * name — the surface, the manifest, and the recorded extras are one shape.
 */
function replayDeliveryStoryClosure(context: ReplayContext, step: Step): ReplayOutcome {
  const input = step.input as Record<string, unknown>;
  const method = (input.method as string) ?? "ariad";
  const path = closureArtifactPath(context, (input.artifact as string | null) ?? null);
  const kind = step.op.replace("_delivery_story", "");
  try {
    const report = (() => {
      const shared = {
        journey: context.journey,
        method,
        artifactPath: path,
        projectRoot: context.project,
      };
      switch (step.op) {
        case "validate_delivery_story":
          return validateDeliveryStory(
            context.db,
            {
              ...shared,
              summary: (input.summary as string) ?? "",
              navigatorAccepted: (input.navigator_accepted as boolean) ?? false,
            },
            context.deps,
          );
        case "review_delivery_story":
          return reviewDeliveryStory(
            context.db,
            {
              ...shared,
              decision: (input.decision as string) ?? "",
              summary: (input.summary as string) ?? "",
            },
            context.deps,
          );
        case "coherence_delivery_story":
          return coherenceDeliveryStory(
            context.db,
            { ...shared, summary: (input.summary as string) ?? "" },
            context.deps,
          );
        default:
          return doneDeliveryStory(
            context.db,
            { ...shared, summary: (input.summary as string) ?? "" },
            context.deps,
          );
      }
    })();
    const surfaces = [
      {
        id: "delivery_story_closure_checkpoint",
        text: renderDeliveryStoryClosureReport(report),
      },
    ];
    const artifacts = closureArtifactManifest(kind, path, report.artifactOutcome);
    if (path !== null) {
      surfaces.push({
        id: "artifacts_materialized",
        text: renderArtifactsMaterializedSurface({
          context: `Delivery Story ${pyTitle(kind)} — ${report.cursor.activeItem ?? "active item"}`,
          artifacts,
          projectPath: context.project,
          boundary: `${pyTitle(kind)} artifact was materialized.`,
        }),
      });
    }
    return {
      surfaces,
      artifacts: artifacts.map((artifact) => artifactRecord(artifact, context.projectAbsolute)),
      status: report.status,
      checkpoint: report.checkpoint,
    };
  } catch (error) {
    return { surfaces: [], error: pythonError(error) };
  }
}

/**
 * The CLI's `_checkpoint_artifact_path`, rendered relative like the Plan path.
 *
 * The generator passed a repo-relative path so that closure cards printing it as
 * handed stayed byte-comparable. Since CR082 a card names it relative to the project.
 */
function closureArtifactPath(context: ReplayContext, filename: string | null): string | null {
  if (filename === null) return null;
  const cursor = getDeliveryCursor(context.db, context.journey);
  if (cursor === null || !cursor.activeItem) return null;
  const resolved =
    resolveStoryDirectory(context.project, cursor.activeItem) ??
    createStoryDirectory(
      context.project,
      cursor.activeItem,
      cursor.activeItemTitle ?? cursor.activeItem,
    );
  return join(relative(process.cwd(), resolved), filename);
}

/**
 * The CLI's `_canonical_package_path` + `_plan_artifact_path`, then the generator's
 * `_repo_relative`.
 *
 * `storyPaths` resolves absolute, by design — its confinement guard needs that — and
 * the generator re-expresses the result relative to the process cwd before handing it
 * to Plan, so the surface's package rows are machine-independent. The test mirrors
 * both halves: resolve through the real resolver, render through the relative form.
 */
function canonicalPlanPath(context: ReplayContext): string | null {
  const cursor = getDeliveryCursor(context.db, context.journey);
  if (cursor === null || !cursor.activeItem) return null;
  const resolved =
    resolveStoryDirectory(context.project, cursor.activeItem) ??
    createStoryDirectory(
      context.project,
      cursor.activeItem,
      cursor.activeItemTitle ?? cursor.activeItem,
    );
  return join(relative(process.cwd(), resolved), "plan.md");
}

/**
 * One recorded artifact: its kind, its project-relative path, its status, and the note
 * that says what an existing file is, when there is one (CR112). Every lifecycle step
 * records artifacts through this, so a field the product adds cannot be dropped at one
 * site and kept at another. Plan's artifacts come from the product's own
 * `planPackageArtifacts` over existence sampled BEFORE Plan writes, so a file Plan
 * created reports `created` and one that was there reports `existing`.
 */
function artifactRecord(artifact: MaterializedArtifact, projectAbsolute: string) {
  return {
    kind: artifact.kind,
    path: projectRelativePath(artifact.path, projectAbsolute),
    status: artifact.status,
    ...(artifact.note === undefined ? {} : { note: artifact.note }),
  };
}

/**
 * Project-relative, from either form of input: Expand's paths are absolute and
 * Plan's are the relative ones the generator handed it, so both are resolved before
 * the comparison.
 */
function projectRelativePath(path: string, projectAbsolute: string): string {
  return relative(projectAbsolute, resolve(path)).split(sep).join("/");
}

/**
 * Python's `f"{type(exc).__name__}: {exc}"`. Compared as raised: the generator scrubbed
 * the project root out of the oracle's messages, and since CR082 the runtime names
 * every package relative to the project where it raises, so there is nothing to scrub.
 */
function pythonError(error: unknown): string {
  const name =
    error instanceof ExpandBlockedError
      ? "ExpandBlockedError"
      : error instanceof StoryPackageAmbiguityError
        ? "StoryPackageAmbiguityError"
        : "ValueError";
  return `${name}: ${(error as Error).message}`;
}

function replaySequence(sequence: Sequence): void {
  // The sequence's OWN recorded project root, relative like the generator's, not a
  // `mkdtemp` directory. The generator handed Plan and the closures repo-relative paths
  // so that rows printing them unrelativized stayed byte-stable. Since CR082 every card
  // row names its path relative to the project, whatever the root, but the recorded
  // `*_path=` lines Plan prints still hold the repo-relative form, so the test stages
  // the same relative directory. It resolves under `ts/` here and the repository root
  // there; both are gitignored `tmp/`, which also satisfies the database copy guard.
  // The front-door walks (`pathsWalk.test.ts`) run the absolute roots the product
  // passes.
  const project = sequence.project_root;
  const root = dirname(project);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(project, { recursive: true });
  const db = memoryDatabase(root);
  const context: ReplayContext = {
    db,
    project,
    journey: sequence.journey,
    deps: {
      nowIso: () => NOW,
    },
    projectAbsolute: resolve(project),
    reports: {},
    planPath: null,
    existedBefore: new Map(),
  };

  try {
    for (const step of sequence.steps) {
      const where = `${sequence.name} step ${step.index} (${step.op})`;
      let outcome: ReplayOutcome = { surfaces: [] };
      switch (step.op) {
        case "write_file": {
          // The generator records only the PATH; the content is in the snapshot
          // the same step took, which keeps the corpus self-describing.
          const path = (step.input as { path: string }).path;
          const content = step.files[path];
          assert.ok(content !== undefined, `${where}: the corpus lost the written content`);
          const target = join(project, path);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, content, "utf8");
          break;
        }
        case "delete_file":
          rmSync(join(project, (step.input as { path: string }).path));
          break;
        case "seed_cursor":
          seedCursor(context, step.input as Record<string, unknown>);
          break;
        case "seed_receipt":
          seedReceipt(context, step.input as Record<string, unknown>);
          break;
        default:
          outcome = replayLifecycleStep(context, step);
      }

      assert.equal(outcome.error ?? undefined, step.error, `${where}: refusal`);
      assert.deepEqual(
        outcome.surfaces,
        (step.surfaces ?? []).map((surface) => ({ id: surface.id, text: surface.text })),
        `${where}: surfaces`,
      );
      assert.deepEqual(
        cursorDump(getDeliveryCursor(db, sequence.journey)),
        step.cursor,
        `${where}: cursor`,
      );
      assert.equal(storedMetadata(db, sequence.journey), step.metadata, `${where}: cursor bytes`);
      assert.deepEqual(snapshotFiles(project), step.files, `${where}: files`);
      // `step.projection_requests` stays in the corpus and is no longer asserted:
      // CV22.DS10.TS1 retired the projection seam, so every step would record an
      // empty list. The corpus is a recording of the Python oracle, not a fixture
      // this story may rewrite, and its surface assertions still grade the port.
      if (step.artifacts !== undefined) {
        assert.deepEqual(outcome.artifacts, step.artifacts, `${where}: artifacts`);
      }
      if (step.status !== undefined) {
        assert.equal(outcome.status, step.status, `${where}: authority status`);
        assert.equal(
          outcome.implementationStarted,
          step.implementation_started,
          `${where}: implementation started`,
        );
        assert.deepEqual(
          outcome.unfilledSections,
          step.unfilled_sections,
          `${where}: unfilled sections`,
        );
      }
      // Every recorded extra is compared here. `authored_issues` is the one that
      // matters most and the one that was briefly recorded without being asserted:
      // the DS Done preflight emits NO surface, so its whole observable behavior is
      // this list, and a mutant that stops reading `legacy/` survived until this
      // loop knew about it. Recording without asserting is the same false green the
      // plateau-3 harness lesson names — extended here from "assert the file
      // changed" to "assert every field you record".
      for (const [key, actualValue] of [
        ["missing_evidence", outcome.missingEvidence],
        ["missing_decision", outcome.missingDecision],
        ["missing_coherence", outcome.missingCoherence],
        ["missing_done", outcome.missingDone],
        ["authored_issues", outcome.authoredIssues],
      ] as const) {
        if (step[key] !== undefined) {
          assert.deepEqual(actualValue, step[key], `${where}: ${key}`);
        }
      }
      for (const [key, actualValue] of [
        ["flow_unit", outcome.flowUnit],
        ["source", outcome.source],
        ["checkpoint", outcome.checkpoint],
        ["authored_ready", outcome.authoredReady],
        ["release_intent", outcome.releaseIntent],
        ["release_delivery_story", outcome.releaseDeliveryStory],
        ["release_changed", outcome.releaseChanged],
      ] as const) {
        if (step[key] !== undefined) {
          assert.equal(actualValue, step[key], `${where}: ${key}`);
        }
      }
      if (step.materialized_paths !== undefined) {
        assert.deepEqual(
          outcome.materializedPaths,
          step.materialized_paths,
          `${where}: materialized paths`,
        );
      }
    }
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}
