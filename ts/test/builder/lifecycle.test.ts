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
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";

import { renderArtifactsMaterializedSurface } from "#builder/artifacts/artifactSurfaces.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
  setTo,
} from "#builder/deliveryCursor.ts";
import {
  ExpandBlockedError,
  expandDeliveryStory,
  renderExpandBlocked,
  renderExpandReport,
} from "#builder/expand.ts";
import { pullLifecycleItem, renderPullReport } from "#builder/pull.ts";
import { StoryPackageAmbiguityError } from "#builder/storyPaths.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/builder-lifecycle.golden.json" with { type: "json" };
import { absolutePathsIn, normalizePathRows, scrubMessage } from "#helpers/builderSurfacePaths.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";

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
}

interface Sequence {
  name: string;
  journey: string;
  project_root: string;
  steps: Step[];
}

const sequences = (golden as unknown as { sequences: Sequence[] }).sequences;

/** Harness operations: they seed state, they are not leaves under port. */
const HARNESS_OPS = ["seed_cursor", "seed_receipt", "write_file"] as const;

/** Lifecycle operations TypeScript can execute today. */
const PORTED_OPS: readonly string[] = ["expand", "pull"];

/**
 * Lifecycle operations the corpus grades and TypeScript cannot execute yet.
 *
 * Commit 3 empties this.
 */
const PENDING_OPS = [
  "approve",
  "approve_with_preauthorization",
  "cancel_preauthorization",
  "plan",
  "prepare",
] as const;

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
  // ungraded.
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
  assert.ok(graded.length >= 22, `expected the pull/expand sequences, got ${graded.length}`);
  for (const sequence of graded) {
    replaySequence(sequence);
  }
});

test("the corpus covers the lifecycle shapes plateau 3 has to port", () => {
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
    // The two sides of Expand's title asymmetry: a child slugs its FULL title, the
    // Delivery Story's own title keeps only its `/`-separated tail.
    "expand_slugs_the_full_child_title",
    "expand_fallback_uses_the_delivery_story_title_leaf",
    // Bounded story authority: recorded, consumed once, refused, cancelled.
    "story_authority_recorded_user_story",
    "authority_blocks_incomplete_plan_0",
    "authority_rejects_tampered_fingerprint",
    "navigator_cancels_pending_authority",
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
  // the contract before anyone reads the body.
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
        assert.equal(
          lines.at(-2),
          `<<<END:${marker}>>>`,
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
  // The corpus is only portable because every path it records is project-relative
  // or an explicit token. An absolute path here is byte-stable on one machine and
  // wrong on every other — the failure CI caught for the roadmap golden, and the
  // reason `ts/parity/builder_surface_paths.py` exists. Asserted on the committed
  // artifact so a regenerated corpus cannot reintroduce it quietly.
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
        // it flags legitimate repo-relative chunks, because wrapping can split
        // `…/roadmap/story` so a continuation row begins with `/story`. Detecting
        // the real defect — a row whose BOUNDARY depends on an absolute prefix's
        // length — needs the prefix, which this test does not have.
        //
        // The decisive control for that class is CI: the determinism gate
        // regenerates every golden on Linux runners, where the temp root has a
        // different length, and fails on any diff. That is how the equivalent leak
        // in the roadmap golden was caught, and it is why this plateau must be
        // pushed rather than validated only locally.
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
  readonly project: string;
  readonly journey: string;
  readonly deps: CursorWriteDeps;
  readonly projectionRequests: string[];
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
      // Python's seeds pass these positionally as real values, so they are
      // explicit sets rather than the KEEP sentinel.
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
        return { surfaces: [{ id: "delivery_story_identified", text: renderPullReport(report) }] };
      } catch (error) {
        return { surfaces: [], error: pythonError(error, context.project) };
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
        const absolute = [...report.materializedPaths];
        return {
          surfaces: [
            {
              id: "expand_decision",
              text: normalizePathRows(renderExpandReport(report), absolute),
            },
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
          artifacts: report.materializedArtifacts.map((artifact) => ({
            kind: artifact.kind,
            path: projectRelativePath(artifact.path, context.project),
            status: artifact.status,
          })),
          materializedPaths: report.materializedPaths.map((path) =>
            projectRelativePath(path, context.project),
          ),
        };
      } catch (error) {
        if (error instanceof ExpandBlockedError || error instanceof StoryPackageAmbiguityError) {
          const message = error.message;
          return {
            surfaces: [
              {
                id: "expand_blocked",
                text: normalizePathRows(
                  renderExpandBlocked(before?.activeItem ?? "none", message),
                  absolutePathsIn(message),
                ),
              },
            ],
            error: pythonError(error, context.project),
          };
        }
        return { surfaces: [], error: pythonError(error, context.project) };
      }
    }
    default:
      throw new Error(`unsupported lifecycle op: ${step.op}`);
  }
}

function projectRelativePath(path: string, project: string): string {
  return relative(project, path).split(sep).join("/");
}

/** Python's `f"{type(exc).__name__}: {exc}"`, with paths scrubbed as the generator scrubbed them. */
function pythonError(error: unknown, project: string): string {
  const name =
    error instanceof ExpandBlockedError
      ? "ExpandBlockedError"
      : error instanceof StoryPackageAmbiguityError
        ? "StoryPackageAmbiguityError"
        : "ValueError";
  return scrubMessage(`${name}: ${(error as Error).message}`, project);
}

function replaySequence(sequence: Sequence): void {
  const root = mkdtempSync("/tmp/builder-lifecycle-");
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });
  const db = memoryDatabase(root);
  const projectionRequests: string[] = [];
  const context: ReplayContext = {
    db,
    project,
    journey: sequence.journey,
    deps: {
      nowIso: () => NOW,
      requestProjectionRefresh: (journey) => projectionRequests.push(journey),
    },
    projectionRequests,
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
        case "seed_cursor":
          seedCursor(context, step.input as Record<string, unknown>);
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
      assert.deepEqual(projectionRequests, step.projection_requests, `${where}: projection seam`);
      if (step.artifacts !== undefined) {
        assert.deepEqual(outcome.artifacts, step.artifacts, `${where}: artifacts`);
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
