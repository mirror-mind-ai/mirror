// CV22.DS7.US8 plateau 1 — `inspect-method` and `pull-candidates` as invocations.
//
// Everything before this graded functions. This grades the two leaves the way a
// Navigator runs them: argv in, stdout/stderr/exit code out, against a golden
// captured from the real Python CLI in a SUBPROCESS — so `print()` semantics and
// the stream split are part of the contract rather than an assumption.
//
// The golden's own generation proved that necessary twice over: an in-process
// oracle silently reused the first case's database (`memory.config` resolves
// `DB_PATH` once, at import), and `print(x + "\n")` ends the stream with TWO
// newlines, which no renderer-level golden can see.
//
// `check-implementation` is absent on purpose: it reads the delivery cursor, so it
// lands in plateau 2 rather than being half-ported here.

import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { invokeReadOnlyBuilderArgv } from "#builder/argv.ts";
import { getAriadMethod } from "#builder/ariadMethod.ts";
import { renderTechnicalStoryIndex } from "#builder/artifacts/storyIndex.ts";
import { cardText, cardWrapped } from "#builder/card.ts";
import { surfacesForTrigger } from "#builder/commands.ts";
import { getDeliveryCursor, setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { planDeliveryStoryCheckpoint } from "#builder/deliveryStoryPlan.ts";
import { setAdoptedMethod } from "#builder/methodAdoption.ts";
import { planLifecycleItem } from "#builder/plan.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/builder-command.golden.json" with { type: "json" };
import { authorPlan, authorStoryIndex } from "#helpers/authorScaffold.ts";
import { invokeBuilderArgv } from "#helpers/builderInvoke.ts";
import { normalizePathRows, projectRelative, scrubMessage } from "#helpers/builderSurfacePaths.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";

const PROJECT = fileURLToPath(new URL("../fixtures/builder-command/project", import.meta.url));

interface Case {
  name: string;
  scenario: string;
  argv: string[];
  session_id: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  /** Only the template leaf carries this: every project file and its bytes. */
  project_files?: Record<string, string>;
}

const cases = (golden as unknown as { cases: Case[] }).cases;

/**
 * Leaves that answer from TypeScript today. Plateaus 1 and 2 ported these six.
 */
const PORTED_LEAVES = [
  "adopt",
  "continue-lifecycle",
  "release-intent",
  "set-cadence",
  "approve-delivery-story-plan",
  "cancel-delivery-story-plan-preauthorization",
  "coherence-delivery-story",
  "done-delivery-story",
  "plan-delivery-story",
  "review-delivery-story",
  "set-flow-unit",
  "validate-delivery-story",
  "coherence-item",
  "done-item",
  "review-item",
  "validate-item",
  "approve-plan",
  "cancel-plan-preauthorization",
  "check-implementation",
  "inspect-method",
  "plan-item",
  "prepare-item",
  "prepare-templates",
  "pull-candidates",
  "pull-item",
  "sync-cursor",
] as const;

/**
 * Leaves the CORPUS grades but TypeScript cannot answer yet — empty as of plateau 3.
 *
 * The story's rule is that the golden is generated from Python BEFORE the port
 * exists, so for one commit per plateau the corpus knows more than the code. That
 * gap is declared here rather than hidden by filtering, and
 * `the pending list cannot go stale` fails the moment one of these leaves becomes
 * reachable — so implementing it forces the entry out of this list instead of
 * leaving a case silently ungraded.
 *
 * Plateau 3 emptied it; plateau 5's oracle refills it with the aggregate face of
 * the lifecycle — the six Delivery Story leaves, plus `set-flow-unit` and the DS
 * preauthorization cancel, both re-sequenced into Scope E after the plateau-5
 * panel (the smoke opens with `set-flow-unit`, and seeding the flow unit by a raw
 * cursor write instead would be the unrecorded mutation plateau 3a ruled out).
 */
const PENDING_LEAVES: readonly string[] = [];

/**
 * Cases Python would refuse at the ARGPARSE layer, before any leaf runs.
 *
 * There are none, and that is a decision rather than an omission — see the test
 * below. The predicate stays so a replay loop cannot silently start grading one.
 */
const isArgparseRefusal = (entry: Case): boolean => entry.exit_code === 2;

const isPorted = (entry: Case): boolean =>
  (PORTED_LEAVES as readonly string[]).includes(entry.argv[0] ?? "") && !isArgparseRefusal(entry);
const SESSION_ID = cases[0]?.session_id ?? "builder-command-session";
const NOW = "2026-01-01T00:00:00Z";

const temporaryDirectories: string[] = [];

test.after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function memoryDatabase(): WritableDatabase {
  // `openDatabaseCopyForWrite` refuses a target outside a `tmp/` path — the
  // guard that keeps a write probe off a real database — and on macOS
  // `os.tmpdir()` is `/var/folders/...`, which does not satisfy it. The literal
  // prefix is what the existing append test uses.
  const directory = mkdtempSync("/tmp/builder-command-");
  temporaryDirectories.push(directory);
  const db = openDatabaseCopyForWrite(join(directory, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  return db;
}

/** Recreate the generator's `_seed` for one scenario. */
/** The aggregate package the plateau-5 scenarios work on, mirroring the generator. */
const DS_AGGREGATE_INDEX = `# CV1.DS3 — Aggregate delivery

**Status:** ✅ Done
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS3.US1 | First child | User Story | ✅ Done |
| CV1.DS3.TS1 | Second child | Technical Story | ✅ Done |

## Done Condition

Done when the children deliver a coherent outcome.
`;

const DS_AGGREGATE_CHILDREN = ["CV1.DS3.US1", "CV1.DS3.TS1"] as const;

/** Scenarios added at plateau 3, mirroring the generator's `_seed_lifecycle`. */
const LIFECYCLE_SCENARIOS = new Set([
  "adopted_closure_plan_approved",
  "adopted_closure_validated",
  "adopted_closure_reviewed",
  "adopted_closure_pending_validation",
  "adopted_cursor_empty",
  "adopted_cursor_no_project",
  "adopted_ds_pullable",
  "adopted_pulled",
  "adopted_prepared",
  "adopted_prepared_ds",
  "adopted_plan_pending",
  "adopted_preauthorized",
  // Plateau 5. `adopted_agg_`, never `adopted_ds_`: `adopted_ds_pullable` already
  // exists and means something else.
  "adopted_agg_planned",
  "adopted_agg_pending_approval",
  "adopted_agg_approved",
  "adopted_agg_validated",
  "adopted_agg_reviewed",
  "adopted_agg_children_unfinished",
  "adopted_agg_story_by_story",
  // Plateau 6: a cursor mid-closure carrying a cadence profile, which is what
  // `continue-lifecycle` reads before deciding whether anything is bypassable.
  "adopted_cadence_checkpoint_reviewed",
  "adopted_cadence_checkpoint_pending",
  "adopted_cadence_autonomous_unlimited",
  "adopted_cadence_checkpoint_prepared",
]);

/** The generator's cadence branch of `_seed_lifecycle`. */
function seedCadence(db: WritableDatabase, scenario: string): void {
  const pending = scenario.endsWith("checkpoint_pending");
  setDeliveryCursor(
    db,
    {
      journey: "demo",
      method: "ariad",
      activeItem: "CV1.DS1.US1",
      activeItemTitle: "A user story",
      activeItemLevel: "user_story",
      activeCheckpoint: pending ? "after_validation" : null,
      pendingConfirmation: pending ? "navigator_debt_decision" : null,
      lastDeliveryEvent: scenario.endsWith("checkpoint_prepared") ? "prepare" : "review_complete",
      cadenceProfile: scenario.endsWith("autonomous_unlimited") ? "autonomous" : "checkpoint",
      navigatorFlowUnit: "story_by_story",
    },
    { nowIso: () => NOW },
  );
}

/** The generator's `_write_delivery_story_package`. */
function writeAggregatePackage(project: string, childrenDone: boolean): void {
  const packagePath = join(project, "docs/project/roadmap/cv1-first/cv1-ds3-aggregate");
  mkdirSync(packagePath, { recursive: true });
  writeFileSync(join(packagePath, "index.md"), DS_AGGREGATE_INDEX, "utf8");
  const status = childrenDone ? "✅ Done" : "🟡 Planned";
  for (const [code, title, kind] of [
    ["CV1.DS3.US1", "First child", "User Story"],
    ["CV1.DS3.TS1", "Second child", "Technical Story"],
  ] as const) {
    const child = join(packagePath, `${code.toLowerCase().replaceAll(".", "-")}-child`);
    mkdirSync(child, { recursive: true });
    writeFileSync(
      join(child, "index.md"),
      `# ${code} — ${title}\n\n**Status:** ${status}\n**Type:** ${kind}\n`,
      "utf8",
    );
  }
}

/** The generator's aggregate branch of `_seed_lifecycle`. */
function seedAggregate(db: WritableDatabase, project: string, scenario: string): void {
  writeAggregatePackage(project, scenario !== "adopted_agg_children_unfinished");
  const deps = { nowIso: () => NOW };
  const base = {
    journey: "demo",
    method: "ariad",
    activeItem: "CV1.DS3",
    activeItemTitle: "Aggregate delivery",
    activeItemLevel: "delivery_story",
    navigatorFlowUnit:
      scenario === "adopted_agg_story_by_story" ? "story_by_story" : "delivery_story",
    childWorkItems: [...DS_AGGREGATE_CHILDREN],
  };
  if (scenario === "adopted_agg_pending_approval") {
    // A real pending checkpoint from the real Plan, for the same reason the story
    // authority scenarios run the real `planLifecycleItem`: a hand-built receipt
    // would not survive the consume path.
    setDeliveryCursor(db, { ...base, lastDeliveryEvent: "prepare" }, deps);
    planDeliveryStoryCheckpoint(
      db,
      {
        journey: "demo",
        method: "ariad",
        objective: "Deliver both children as one coherent outcome.",
        childWorkItems: [...DS_AGGREGATE_CHILDREN],
        planArtifactPath: join(project, "docs/project/roadmap/cv1-first/cv1-ds3-aggregate/plan.md"),
        projectRoot: project,
      },
      deps,
    );
    return;
  }
  const statuses: Record<string, string[]> = {
    adopted_agg_planned: [],
    adopted_agg_story_by_story: [],
    adopted_agg_approved: ["plan:approved"],
    adopted_agg_validated: ["plan:approved", "validation:passed"],
    adopted_agg_reviewed: ["plan:approved", "validation:passed", "debt_review:review:no_action"],
    adopted_agg_children_unfinished: [
      "plan:approved",
      "validation:passed",
      "debt_review:review:no_action",
    ],
  };
  setDeliveryCursor(
    db,
    {
      ...base,
      lastDeliveryEvent: "prepare",
      aggregateCheckpointStatus: statuses[scenario] ?? [],
    },
    deps,
  );
}

/** The generator's `PULLABLE_DS_INDEX`, written only for the DS-pull scenario. */
const PULLABLE_DS_INDEX = `# CV1.DS2 — Pullable delivery story

**Status:** 🟡 Planned
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS2.US1 | Port the first slice | User Story | 🟡 Planned |
| CV1.DS2.TS1 | Harden the seam | Technical Story | 🟡 Planned |

## Done Condition

Done when the children deliver a coherent outcome.
`;

/** The generator's `COMPLETE_PLAN`: every required section present and non-empty. */
const COMPLETE_PLAN = `# Plan — CV1.US1

## Objective

Deliver the slice.

## Scope

- Bind one active story structurally.

## Non-Goals

- No sibling scope.

## Acceptance Behavior

Given exact authority
When approval is consumed
Then implementation starts once.

## Validation Route

- Run focused tests and Navigator validation.

## Implementation Contract

- Use TDD and stop at Navigator Validation.
`;

function seed(scenario: string, projectOverride?: string): WritableDatabase {
  const db = memoryDatabase();
  const project = projectOverride ?? PROJECT;
  const insertIdentity = (layer: string, key: string, content: string, metadata?: string) => {
    db.prepare(
      `INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(`${layer}:${key}`, layer, key, content, NOW, NOW, metadata ?? null);
  };

  if (scenario !== "no_journey_identity") {
    // The project path is the `journey` row's METADATA, exactly as
    // `JourneyService.set_project_path` writes it — not a separate
    // `journey_path` row. Writing the wrong row made an earlier version of this
    // test agree with an equally wrong generator.
    // `adopted_cursor_no_project` must reach the Delivery Story project-path
    // refusal, which sits BEHIND the cursor guard, so it needs a cursor and no path.
    const metadata =
      scenario === "adopted_no_project" || scenario === "adopted_cursor_no_project"
        ? null
        : JSON.stringify({ project_path: project });
    insertIdentity(
      "journey",
      "demo",
      "# Demo journey\n\nA journey for the golden.\n",
      metadata ?? undefined,
    );
  }
  if (
    [
      "adopted",
      "adopted_no_project",
      "no_journey_identity",
      "other_mode",
      "mode_without_journey",
      "adopted_with_templates",
      "adopted_with_cursor",
      "adopted_plan_approved",
    ].includes(scenario)
  ) {
    setAdoptedMethod(db, "demo", "ariad", () => NOW);
  }
  if (scenario === "adopted_other_method") {
    setAdoptedMethod(db, "demo", "scrumban", () => NOW);
  }
  if (LIFECYCLE_SCENARIOS.has(scenario)) {
    seedLifecycle(db, project, scenario);
  }
  if (scenario === "adopted_with_cursor") {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.US1",
        lastDeliveryEvent: "pulled",
        cursorGeneration: 4,
      },
      { nowIso: () => NOW },
    );
  }
  if (scenario === "adopted_plan_approved") {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.US1",
        lastDeliveryEvent: "plan_approved",
      },
      { nowIso: () => NOW },
    );
  }

  if (scenario === "other_mode") {
    activateOperatingMode(db, { mode: "Mirror Mode", journey: "demo", sessionId: SESSION_ID }, NOW);
  } else if (scenario === "mode_without_journey") {
    activateOperatingMode(db, { mode: "Builder Mode", journey: null, sessionId: SESSION_ID }, NOW);
  } else if (scenario !== "no_active_mode") {
    activateOperatingMode(
      db,
      { mode: "Builder Mode", journey: "demo", sessionId: SESSION_ID },
      NOW,
    );
  }
  return db;
}

/**
 * A disposable copy of the committed fixture project, so the template leaf writes
 * somewhere throwaway instead of mutating the fixture the golden was generated
 * from — which would make the determinism gate fail for the wrong reason.
 */
/**
 * Mirror of the generator's `_seed_lifecycle`.
 *
 * The two authority scenarios run the REAL `planLifecycleItem` rather than
 * hand-writing checkpoint fields: a hand-built receipt would not carry a
 * fingerprint the consume path accepts, so the scenario would prove the wrong
 * thing.
 */
function seedLifecycle(db: WritableDatabase, project: string, scenario: string): void {
  setAdoptedMethod(db, "demo", "ariad", () => NOW);
  if (scenario.startsWith("adopted_agg_")) {
    seedAggregate(db, project, scenario);
    return;
  }
  if (scenario.startsWith("adopted_cadence_")) {
    seedCadence(db, scenario);
    return;
  }
  const deps = { nowIso: () => NOW };
  if (scenario === "adopted_cursor_empty" || scenario === "adopted_cursor_no_project") {
    setDeliveryCursor(db, { journey: "demo", method: "ariad" }, deps);
    return;
  }
  if (scenario === "adopted_ds_pullable") {
    const target = join(project, "docs/project/roadmap/cv1-first/cv1-ds2-pullable/index.md");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, PULLABLE_DS_INDEX, "utf8");
    setDeliveryCursor(db, { journey: "demo", method: "ariad" }, deps);
    return;
  }
  // The closure leaves start mid-closure. Seeded as raw cursor states, mirroring the
  // generator: the states are the guards' inputs, so reaching them by replaying the
  // verbs would make the seed depend on the behavior under test.
  const closureEvents: Record<string, string> = {
    adopted_closure_plan_approved: "plan_approved",
    adopted_closure_validated: "validation_passed",
    adopted_closure_reviewed: "review_complete",
    adopted_closure_pending_validation: "validate",
  };
  const closureEvent = closureEvents[scenario];
  if (closureEvent !== undefined) {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.US1",
        activeItemTitle: "A user story",
        activeItemLevel: "user_story",
        activeCheckpoint: closureEvent === "validate" ? "after_validation" : null,
        pendingConfirmation: closureEvent === "validate" ? "navigator_validation" : null,
        lastDeliveryEvent: closureEvent,
        navigatorFlowUnit: "story_by_story",
      },
      deps,
    );
    return;
  }
  if (scenario === "adopted_pulled") {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.US1",
        activeItemTitle: "A user story",
        activeItemLevel: "user_story",
        lastDeliveryEvent: "pull",
      },
      deps,
    );
    return;
  }
  if (scenario === "adopted_prepared" || scenario === "adopted_prepared_ds") {
    const deliveryStory = scenario === "adopted_prepared_ds";
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: deliveryStory ? "CV1.DS1" : "CV1.DS1.US1",
        activeItemTitle: deliveryStory ? "A delivery story" : "A user story",
        activeItemLevel: deliveryStory ? "delivery_story" : "user_story",
        lastDeliveryEvent: "prepare",
        navigatorFlowUnit: "story_by_story",
      },
      deps,
    );
    return;
  }
  setDeliveryCursor(
    db,
    {
      journey: "demo",
      method: "ariad",
      activeItem: "CV1.DS1.US1",
      activeItemTitle: "A user story",
      activeItemLevel: "user_story",
      lastDeliveryEvent: "prepare",
      navigatorFlowUnit: "story_by_story",
    },
    deps,
  );
  const packagePath = join(
    project,
    "docs/project/roadmap/cv1-first/cv1-ds1-delivery/cv1-ds1-us1-story",
  );
  mkdirSync(packagePath, { recursive: true });
  const planPath = join(packagePath, "plan.md");
  writeFileSync(planPath, COMPLETE_PLAN, "utf8");
  planLifecycleItem(
    db,
    {
      journey: "demo",
      method: getAriadMethod(),
      planArtifactPath: planPath,
      projectRoot: project,
      preauthorize: scenario === "adopted_preauthorized",
    },
    deps,
  );
}

function scratchProject(seedAuthored: boolean): string {
  const directory = mkdtempSync("/tmp/builder-command-project-");
  temporaryDirectories.push(directory);
  cpSync(PROJECT, directory, { recursive: true });
  if (seedAuthored) {
    for (const relativePath of [
      "docs/project/roadmap/ariad-adoption.md",
      "docs/project/roadmap/templates/plan.md",
    ]) {
      const target = join(directory, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, "# Authored by a human, must survive\n", "utf8");
    }
  }
  return directory;
}

/**
 * The generator's `_project_snapshot`, shared by the template and lifecycle write
 * tests. `.mirror/projections` never appears here because the TypeScript seam is a
 * callback rather than the publisher — the generator excludes that tree for the
 * same reason, since its receipts are named `op-<uuid4>`.
 */
function projectSnapshot(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      snapshot[relative(root, full).split(sep).join("/")] = readFileSync(full, "utf8");
    }
  };
  walk(root);
  return Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * Parse the golden's argv the way the front door will.
 *
 * Shared with the plateau-4 lifecycle smoke (`#helpers/builderInvoke.ts`) so both
 * replays enter the leaves through one mapping. The clock is pinned here and real
 * there; the projection seam is absent here, because this corpus must not spawn.
 */
function invoke(db: WritableDatabase, argv: readonly string[]) {
  return invokeBuilderArgv(db, argv, { nowIso: () => NOW });
}

test("the golden covers every graded leaf and its refusals", () => {
  assert.ok(cases.length >= 38, `expected the full case matrix, got ${cases.length}`);
  const commands = new Set(cases.map((entry) => entry.argv[0]));
  assert.deepEqual(
    [...commands].sort(),
    [...PORTED_LEAVES, ...PENDING_LEAVES].sort(),
    "every leaf in the corpus is declared either ported or pending",
  );
  assert.equal(
    PORTED_LEAVES.filter((leaf) => (PENDING_LEAVES as readonly string[]).includes(leaf)).length,
    0,
    "a leaf cannot be both ported and pending",
  );
  assert.ok(cases.filter((entry) => entry.exit_code === 1).length >= 15);
});

test("the pending list cannot go stale", () => {
  // Implementing a pending leaf must fail this test, which is what forces the
  // entry out of PENDING_LEAVES and its cases into the graded loop above. Without
  // this, a ported leaf could keep sitting in the pending list and never be
  // compared against Python at all.
  for (const leaf of PENDING_LEAVES) {
    const entry = cases.find((candidate) => candidate.argv[0] === leaf);
    assert.ok(entry, `${leaf} is declared pending but the corpus has no case for it`);
    const db = seed("adopted");
    try {
      assert.throws(
        () => invoke(db, entry.argv),
        /unsupported argv/,
        `${leaf} is reachable now — move it from PENDING_LEAVES to PORTED_LEAVES`,
      );
    } finally {
      db.close();
    }
  }
});

test("every case matches Python's stdout, stderr, and exit code", () => {
  for (const entry of cases) {
    if (!isPorted(entry)) continue;
    // The template leaf writes FILES, so it gets its own test against a scratch
    // copy. Running it here pointed the journey at the committed fixture and
    // created nine files inside it — caught by `git status`, and the reason the
    // scratch copy is mandatory rather than tidy.
    if (entry.project_files !== undefined) continue;
    // A lifecycle scenario may WRITE while seeding (the authority scenarios run the
    // real Plan), so it never points at the committed fixture — the plateau-2 lesson.
    const db = LIFECYCLE_SCENARIOS.has(entry.scenario)
      ? seed(entry.scenario, scratchProject(false))
      : seed(entry.scenario);
    try {
      const actual = invoke(db, entry.argv);
      assert.equal(actual.stdout, entry.stdout, `${entry.name} stdout`);
      assert.equal(actual.stderr, entry.stderr, `${entry.name} stderr`);
      assert.equal(actual.exitCode, entry.exit_code, `${entry.name} exit code`);
    } finally {
      db.close();
    }
  }
});

test("prepare-templates writes Python's files and preserves authored ones", () => {
  // The files ARE the behavior here: this is the only plateau-2 leaf that writes
  // into the user's repository, and the failure that matters is overwriting a
  // `plan.md` somebody wrote. The golden carries every project file and its bytes.
  // Filtered by LEAF, not by `project_files`: plateau 3 added file-writing cases
  // for `pull-item` and `plan-item`, and selecting on the snapshot alone would
  // have dragged those unported leaves into this test.
  const templateCases = cases.filter((entry) => entry.argv[0] === "prepare-templates");
  assert.ok(templateCases.length >= 2, "the created and preserved cases must both be graded");
  for (const entry of templateCases) {
    const db = seed(entry.scenario);
    const project = scratchProject(entry.scenario === "adopted_with_templates");
    try {
      // Point the journey row at the scratch copy rather than the fixture.
      if (entry.scenario !== "adopted_no_project") {
        db.prepare("UPDATE identity SET metadata = ? WHERE layer = 'journey' AND key = 'demo'").run(
          JSON.stringify({ project_path: project }),
        );
      }
      const actual = invoke(db, entry.argv);
      assert.equal(actual.stdout, entry.stdout, `${entry.name} stdout`);
      assert.equal(actual.exitCode, entry.exit_code, `${entry.name} exit code`);
      if (entry.exit_code === 0) {
        assert.deepEqual(projectSnapshot(project), entry.project_files, `${entry.name} files`);
      }
    } finally {
      db.close();
    }
  }
});

test("an authored template survives, byte for byte", () => {
  const entry = cases.find((candidate) => candidate.name === "prepare_templates_preserves");
  assert.ok(entry?.project_files);
  assert.equal(
    entry.project_files["docs/project/roadmap/ariad-adoption.md"],
    "# Authored by a human, must survive\n",
    "prepare-templates must never overwrite an existing file",
  );
  assert.equal(
    entry.project_files["docs/project/roadmap/templates/plan.md"],
    "# Authored by a human, must survive\n",
  );
  // And the report says so, rather than silently reporting nine creations.
  assert.match(entry.stdout, /preserved\ndocs\/project\/roadmap\/ariad-adoption\.md/u);
});

test("the corpus records no argparse refusal, because its text is CPython's", () => {
  // Plateau 5 briefly recorded `--decision maybe`, which argparse refuses with a
  // usage block and exit 2 before `review-delivery-story` ever runs. CI killed it:
  // 3.10 prints `choose from 'no_action', 'defer', 'pay_now'` and 3.12 prints the
  // same list UNQUOTED, so the golden pinned a CPython release rather than Mirror
  // behavior — green on one supported version, red on the other.
  //
  // The choice constraint is real and belongs to plateau 8's refusal matrix, which
  // asserts STRUCTURE (exit 2, a usage block, the offending option) rather than
  // bytes. Until then the mapping must not imitate exit 2, or the two layers merge
  // in the one place where an interpreter's prose is the observable behavior.
  assert.deepEqual(
    cases.filter(isArgparseRefusal).map((entry) => entry.name),
    [],
    "argparse text is version-dependent and cannot be a byte-graded oracle",
  );
  // The LEAF's own guard is Mirror's and is graded normally.
  const db = seed("adopted_agg_validated", scratchProject(false));
  try {
    const actual = invoke(db, [
      "review-delivery-story",
      "--method",
      "ariad",
      "--journey",
      "demo",
      "--decision",
      "maybe",
      "--summary",
      "Unknown.",
    ]);
    assert.equal(actual.exitCode, 1, "the leaf refuses an unknown decision itself");
    assert.match(actual.stderr, /must be no_action, defer, or pay_now/u);
  } finally {
    db.close();
  }
});

test("a blocked guard prints its surface on stdout and still exits 1", () => {
  // The only leaf whose refusal is a SURFACE, not a stderr message. Routing it
  // through the ordinary refusal helper would lose a block the transport protocol
  // requires to be rendered verbatim.
  for (const name of ["check_implementation_no_cursor", "check_implementation_blocked"]) {
    const entry = cases.find((candidate) => candidate.name === name);
    assert.ok(entry, name);
    assert.equal(entry.exit_code, 1, name);
    assert.equal(entry.stderr, "", name);
    assert.match(entry.stdout, /^<<<ARIAD:IMPLEMENTATION_GUARD>>>/u, name);
    assert.ok(entry.stdout.includes(cardText("blocked")), name);
  }
  const allowed = cases.find((entry) => entry.name === "check_implementation_allowed");
  assert.equal(allowed?.exit_code, 0);
  assert.match(allowed?.stdout ?? "", /^<<<ARIAD:IMPLEMENTATION_GUARD>>>/u);
});

test("adopt distinguishes a first adoption from a repeat, but not from a switch", () => {
  const first = cases.find((entry) => entry.name === "adopt_first_time");
  const again = cases.find((entry) => entry.name === "adopt_again");
  const over = cases.find((entry) => entry.name === "adopt_over_other_method");
  assert.match(first?.stdout ?? "", /Ariad is now adopted for this journey\./u);
  assert.match(again?.stdout ?? "", /Ariad was already adopted for this journey\./u);
  // Switching from scrumban reads "is now", because the comparison is against
  // the method being adopted, not against whether anything was adopted.
  assert.match(over?.stdout ?? "", /Ariad is now adopted for this journey\./u);
});

test("adopt has no adoption guard, because it is the command that adopts", () => {
  // Every other write leaf refuses an unadopted journey; this one must not.
  const entry = cases.find((candidate) => candidate.name === "adopt_first_time");
  assert.equal(entry?.exit_code, 0);
  assert.equal(entry?.stderr, "");
});

test("sync-cursor writes a fixed cursor and carries the generation forward", () => {
  const over = cases.find((entry) => entry.name === "sync_cursor_over_existing");
  assert.ok(over);
  // The active item is RESET (the command passes none) while the generation
  // survives, which is the cursor's carry-forward rule rather than a decision
  // this command makes.
  assert.match(over.stdout, /active item\nnone/u);
  assert.match(over.stdout, /last delivery event\ntemplate_preparation/u);
  assert.match(over.stdout, /cadence profile\nstepwise/u);
});

test("pull-candidates stdout ends with two newlines, because print adds one", () => {
  const entry = cases.find((candidate) => candidate.name === "pull_candidates_explicit_journey");
  assert.ok(entry);
  assert.ok(entry.stdout.endsWith("\n\n"), "the oracle itself must carry the blank line");
  const db = seed(entry.scenario);
  try {
    assert.ok(invoke(db, entry.argv).stdout.endsWith("\n\n"));
  } finally {
    db.close();
  }
});

test("the guards refuse in Python's order: method, journey, existence, adoption", () => {
  // An unknown method with no resolvable journey must report the METHOD error;
  // resolving the journey first would report the journey one.
  const unknownFirst = cases.find(
    (entry) => entry.name === "pull_candidates_unknown_method_no_journey",
  );
  const journeyNext = cases.find((entry) => entry.name === "pull_candidates_no_journey");
  const adoptionLast = cases.find((entry) => entry.name === "pull_candidates_not_adopted");
  assert.ok(unknownFirst && journeyNext && adoptionLast);
  assert.match(unknownFirst.stderr, /Builder method 'bogus' not found/u);
  assert.match(journeyNext.stderr, /requires a journey/u);
  assert.match(adoptionLast.stderr, /has not adopted Ariad yet/u);
});

test("only an active Builder Mode journey resolves", () => {
  // A journey attached to Mirror Mode must not satisfy Builder's resolution, and
  // Builder Mode with no journey must not either.
  for (const name of ["pull_candidates_other_mode"]) {
    const entry = cases.find((candidate) => candidate.name === name);
    assert.ok(entry);
    assert.equal(entry.exit_code, 1);
    assert.match(entry.stderr, /requires a journey/u);
  }
  for (const name of ["inspect_method_other_mode", "inspect_method_mode_without_journey"]) {
    const entry = cases.find((candidate) => candidate.name === name);
    assert.ok(entry);
    assert.equal(entry.exit_code, 0);
    assert.match(entry.stdout, /No Builder journey was named\./u);
  }
});

test("--journey wins over the positional method in inspect-method", () => {
  // Python's first branch returns on `--journey` without consulting the method,
  // so `inspect-method ariad --journey demo` renders the JOURNEY card.
  const entry = cases.find(
    (candidate) => candidate.name === "inspect_method_both_method_and_journey",
  );
  assert.ok(entry);
  assert.ok(!entry.stdout.includes("Builder Method Available"));
  assert.ok(entry.stdout.startsWith("■ Builder Method\n"));
});

test("a journey whose adopted method differs still renders as adopted", () => {
  // `inspect-method --journey` reports whatever is adopted, with no ariad check;
  // only `pull-candidates` requires the method to match.
  const inspect = cases.find((entry) => entry.name === "inspect_method_journey_other_method");
  const pull = cases.find((entry) => entry.name === "pull_candidates_adopted_other_method");
  assert.ok(inspect && pull);
  assert.equal(inspect.exit_code, 0);
  assert.match(inspect.stdout, /scrumban is adopted for this journey\./u);
  assert.equal(pull.exit_code, 1);
});

test("an adopted journey with no project path still renders both surfaces", () => {
  const entry = cases.find((candidate) => candidate.name === "pull_candidates_no_project_path");
  assert.ok(entry);
  assert.equal(entry.exit_code, 0);
  assert.equal((entry.stdout.match(/<<<ARIAD:/gu) ?? []).length, 2);
  // With no project path there is no roadmap to read, so the snapshot reports no
  // source. With no cursor there is no scope either: the snapshot states that no
  // item was pulled, at card width. CR002 replaced Python's ragged 57-code-point
  // `none` row with it.
  assert.match(entry.stdout, /source\nnone/u);
  const fieldRow = entry.stdout.split("\n").find((line) => line.includes("roadmap field")) ?? "";
  assert.ok(fieldRow.endsWith(" no item pulled yet \u2502"), fieldRow);
  assert.equal([...fieldRow].length - 2, 56, "the unscoped row is card width");
  assert.ok(!entry.stdout.includes("│ roadmap field                                      none │"));
});

test("which surfaces appear is decided by the DSL surface route", () => {
  // `_surfaces_for_trigger(method, "show_roadmap")`, not a hardcoded pair in the
  // command. Removing one from `ariadMethod.ts` would drop that block.
  assert.deepEqual(
    [...surfacesForTrigger("show_roadmap")],
    ["roadmap_snapshot", "pull_candidates"],
  );
  assert.deepEqual([...surfacesForTrigger("no_such_trigger")], []);
});

test("the file-writing lifecycle leaves match Python's streams and its files", () => {
  // `pull-item` and `plan-item` write into the user's repository, so they get the
  // same treatment `prepare-templates` gets: a scratch copy of the fixture, and the
  // FILES compared as part of the behavior. Running them in the generic loop would
  // point the journey at the committed fixture — caught by `git status` at plateau 2,
  // and the reason the scratch copy is mandatory rather than tidy.
  // Filtered by PORTEDNESS as well as by snapshot: plateau 5's aggregate leaves
  // write files too, and they are declared pending for the commit that lands their
  // oracle. Selecting on the snapshot alone made this test the one place a pending
  // leaf was still replayed.
  const cases_ = cases.filter(
    (entry) =>
      entry.project_files !== undefined && entry.argv[0] !== "prepare-templates" && isPorted(entry),
  );
  assert.ok(cases_.length >= 14, `expected the lifecycle write cases, got ${cases_.length}`);
  for (const entry of cases_) {
    const project = scratchProject(false);
    const db = seed(entry.scenario, project);
    try {
      const actual = invoke(db, entry.argv);
      assert.equal(
        normalizeCommandPaths(actual.stdout, project),
        entry.stdout,
        `${entry.name} stdout`,
      );
      assert.equal(
        scrubMessage(actual.stderr, project),
        withoutSeamWarnings(entry.stderr, entry.name),
        `${entry.name} stderr`,
      );
      assert.equal(actual.exitCode, entry.exit_code, `${entry.name} exit code`);
      assert.deepEqual(
        projectSnapshot(project),
        entry.project_files,
        `${entry.name} project files`,
      );
    } finally {
      db.close();
    }
  }
});

/**
 * Drop the Journey projection seam's own warnings from Python's recorded stderr.
 *
 * Every Builder cursor write requests a projection refresh, and in the oracle that
 * request reaches Python's publisher, which warns when it cannot publish. TypeScript
 * never publishes: US7 decided the publisher stays Python-owned until TS5 retires the
 * `fcntl.flock` dual-writer window, so the TS modules only REQUEST a refresh — the
 * same boundary `explorer/story.ts` documents. The request itself is graded exactly,
 * per step, in `lifecycle.test.ts`'s `projection_requests`.
 *
 * The filter is bounded on purpose: only this one known line is dropped, and any
 * OTHER stderr content in a Python case fails rather than being smoothed away.
 */
function withoutSeamWarnings(stderr: string, caseName: string): string {
  const lines = stderr.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (line.startsWith("Operational projection refresh failed")) continue;
    kept.push(line);
  }
  const dropped = lines.length - kept.length;
  if (dropped > 0) {
    assert.ok(
      stderr.includes("code=unknown_journey"),
      `${caseName}: an unrecognized seam warning was dropped instead of graded`,
    );
  }
  return kept.join("\n");
}

/**
 * The generator's `_normalize_paths`, for stdout.
 *
 * Wrapped card rows carrying an absolute path collapse to one token; the unwrapped
 * `*_path=` trailer lines are rewritten project-relative. `builder_surface_paths.py`
 * owns the rule and explains why the two halves need different treatment.
 */
function normalizeCommandPaths(stdout: string, project: string): string {
  const absolute = [project, ...walkPaths(project)].sort((a, b) => b.length - a.length);
  let normalized = normalizePathRows(stdout, absolute);
  for (const path of absolute) {
    normalized = normalized.replaceAll(path, projectRelative(path, project));
  }
  return normalized;
}

function walkPaths(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      found.push(absolute);
      if (entry.isDirectory()) walk(absolute);
    }
  };
  walk(root);
  return found;
}

// ---------------------------------------------------------------------------
// CR008: a lifecycle command binds only to the journey it was given.
//
// Before CR008, a command without --journey took "the session" to be the most
// recently updated active runtime_sessions row in the whole database. That row
// could belong to any window, and a delivery-cursor row counted too. The
// command then used that row's mode, or else the global mode row. Agent shells
// carry no MIRROR_SESSION_ID, so every such command guessed, and the guess
// wrote another journey's cursor and materialized files into another project.
//
// These tests plant exactly those decoys: another adopted journey with its own
// project and cursor, a window touched after this one and in Builder Mode for
// it, and a global mode row naming it. Every leaf must refuse rather than
// follow them. A journey comes from --journey or from a session the caller
// named, never from a guess.
// ---------------------------------------------------------------------------

const DECOY = "decoy";
const DECOY_WINDOW = "decoy-window-session";
const CLOSED_SESSION = "closed-builder-session";
const MIRROR_WINDOW = "mirror-mode-session";
const LATER = "2026-06-01T00:00:00Z";
const NO_BINDING_SOURCE =
  /^Error: Builder method .+ requires a journey\. Pass --journey <slug>, or name a session in Builder Mode with --session-id or MIRROR_SESSION_ID\.\n$/u;

/** Another adopted journey, with its own project and cursor, for a guess to land on. */
function addDecoyJourney(db: WritableDatabase): void {
  db.prepare(
    `INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata)
     VALUES (?, 'journey', ?, ?, ?, ?, ?)`,
  ).run(
    `journey:${DECOY}`,
    DECOY,
    "# Decoy journey\n",
    NOW,
    NOW,
    JSON.stringify({ project_path: scratchProject(false) }),
  );
  setAdoptedMethod(db, DECOY, "ariad", () => NOW);
  setDeliveryCursor(
    db,
    { journey: DECOY, method: "ariad", activeItem: "CV1.US1", lastDeliveryEvent: "pulled" },
    { nowIso: () => NOW },
  );
}

/** Another window: a real runtime session, touched last, in Builder Mode for the decoy. */
function addDecoyWindow(db: WritableDatabase): void {
  upsertRuntimeSession(db, DECOY_WINDOW, { interface: "pi", active: true }, LATER);
  activateOperatingMode(
    db,
    { mode: "Builder Mode", journey: DECOY, sessionId: DECOY_WINDOW },
    LATER,
  );
}

/** The global mode row, which a `build load` that knows no session writes. */
function addDecoyGlobalMode(db: WritableDatabase): void {
  activateOperatingMode(db, { mode: "Builder Mode", journey: DECOY }, LATER);
}

/** A session that WAS in Builder Mode for demo and has since ended. */
function addClosedBuilderSession(db: WritableDatabase): void {
  activateOperatingMode(
    db,
    { mode: "Builder Mode", journey: "demo", sessionId: CLOSED_SESSION },
    NOW,
  );
  upsertRuntimeSession(db, CLOSED_SESSION, { active: false, closedAt: NOW }, NOW);
}

/** A live session carrying the demo journey in a mode that is not Builder's. */
function addMirrorModeSession(db: WritableDatabase): void {
  activateOperatingMode(
    db,
    { mode: "Mirror Mode", journey: "demo", sessionId: MIRROR_WINDOW },
    NOW,
  );
}

function withoutOptions(argv: readonly string[], names: readonly string[]): string[] {
  const kept: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (names.includes(argv[index] ?? "")) {
      index += 1;
      continue;
    }
    kept.push(argv[index] ?? "");
  }
  return kept;
}

function optionOf(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

/** Every row of every table, so "wrote nothing" means nothing. */
function databaseSnapshot(db: WritableDatabase): string {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => String(row.name));
  return JSON.stringify(
    Object.fromEntries(
      tables.map((table) => [table, db.prepare(`SELECT * FROM "${table}"`).all()]),
    ),
  );
}

/** The rows that belong to the decoy, which a correct binding never touches. */
function decoyRows(db: WritableDatabase): string {
  const snapshot = JSON.parse(databaseSnapshot(db)) as Record<string, unknown[]>;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(snapshot).map(([table, rows]) => [
        table,
        rows.filter((row) => JSON.stringify(row).includes(DECOY)),
      ]),
    ),
  );
}

const UNNAMED_VARIANTS: ReadonlyArray<{
  name: string;
  plant: (db: WritableDatabase) => void;
  environmentSessionId: string | null;
}> = [
  { name: "a window touched more recently", plant: addDecoyWindow, environmentSessionId: null },
  { name: "the global mode row", plant: addDecoyGlobalMode, environmentSessionId: null },
  {
    name: "MIRROR_SESSION_ID naming no session",
    plant: addDecoyGlobalMode,
    environmentSessionId: "no-such-session",
  },
  {
    name: "MIRROR_SESSION_ID naming a closed Builder session",
    plant: addClosedBuilderSession,
    environmentSessionId: CLOSED_SESSION,
  },
  {
    name: "MIRROR_SESSION_ID naming a session in another mode",
    plant: (db) => {
      addMirrorModeSession(db);
      addDecoyGlobalMode(db);
    },
    environmentSessionId: MIRROR_WINDOW,
  },
];

test("CR008: without --journey or a named Builder session, every leaf refuses and writes nothing", () => {
  const journeyCases = cases.filter(
    (entry) =>
      isPorted(entry) && entry.argv[0] !== "inspect-method" && entry.argv.includes("--journey"),
  );
  assert.deepEqual(
    [...new Set(journeyCases.map((entry) => entry.argv[0]))].sort(),
    PORTED_LEAVES.filter((leaf) => leaf !== "inspect-method").sort(),
    "every leaf that resolves a journey is exercised",
  );
  for (const variant of UNNAMED_VARIANTS) {
    for (const entry of journeyCases) {
      const label = `${entry.name} with ${variant.name}`;
      // Scratch projects for both journeys: before the fix, a guess binds the
      // decoy and a writing leaf would write into whatever project it names.
      const db = seed(entry.scenario, scratchProject(false));
      try {
        addDecoyJourney(db);
        variant.plant(db);
        const before = databaseSnapshot(db);
        const actual = invokeBuilderArgv(
          db,
          withoutOptions(entry.argv, ["--journey", "--session-id"]),
          { nowIso: () => NOW, environmentSessionId: variant.environmentSessionId },
        );
        assert.equal(actual.exitCode, 1, `${label} exit code`);
        assert.equal(actual.stdout, "", `${label} stdout`);
        if (entry.exit_code === 0 || actual.stderr !== entry.stderr) {
          // A leaf that validates its own input BEFORE the journey guard keeps
          // that refusal; anything else must be the binding refusal.
          assert.match(actual.stderr, NO_BINDING_SOURCE, `${label} stderr`);
        }
        assert.equal(databaseSnapshot(db), before, `${label} wrote nothing`);
      } finally {
        db.close();
      }
    }
  }
});

test("CR008: a named Builder session binds its own journey, and nothing reaches the decoy", () => {
  // inspect-method is graded by its own test below: stripping --journey from
  // `inspect-method ariad --journey demo` leaves a positional method, which
  // rightly renders the method definition instead.
  const demoCases = cases.filter(
    (entry) =>
      isPorted(entry) &&
      entry.argv[0] !== "inspect-method" &&
      entry.project_files === undefined &&
      optionOf(entry.argv, "--journey") === "demo" &&
      !["no_active_mode", "other_mode", "mode_without_journey"].includes(entry.scenario),
  );
  assert.ok(demoCases.length >= 40, `expected the demo matrix, got ${demoCases.length}`);
  for (const route of ["--session-id", "MIRROR_SESSION_ID"] as const) {
    for (const entry of demoCases) {
      const label = `${entry.name} via ${route}`;
      // Seeded exactly as the replay seeds it, so the recorded bytes still apply.
      const db = LIFECYCLE_SCENARIOS.has(entry.scenario)
        ? seed(entry.scenario, scratchProject(false))
        : seed(entry.scenario);
      try {
        addDecoyJourney(db);
        addDecoyWindow(db);
        addDecoyGlobalMode(db);
        const decoyBefore = decoyRows(db);
        const stripped = withoutOptions(entry.argv, ["--journey", "--session-id"]);
        const actual = invokeBuilderArgv(
          db,
          route === "--session-id" ? [...stripped, "--session-id", SESSION_ID] : stripped,
          {
            nowIso: () => NOW,
            environmentSessionId: route === "MIRROR_SESSION_ID" ? SESSION_ID : null,
          },
        );
        assert.equal(actual.stdout, entry.stdout, `${label} stdout`);
        assert.equal(actual.stderr, entry.stderr, `${label} stderr`);
        assert.equal(actual.exitCode, entry.exit_code, `${label} exit code`);
        assert.equal(decoyRows(db), decoyBefore, `${label} left the decoy alone`);
      } finally {
        db.close();
      }
    }
  }
});

test("CR008: inspect-method with no argument names no journey it was not given", () => {
  const card = cases.find((entry) => entry.name === "inspect_method_no_active_mode");
  const bound = cases.find((entry) => entry.name === "inspect_method_active_builder_journey");
  assert.ok(card && bound);
  const db = seed("adopted");
  try {
    addDecoyJourney(db);
    addDecoyWindow(db);
    addDecoyGlobalMode(db);
    const unnamed = invoke(db, ["inspect-method"]);
    assert.equal(unnamed.exitCode, 0);
    assert.equal(unnamed.stdout, card.stdout, "no named session: the no-journey card");
    const named = invoke(db, ["inspect-method", "--session-id", SESSION_ID]);
    assert.equal(named.stdout, bound.stdout, "a named Builder session: that journey's state");
  } finally {
    db.close();
  }
});

// ---------------------------------------------------------------------------
// CR079: no Ariad command replaces content it did not write, graded at the CLI.
//
// Every corpus case that writes a closure record is run again with that record
// already authored. The file must come through byte for byte, the command must
// answer as the corpus recorded it apart from saying so, and the surface must say
// so. The Plan commands get the same test for their whole package: CR004, which
// the oracle-recorded sequence `plan_preserves_authored_plan` already proves
// through the lifecycle, graded here directly.
// ---------------------------------------------------------------------------

const AUTHORED = "# Written by the Driver\n\nEvidence Ariad did not write and must not replace.\n";
const isClosureRecord = (path: string): boolean =>
  /(^|\/)(validation|review|coherence|done)\.md$/u.test(path) && !path.includes("/templates/");

test("CR079: an authored closure record survives its command, and the surface says preserved", () => {
  const recordCases = cases.filter(
    (entry) =>
      isPorted(entry) &&
      entry.exit_code === 0 &&
      Object.keys(entry.project_files ?? {}).some(isClosureRecord),
  );
  assert.ok(recordCases.length >= 12, `expected the closure matrix, got ${recordCases.length}`);
  for (const entry of recordCases) {
    const project = scratchProject(false);
    const db = seed(entry.scenario, project);
    try {
      db.prepare("UPDATE identity SET metadata = ? WHERE layer = 'journey' AND key = 'demo'").run(
        JSON.stringify({ project_path: project }),
      );
      const records = Object.keys(entry.project_files ?? {}).filter(isClosureRecord);
      for (const record of records) {
        mkdirSync(dirname(join(project, record)), { recursive: true });
        writeFileSync(join(project, record), AUTHORED, "utf8");
      }
      const actual = invoke(db, entry.argv);
      assert.equal(actual.exitCode, entry.exit_code, `${entry.name} exit code`);
      for (const record of records) {
        assert.equal(
          readFileSync(join(project, record), "utf8"),
          AUTHORED,
          `${entry.name}: ${record}`,
        );
      }
      // Card borders and wrapping removed: the sentence may span card lines.
      const flat = actual.stdout.replaceAll("│", " ").replace(/\s+/gu, " ");
      assert.match(
        flat,
        /preserved as it is: Ariad did not write/u,
        `${entry.name}: the surface says the record was preserved; it printed:\n` +
          actual.stdout
            .split("\n")
            .filter((line) => /artifact|preserved|materialized/iu.test(line))
            .join("\n"),
      );
      if (actual.stdout.includes("<<<ARIAD:ARTIFACTS_MATERIALIZED>>>")) {
        assert.match(
          actual.stdout,
          /\u2502 \u2298 preserved /u,
          `${entry.name}: its own mark, not \u2022`,
        );
      }
    } finally {
      db.close();
    }
  }
});

test("CR079/CR004: an authored Plan package survives plan-item and plan-delivery-story, byte for byte", () => {
  const planCases = cases.filter(
    (entry) =>
      isPorted(entry) &&
      entry.exit_code === 0 &&
      ["plan-item", "plan-delivery-story"].includes(entry.argv[0] ?? "") &&
      Object.keys(entry.project_files ?? {}).some((path) => path.endsWith("/plan.md")),
  );
  assert.deepEqual(
    [...new Set(planCases.map((entry) => entry.argv[0]))].sort(),
    ["plan-delivery-story", "plan-item"],
    "both Plan commands are graded",
  );
  for (const entry of planCases) {
    const project = scratchProject(false);
    const db = seed(entry.scenario, project);
    try {
      db.prepare("UPDATE identity SET metadata = ? WHERE layer = 'journey' AND key = 'demo'").run(
        JSON.stringify({ project_path: project }),
      );
      const plan = Object.keys(entry.project_files ?? {}).find((path) => path.endsWith("/plan.md"));
      assert.ok(plan);
      const pkg = dirname(plan);
      const authored = ["index.md", "plan.md", "test-guide.md"].map((file) =>
        join(project, pkg, file),
      );
      for (const path of authored) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, AUTHORED, "utf8");
      }
      invoke(db, entry.argv);
      for (const path of authored) {
        assert.equal(
          readFileSync(path, "utf8"),
          AUTHORED,
          `${entry.name}: ${relative(project, path)}`,
        );
      }
    } finally {
      db.close();
    }
  }
});

/** The ids of the marked Ariad surfaces in one command's stdout, in emission order. */
function surfaceIds(stdout: string): string[] {
  return [...stdout.matchAll(/<<<ARIAD:([A-Z_]+)>>>/gu)].map((match) => match[1] ?? "");
}

test("CR001: the Delivery Story scope question is asked before any Plan exists, and the Plan never re-asks it", () => {
  // The Builder skill makes the scope confirmation a Navigator stop: the agent ends
  // its turn at the surface and plans only on a later turn. That stop is honest only
  // while choosing the flow unit writes no Plan artifact and the Plan command does
  // not print the scope question again (the AF-004 shape).
  const project = scratchProject(false);
  const db = seed("adopted_prepared_ds", project);
  try {
    const before = projectSnapshot(project);
    const flow = invoke(db, [
      "set-flow-unit",
      "--method",
      "ariad",
      "--journey",
      "demo",
      "--unit",
      "delivery_story",
    ]);
    assert.equal(flow.exitCode, 0, flow.stderr);
    assert.deepEqual(surfaceIds(flow.stdout), ["DELIVERY_STORY_SCOPE_CONFIRMATION"]);
    assert.match(flow.stdout, /Before I create the DS Plan/u);
    assert.deepEqual(projectSnapshot(project), before, "choosing the flow unit writes no file");

    const plan = invoke(db, [
      "plan-delivery-story",
      "--method",
      "ariad",
      "--journey",
      "demo",
      "--objective",
      "Deliver the delivery story as one outcome.",
      "--child",
      "CV1.DS1.US1",
    ]);
    assert.equal(plan.exitCode, 0, plan.stderr);
    assert.deepEqual(surfaceIds(plan.stdout), [
      "DELIVERY_STORY_PLAN_CHECKPOINT",
      "ARTIFACTS_MATERIALIZED",
    ]);
    assert.doesNotMatch(plan.stdout, /Before I create the DS Plan|Is this the right scope/u);
    const written = Object.keys(projectSnapshot(project)).filter((path) => !(path in before));
    assert.ok(
      written.some((path) => path.endsWith("/plan.md")),
      `the Plan command is the one that writes plan.md; new files: ${written.join(", ")}`,
    );
  } finally {
    db.close();
  }
});

/**
 * CR019's tree: CV1 holds DS1 (three Technical Stories), DS10 (which DS1 prefixes),
 * and DS2 (one User Story); CV2 sits outside. `guide` adds the development guide
 * Prepare already looks for.
 */
function writeSiblingTree(root: string, options: { guide: boolean }): void {
  const packages: readonly (readonly [string, string, string, string | null])[] = [
    ["cv1-first", "CV1", "First capability", null],
    ["cv1-first/cv1-ds1-alpha", "CV1.DS1", "Alpha delivery", "Delivery Story"],
    ["cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first", "CV1.DS1.TS1", "First slice", "Technical Story"],
    [
      "cv1-first/cv1-ds1-alpha/cv1-ds1-ts2-second",
      "CV1.DS1.TS2",
      "Second slice",
      "Technical Story",
    ],
    ["cv1-first/cv1-ds1-alpha/cv1-ds1-ts3-third", "CV1.DS1.TS3", "Third slice", "Technical Story"],
    ["cv1-first/cv1-ds10-tenth", "CV1.DS10", "Tenth delivery", "Delivery Story"],
    [
      "cv1-first/cv1-ds10-tenth/cv1-ds10-ts1-tenth",
      "CV1.DS10.TS1",
      "Tenth slice",
      "Technical Story",
    ],
    ["cv1-first/cv1-ds2-beta", "CV1.DS2", "Beta delivery", "Delivery Story"],
    ["cv1-first/cv1-ds2-beta/cv1-ds2-us1-beta", "CV1.DS2.US1", "Beta story", "User Story"],
    ["cv2-second", "CV2", "Second capability", null],
    ["cv2-second/cv2-ds1-gamma", "CV2.DS1", "Gamma delivery", "Delivery Story"],
  ];
  const roadmap = join(root, "docs/project/roadmap");
  mkdirSync(roadmap, { recursive: true });
  writeFileSync(join(roadmap, "index.md"), "# Roadmap\n", "utf8");
  for (const [folder, code, title, type] of packages) {
    mkdirSync(join(roadmap, folder), { recursive: true });
    const typeLine = type === null ? "" : `**Type:** ${type}\n`;
    writeFileSync(
      join(roadmap, folder, "index.md"),
      `# ${code} — ${title}\n\n**Status:** 🟡 Planned\n${typeLine}`,
      "utf8",
    );
  }
  if (options.guide) {
    mkdirSync(join(root, "docs/process"), { recursive: true });
    writeFileSync(
      join(root, "docs/process/development-guide.md"),
      "# Development Guide\n\n- Run `npm test` before every commit.\n",
      "utf8",
    );
  }
}

/** Run `plan-item` for one prepared story of a CR019 tree; return the card and plan.md. */
function planStoryIn(
  project: string,
  story: { code: string; title: string; level: string; folder: string },
): { card: string; planMd: string } {
  const db = seed("adopted", project);
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: story.code,
        activeItemTitle: story.title,
        activeItemLevel: story.level,
        lastDeliveryEvent: "prepare",
        navigatorFlowUnit: "story_by_story",
      },
      { nowIso: () => NOW },
    );
    const result = invoke(db, ["plan-item", "--method", "ariad", "--journey", "demo"]);
    assert.equal(result.exitCode, 0, result.stderr);
    const planMd = readFileSync(
      join(project, "docs/project/roadmap", story.folder, "plan.md"),
      "utf8",
    );
    return { card: result.stdout, planMd };
  } finally {
    db.close();
  }
}

/** One `## Heading` section of a plan.md, without its heading. */
function planSection(planMd: string, heading: string): string {
  const match = planMd.match(new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)\\n\\n## `, "u"));
  assert.ok(match, `plan.md has a ${heading} section`);
  return match[1] ?? "";
}

/**
 * The card rows between two labels, box drawing removed, lines joined. A label row
 * always follows a blank row, which keeps wrapped text that happens to begin with a
 * label's word, such as "cursor is at ...", from ending the block early.
 */
/** A reason as `cardRows` reads it back: wrapped as the card wraps it, rows joined. */
function asCardRows(text: string): string {
  return cardWrapped(text)
    .map((line) => line.replace(/^│ ?/u, "").replace(/ *│$/u, "").trim())
    .join(" ");
}

function cardRows(card: string, from: string, to: string): string {
  const match = card.match(new RegExp(`│ ${from} [\\s\\S]*?\\n([\\s\\S]*?)│ +│\\n│ ${to} `, "u"));
  assert.ok(match, `the card has a ${from} block`);
  return (match[1] ?? "")
    .split("\n")
    .map((line) => line.replace(/^│ ?/u, "").replace(/ *│$/u, "").trim())
    .filter((line) => line !== "")
    .join(" ");
}

test("CR019: a story's Plan names only its own parent's other children as non-goals", () => {
  const project = mkdtempSync("/tmp/builder-command-cr019-");
  temporaryDirectories.push(project);
  writeSiblingTree(project, { guide: false });

  const first = planStoryIn(project, {
    code: "CV1.DS1.TS1",
    title: "First slice",
    level: "technical_story",
    folder: "cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first",
  });
  assert.equal(
    planSection(first.planMd, "Non-Goals"),
    "- Do not implement sibling roadmap item: Second slice.\n" +
      "- Do not implement sibling roadmap item: Third slice.",
  );
  assert.equal(
    cardRows(first.card, "non-goals", "acceptance"),
    "○ Do not implement sibling roadmap item: Second slice. " +
      "○ Do not implement sibling roadmap item: Third slice.",
    "not the parent, the DS10 child, the cousin, the other Delivery Story, or CV2",
  );

  const onlyChild = planStoryIn(project, {
    code: "CV1.DS2.US1",
    title: "Beta story",
    level: "user_story",
    folder: "cv1-first/cv1-ds2-beta/cv1-ds2-us1-beta",
  });
  assert.equal(
    planSection(onlyChild.planMd, "Non-Goals"),
    "- Do not silently absorb adjacent roadmap work.",
  );
});

test("CR019: the contract carries Ariad's method rules, and a project's own only through its guide", () => {
  const first = {
    code: "CV1.DS1.TS1",
    title: "First slice",
    level: "technical_story",
    folder: "cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first",
  };
  const method = [
    "- Use TDD or characterization tests for behavior changes when testable.",
    "- Keep changes scoped to `CV1.DS1.TS1`.",
    "- Do not use git add .; commit only story-scoped files.",
  ];
  const cardMethod =
    "TDD/characterization tests when behavior is testable. " +
    "Keep changes scoped to the active story. " +
    "Do not use git add .; commit only story-scoped files.";
  const pointer = "Follow the project's development guide: docs/process/development-guide.md.";

  for (const guide of [false, true]) {
    const project = mkdtempSync("/tmp/builder-command-cr019-");
    temporaryDirectories.push(project);
    writeSiblingTree(project, { guide });
    const plan = planStoryIn(project, first);
    const label = guide ? "with a guide" : "without a guide";

    assert.equal(
      planSection(plan.planMd, "Implementation Contract"),
      [...method, ...(guide ? [`- ${pointer}`] : [])].join("\n"),
      `plan.md ${label}`,
    );
    assert.equal(
      cardRows(plan.card, "implementation contract", "approval gate"),
      guide ? `${cardMethod} ✓ ${pointer}` : cardMethod,
      `card ${label}`,
    );
    assert.doesNotMatch(plan.card + plan.planMd, /English|None declared/u, label);
  }
});

test("CR019: an active story the candidates no longer list gets the fallback non-goal", () => {
  const project = mkdtempSync("/tmp/builder-command-cr019-");
  temporaryDirectories.push(project);
  writeSiblingTree(project, { guide: false });
  const folder = "cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first";
  // A done.md takes the story out of the pull candidates, siblings or not.
  writeFileSync(join(project, "docs/project/roadmap", folder, "done.md"), "# Done\n", "utf8");

  const plan = planStoryIn(project, {
    code: "CV1.DS1.TS1",
    title: "First slice",
    level: "technical_story",
    folder,
  });
  assert.equal(
    planSection(plan.planMd, "Non-Goals"),
    "- Do not silently absorb adjacent roadmap work.",
  );
});

/** A complete, accepted `validate-item` for the CR067 tests. */
const CR067_VALIDATE = [
  "validate-item",
  "--implementation-complete",
  "--check",
  "npm test",
  "--checks-status",
  "passed",
  "--e2e-decision",
  "not_required",
  "--e2e-evidence",
  "unit-level change",
  "--navigator-route",
  "walk the route",
  "--navigator-accepted",
  "--expected-observation",
  "the change is visible",
  "--pass-condition",
  "it is",
  "--fail-condition",
  "it is not",
] as const;

test("CR067: every refusal renders where the cursor stands, says why, and changes nothing", () => {
  const project = mkdtempSync("/tmp/builder-command-cr067-");
  temporaryDirectories.push(project);
  writeSiblingTree(project, { guide: false });
  const db = seed("adopted", project);
  const cursorRow = () =>
    (
      db
        .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
        .get("__builder_delivery_cursor__:demo") as { metadata: string }
    ).metadata;
  const run = (argv: readonly string[]) =>
    invoke(db, [argv[0] ?? "", "--method", "ariad", "--journey", "demo", ...argv.slice(1)]);
  const proceed = (argv: readonly string[]) => {
    const result = run(argv);
    assert.equal(result.exitCode, 0, `${argv[0]}: ${result.stdout}${result.stderr}`);
  };
  const refuse = (argv: readonly string[], stage: string, reason: string) => {
    const before = { cursor: cursorRow(), files: projectSnapshot(project) };
    const result = run(argv);
    const label = `${argv[0]} at ${stage}`;
    assert.equal(result.exitCode, 1, label);
    assert.equal(result.stderr, "", label);
    assert.deepEqual(surfaceIds(result.stdout), ["CHECKPOINT_REFUSED"], label);
    assert.match(result.stdout, new RegExp(`◉ ${stage}( →|\\n)`, "u"), `${label}: ribbon`);
    assert.equal(cardRows(result.stdout, "reason", "cursor"), reason, `${label}: reason`);
    assert.equal(
      cardRows(result.stdout, "to see the checkpoint", "boundary"),
      "mirror build show --journey demo --method ariad",
      label,
    );
    assert.equal(cursorRow(), before.cursor, `${label}: the cursor is unchanged`);
    assert.deepEqual(projectSnapshot(project), before.files, `${label}: no file changed`);
  };
  const validate = CR067_VALIDATE;
  const review = ["review-item", "--debt", "No debt found", "--decision", "no_action"];
  const coherence = ["coherence-item", "--process", "p", "--project", "p", "--product", "p"];
  const done = [
    "done-item",
    "--history-action",
    "h",
    "--roadmap-update",
    "r",
    "--next-recommendation",
    "n",
  ];
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.TS1",
        activeItemTitle: "First slice",
        activeItemLevel: "technical_story",
        lastDeliveryEvent: "prepare",
        navigatorFlowUnit: "story_by_story",
      },
      { nowIso: () => NOW },
    );
    proceed(["plan-item"]);
    refuse(
      ["plan-item"],
      "Plan",
      "Plan is already complete for CV1.DS1.TS1: the cursor is at plan, pending navigator_approval.",
    );
    refuse(validate, "Plan", "Validation is blocked: pending confirmation navigator_approval.");
    // CR112: approval reads the plan, refuses the scaffold Plan wrote, and names what to write.
    refuse(
      ["approve-plan"],
      "Plan",
      asCardRows(
        "Plan approval needs an authored plan. Still to author in docs/project/roadmap/cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first/plan.md: Objective, Scope, Acceptance Behavior, Validation Route.",
      ),
    );
    authorPlan(
      join(project, "docs/project/roadmap/cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first/plan.md"),
    );
    proceed(["approve-plan"]);
    // Approving twice says the step is done, where the cursor stands (CR067's shape).
    refuse(
      ["approve-plan"],
      "Implement",
      "Plan approval is already complete for CV1.DS1.TS1: the cursor is at plan_approved.",
    );
    proceed(["set-cadence", "--profile", "stepwise"]);
    refuse(
      ["continue-lifecycle", "--process", "p", "--project", "p", "--product", "p"],
      "Implement",
      "Stepwise cadence does not continue automatically.",
    );
    proceed(["set-cadence", "--profile", "checkpoint"]);
    proceed(validate);
    refuse(
      validate,
      "Debt Review",
      "Validation is already complete for CV1.DS1.TS1: the cursor is at validation_passed.",
    );
    proceed(review);
    refuse(
      review,
      "Done",
      "Debt Review is already complete for CV1.DS1.TS1: the cursor is at review_complete.",
    );
    proceed(coherence);
    refuse(
      coherence,
      "Done",
      "Coherence is already complete for CV1.DS1.TS1: the cursor is at coherence_complete.",
    );
    refuse(
      validate,
      "Done",
      "Validation is already complete for CV1.DS1.TS1: the cursor is at coherence_complete.",
    );
    proceed(done);
    refuse(
      done,
      "Done",
      "Done is already complete for CV1.DS1.TS1: the cursor is at done_complete.",
    );
  } finally {
    db.close();
  }
});

test("CR067: check-implementation still renders the Implement guard it was written for", () => {
  // A scratch copy: this scenario materializes a Plan package, and the committed
  // fixture project must never receive one.
  const db = seed("adopted_plan_pending", scratchProject(false));
  try {
    const result = invoke(db, ["check-implementation", "--method", "ariad", "--journey", "demo"]);
    assert.deepEqual(surfaceIds(result.stdout), ["IMPLEMENTATION_GUARD"]);
  } finally {
    db.close();
  }
});

/** The trimmed card lines between two labels, one entry per rendered line. */
function cardLines(card: string, from: string, to: string): string[] {
  return cardRows(card, from, to) === ""
    ? []
    : (card.match(new RegExp(`│ ${from} [\\s\\S]*?\\n([\\s\\S]*?)│ +│\\n│ ${to} `, "u"))?.[1] ?? "")
        .split("\n")
        .map((line) => line.replace(/^│ ?/u, "").replace(/ *│$/u, "").trim())
        .filter((line) => line !== "");
}

test("CR020: build show renders the stage, position, and records, and changes nothing", () => {
  const project = mkdtempSync("/tmp/builder-command-cr020-");
  temporaryDirectories.push(project);
  writeSiblingTree(project, { guide: false });
  const db = seed("adopted", project);
  const run = (argv: readonly string[]) =>
    invoke(db, [argv[0] ?? "", "--method", "ariad", "--journey", "demo", ...argv.slice(1)]);
  const state = () => ({
    rows: (db.prepare("SELECT COUNT(*) AS n FROM runtime_sessions").get() as { n: number }).n,
    cursor: (
      db
        .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
        .get("__builder_delivery_cursor__:demo") as { metadata: string } | undefined
    )?.metadata,
    files: projectSnapshot(project),
  });
  const show = (stage: string): string => {
    const before = state();
    const first = run(["show"]);
    const again = run(["show"]);
    const readOnly = invokeReadOnlyBuilderArgv(db, [
      "show",
      "--method",
      "ariad",
      "--journey",
      "demo",
    ]);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.deepEqual(surfaceIds(first.stdout), ["ACTIVE_CHECKPOINT"]);
    assert.match(first.stdout, new RegExp(`◉ ${stage}( →|\\n)`, "u"), `ribbon at ${stage}`);
    assert.equal(again.stdout, first.stdout, "two calls print the same");
    assert.equal(readOnly.stdout, first.stdout, "the read-only dispatch prints the same");
    assert.deepEqual(state(), before, "nothing changed");
    return first.stdout;
  };
  const folder = "docs/project/roadmap/cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first";
  // The records block: the folder (wrapped over one or more rows), then one row per
  // artifact or record, with a `to author:` row under an unauthored artifact (CR112).
  const records = (card: string) => {
    const lines = cardLines(card, "records", "boundary");
    const first = lines.findIndex((line) => /^[✓○] /u.test(line));
    return { folder: lines.slice(0, first).join(""), files: lines.slice(first) };
  };
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.TS1",
        activeItemTitle: "First slice",
        activeItemLevel: "technical_story",
        lastDeliveryEvent: "prepare",
        navigatorFlowUnit: "story_by_story",
      },
      { nowIso: () => NOW },
    );
    assert.equal(run(["plan-item"]).exitCode, 0);
    const planned = show("Plan");
    assert.equal(cardRows(planned, "active item", "last event"), "CV1.DS1.TS1 — First slice");
    assert.equal(cardRows(planned, "last event", "pending confirmation"), "plan");
    assert.equal(
      cardRows(planned, "pending confirmation", "active checkpoint"),
      "navigator_approval",
    );
    assert.equal(cardRows(planned, "active checkpoint", "records"), "after_plan");
    // CR112: the Plan-stage artifacts carry their state; the index the sibling tree
    // wrote is authored, the plan and the guide Plan just wrote are scaffolds, and
    // each scaffold names the sections still to write.
    assert.deepEqual(records(planned), {
      folder,
      files: [
        "✓ index.md — authored",
        "○ plan.md — scaffold",
        "to author: Objective, Scope, Acceptance Behavior,",
        "Validation Route",
        "○ test-guide.md — scaffold",
        "to author: Automated Validation,",
        "Navigator Validation",
        "○ validation.md",
        "○ review.md",
        "○ coherence.md",
        "○ done.md",
      ],
    });
    assert.match(
      planned.replace(/[│╭╮╰╯─]/gu, " ").replace(/\s+/gu, " "),
      /boundary Read-only: the cursor and the project files were not changed\. <<<END/u,
    );

    authorPlan(join(project, folder, "plan.md"));
    assert.equal(run(["approve-plan"]).exitCode, 0);
    assert.equal(
      run([
        "validate-item",
        "--implementation-complete",
        "--check",
        "npm test",
        "--checks-status",
        "passed",
        "--e2e-decision",
        "not_required",
        "--e2e-evidence",
        "unit-level change",
        "--navigator-route",
        "walk the route",
        "--navigator-accepted",
        "--expected-observation",
        "it shows",
        "--pass-condition",
        "it does",
        "--fail-condition",
        "it does not",
      ]).exitCode,
      0,
    );
    const validated = show("Debt Review");
    assert.equal(cardRows(validated, "last event", "pending confirmation"), "validation_passed");
    assert.deepEqual(records(validated).files, [
      "✓ index.md — authored",
      "✓ plan.md — authored",
      "○ test-guide.md — scaffold",
      "to author: Automated Validation,",
      "Navigator Validation",
      "✓ validation.md",
      "○ review.md",
      "○ coherence.md",
      "○ done.md",
    ]);
  } finally {
    db.close();
  }
});

test("CR020: build show with no item pulled says so and gives the pull command", () => {
  const db = seed("adopted", scratchProject(false));
  try {
    const result = invoke(db, ["show", "--method", "ariad", "--journey", "demo"]);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(surfaceIds(result.stdout), ["ACTIVE_CHECKPOINT"]);
    assert.doesNotMatch(result.stdout, /Delivery Flow/u);
    assert.match(
      cardRows(result.stdout, "active item", "boundary"),
      /^no item pulled yet pull explicitly: mirror build pull-item --journey demo --method ariad/u,
    );
  } finally {
    db.close();
  }
});

test("CR020: build show marks no stage for an event outside the table", () => {
  const db = seed("adopted", scratchProject(false));
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS3",
        activeItemTitle: "Aggregate delivery",
        activeItemLevel: "delivery_story",
        lastDeliveryEvent: "delivery_story_plan",
        pendingConfirmation: "navigator_delivery_story_plan_approval",
        navigatorFlowUnit: "delivery_story",
      },
      { nowIso: () => NOW },
    );
    const result = invoke(db, ["show", "--method", "ariad", "--journey", "demo"]);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /◉/u);
    assert.equal(
      cardRows(result.stdout, "last event", "pending confirmation"),
      "delivery_story_plan",
    );
  } finally {
    db.close();
  }
});

test("CR020: build show refuses without a journey, and for a journey that adopted no method", () => {
  const adopted = seed("adopted", scratchProject(false));
  try {
    const result = invoke(adopted, ["show", "--method", "ariad"]);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stdout + result.stderr, /requires a journey/u);
  } finally {
    adopted.close();
  }
  const bare = seed("no_active_mode", scratchProject(false));
  try {
    const result = invoke(bare, ["show", "--method", "ariad", "--journey", "demo"]);
    assert.notEqual(result.exitCode, 0);
    assert.doesNotMatch(result.stdout, /ACTIVE_CHECKPOINT/u);
  } finally {
    bare.close();
  }
});

test("CR067: a failure after the cursor moved is an error, never a refusal that changed nothing", () => {
  const project = mkdtempSync("/tmp/builder-command-cr067-");
  temporaryDirectories.push(project);
  writeSiblingTree(project, { guide: false });
  const db = seed("adopted", project);
  const run = (argv: readonly string[]) =>
    invoke(db, [argv[0] ?? "", "--method", "ariad", "--journey", "demo", ...argv.slice(1)]);
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.TS1",
        activeItemTitle: "First slice",
        activeItemLevel: "technical_story",
        lastDeliveryEvent: "prepare",
        navigatorFlowUnit: "story_by_story",
      },
      { nowIso: () => NOW },
    );
    assert.equal(run(["plan-item"]).exitCode, 0);
    authorPlan(
      join(project, "docs/project/roadmap/cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first/plan.md"),
    );
    assert.equal(run(["approve-plan"]).exitCode, 0);
    // A directory where the record belongs: the closure writes the cursor, then fails
    // reading the record it was about to seal.
    mkdirSync(
      join(project, "docs/project/roadmap/cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first/validation.md"),
    );
    const result = run(CR067_VALIDATE);
    assert.equal(
      getDeliveryCursor(db, "demo")?.lastDeliveryEvent,
      "validation_passed",
      "the cursor moved, so this is the failure after the write",
    );
    assert.equal(result.exitCode, 1);
    assert.deepEqual(surfaceIds(result.stdout), [], "no surface claims nothing changed");
    assert.match(result.stderr, /^Error: /u);
  } finally {
    db.close();
  }
});

// CR018 plateau 1 — Expand finds a child by its heading, and a code two packages claim
// is a refusal, never a crash. Hand-written expectations: before CR018 Expand found a
// child by the folder name it would give it, and wrote a second package whenever the
// authored one lived anywhere else.

/**
 * CV1 with one Delivery Story whose candidate table lists TS2 first, with no package,
 * and TS1, authored under a folder name Expand would never derive. `duplicate` copies
 * TS1's package, so two packages claim its code.
 */
function claimsProject(options: { duplicate: boolean }): string {
  const project = mkdtempSync("/tmp/builder-command-cr018-");
  temporaryDirectories.push(project);
  const roadmap = join(project, "docs/project/roadmap");
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(roadmap, path)), { recursive: true });
    writeFileSync(join(roadmap, path), content, "utf8");
  };
  write("index.md", "# Roadmap\n");
  write("cv1/index.md", "# CV1 — First capability\n\n**Status:** 🟢 Active\n");
  write(
    "cv1/ds1/index.md",
    "# CV1.DS1 — Hygiene\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n" +
      "## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n" +
      "| CV1.DS1.TS2 | Second slice | Technical Story | 🟡 Planned |\n" +
      "| [CV1.DS1.TS1](ts1-named-by-a-human/index.md) | First slice | Technical Story | 🟡 Planned |\n",
  );
  const authored =
    "# CV1.DS1.TS1 — First slice\n\n**Status:** 🟡 Planned\n**Type:** Technical Story\n";
  write("cv1/ds1/ts1-named-by-a-human/index.md", authored);
  if (options.duplicate) write("cv1/ds1/ts1-copy/index.md", authored);
  return project;
}

/** The roadmap-relative folders of every `index.md` whose heading claims `code`. */
function claimants(project: string, code: string): string[] {
  const heading = new RegExp(`^# ${code.replaceAll(".", "\\.")} [—-] `, "mu");
  const prefix = "docs/project/roadmap/";
  return Object.entries(projectSnapshot(project))
    .filter(([path, content]) => path.endsWith("/index.md") && heading.test(content))
    .map(([path]) => path.slice(prefix.length, -"/index.md".length));
}

const PULL_HYGIENE = [
  "pull-item",
  "--method",
  "ariad",
  "--journey",
  "demo",
  "--item-code",
  "CV1.DS1",
  "--item-title",
  "Hygiene",
  "--item-level",
  "delivery_story",
  "--why-now",
  "CR018",
];

test("CR018: Expand reports an authored child existing wherever its heading lives", () => {
  const project = claimsProject({ duplicate: false });
  const db = seed("adopted", project);
  try {
    assert.equal(invoke(db, ["sync-cursor", "--method", "ariad", "--journey", "demo"]).exitCode, 0);
    const pulled = invoke(db, PULL_HYGIENE);
    assert.equal(pulled.exitCode, 0, pulled.stderr);
    assert.deepEqual(claimants(project, "CV1.DS1.TS1"), ["cv1/ds1/ts1-named-by-a-human"]);
    assert.deepEqual(claimants(project, "CV1.DS1.TS2"), ["cv1/ds1/cv1-ds1-ts2-second-slice"]);
    assert.match(pulled.stdout, /↻ existing TS1 package/u);
    assert.match(pulled.stdout, /✓ created TS2 package/u);
    assert.deepEqual(getDeliveryCursor(db, "demo")?.childWorkItems, ["CV1.DS1.TS2", "CV1.DS1.TS1"]);
  } finally {
    db.close();
  }
});

test("CR018: a child two packages claim blocks Expand before any file is written", () => {
  const project = claimsProject({ duplicate: true });
  const db = seed("adopted", project);
  try {
    assert.equal(invoke(db, ["sync-cursor", "--method", "ariad", "--journey", "demo"]).exitCode, 0);
    const before = projectSnapshot(project);
    const pulled = invoke(db, PULL_HYGIENE);
    assert.equal(pulled.exitCode, 1);
    assert.deepEqual(surfaceIds(pulled.stdout), ["EXPAND_BLOCKED"]);
    assert.match(pulled.stdout, /No files were materialized/u);
    // TS2 comes first in the table, so a child settled only when its turn came would
    // already be on disk when TS1's double claim stopped Expand.
    assert.deepEqual(projectSnapshot(project), before, "nothing written, TS2 included");
  } finally {
    db.close();
  }
});

test("CR018: a Delivery Story with no package refuses to invent a child another package claims", () => {
  const project = claimsProject({ duplicate: false });
  // CV1.DS9 has no package, so Expand would invent CV1.DS9.US1 for it; one already exists.
  const orphan = join(project, "docs/project/roadmap/cv1/orphan-us1");
  mkdirSync(orphan, { recursive: true });
  writeFileSync(
    join(orphan, "index.md"),
    "# CV1.DS9.US1 — Orphan story\n\n**Status:** 🟡 Planned\n**Type:** User Story\n",
    "utf8",
  );
  const db = seed("adopted", project);
  try {
    assert.equal(invoke(db, ["sync-cursor", "--method", "ariad", "--journey", "demo"]).exitCode, 0);
    const before = projectSnapshot(project);
    const pulled = invoke(db, [...PULL_HYGIENE.slice(0, 6), "CV1.DS9", ...PULL_HYGIENE.slice(7)]);
    assert.equal(pulled.exitCode, 1);
    assert.deepEqual(surfaceIds(pulled.stdout), ["EXPAND_BLOCKED"]);
    assert.deepEqual(projectSnapshot(project), before);
    assert.deepEqual(claimants(project, "CV1.DS9.US1"), ["cv1/orphan-us1"]);
  } finally {
    db.close();
  }
});

/** Every Builder command that resolves the active item's package, with the flags it needs. */
const PACKAGE_RESOLVING_COMMANDS: readonly (readonly string[])[] = [
  ["show"],
  ["plan-item"],
  ["approve-plan", "--use-preauthorization"],
  [
    "continue-lifecycle",
    "--history-action",
    "commit",
    "--roadmap-update",
    "done",
    "--next-recommendation",
    "next",
  ],
  ["validate-item", ...CR067_VALIDATE.slice(1)],
  ["review-item", "--debt", "No debt found", "--decision", "no_action"],
  ["coherence-item", "--process", "aligned", "--project", "aligned", "--product", "aligned"],
  [
    "done-item",
    "--history-action",
    "commit",
    "--roadmap-update",
    "done",
    "--next-recommendation",
    "next",
  ],
  ["plan-delivery-story", "--objective", "One outcome", "--child", "CV1.DS1.TS1"],
  ["approve-delivery-story-plan"],
  ["validate-delivery-story", "--summary", "validated", "--navigator-accepted"],
  ["review-delivery-story", "--decision", "no_action", "--summary", "no debt"],
  ["coherence-delivery-story", "--summary", "coherent"],
  ["done-delivery-story", "--summary", "done"],
];

test("CR018: a code two packages claim is one Error line in every command that resolves it", () => {
  const project = claimsProject({ duplicate: true });
  const claimed =
    /^Error: 2 roadmap packages claim code 'CV1\.DS1\.TS1': \S+\/cv1\/ds1\/ts1-copy, \S+\/cv1\/ds1\/ts1-named-by-a-human\n$/u;
  for (const command of PACKAGE_RESOLVING_COMMANDS) {
    const name = command[0] ?? "";
    const db = seed("adopted", project);
    try {
      setDeliveryCursor(
        db,
        {
          journey: "demo",
          method: "ariad",
          activeItem: "CV1.DS1.TS1",
          activeItemTitle: "First slice",
          activeItemLevel: "technical_story",
          lastDeliveryEvent: "review_complete",
          cadenceProfile: "checkpoint",
          navigatorFlowUnit: "story_by_story",
        },
        { nowIso: () => NOW },
      );
      const database = databaseSnapshot(db);
      const tree = projectSnapshot(project);
      const argv = [name, "--method", "ariad", "--journey", "demo", ...command.slice(1)];
      let result: ReturnType<typeof invoke> | undefined;
      assert.doesNotThrow(() => {
        result = name === "show" ? invokeReadOnlyBuilderArgv(db, argv) : invoke(db, argv);
      }, name);
      assert.equal(result?.exitCode, 1, name);
      assert.equal(result?.stdout, "", name);
      assert.match(result?.stderr ?? "", claimed, name);
      assert.equal(databaseSnapshot(db), database, `${name} wrote nothing to the database`);
      assert.deepEqual(projectSnapshot(project), tree, `${name} wrote nothing to the project`);
    } finally {
      db.close();
    }
  }
});

// CR018 plateau 2 — a title is one string. Slashes in prose, inside code spans, and
// between them are part of it; no reader cuts at them.

const SLASHED = {
  cv: "Builder/Ariad trust",
  ds1: "Dead code / hygiene",
  ts1: "Remove the dormant pair (`executeToolCallsWeb` + route `/v1/mcp/execute`): the dead path goes",
  ts2: "Audit `pub`/`allow(dead_code)` items and read/write paths",
  ds2: "Web retirement: client/server split",
  us1: "Retire the web and/or fallbacks",
} as const;

/** The validation route's roadmap, without its links: slashes are this plateau's reason. */
function slashedProject(): string {
  const project = mkdtempSync("/tmp/builder-command-cr018-");
  temporaryDirectories.push(project);
  const roadmap = join(project, "docs/project/roadmap");
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(roadmap, path)), { recursive: true });
    writeFileSync(join(roadmap, path), content, "utf8");
  };
  const story = (code: string, title: string, type: string) =>
    `# ${code} — ${title}\n\n**Status:** 🟡 Planned\n**Type:** ${type}\n`;
  write("index.md", "# Roadmap\n");
  write("cv1/index.md", `# CV1 — ${SLASHED.cv}\n\n**Status:** 🟢 Active\n`);
  write("cv1/ds1/index.md", story("CV1.DS1", SLASHED.ds1, "Delivery Story"));
  write("cv1/ds1/ts1/index.md", story("CV1.DS1.TS1", SLASHED.ts1, "Technical Story"));
  write("cv1/ds1/ts2/index.md", story("CV1.DS1.TS2", SLASHED.ts2, "Technical Story"));
  write(
    "cv1/ds2/index.md",
    `${story("CV1.DS2", SLASHED.ds2, "Delivery Story")}\n## Candidate Stories\n\n` +
      "| Code | Story | Type | Status |\n|------|-------|------|--------|\n" +
      `| CV1.DS2.US1 | ${SLASHED.us1} | User Story | 🟡 Planned |\n`,
  );
  return project;
}

/** The card's rows as plain text, one per line, box drawing removed. */
function allCardRows(stdout: string): string[] {
  return stdout
    .split("\n")
    .filter((line) => line.startsWith("│"))
    .map((line) => line.replace(/^│ ?/u, "").replace(/ *│$/u, ""));
}

test("CR018: a title reaches Pull, Plan, Ready, and the Snapshot whole", () => {
  const project = slashedProject();
  const db = seed("adopted", project);
  const run = (argv: readonly string[]) =>
    invoke(db, [argv[0] ?? "", "--method", "ariad", "--journey", "demo", ...argv.slice(1)]);
  const pull = (code: string, title: string, level: string) =>
    run([
      "pull-item",
      "--item-code",
      code,
      "--item-title",
      title,
      "--item-level",
      level,
      "--why-now",
      "CR018",
    ]);
  try {
    assert.equal(run(["sync-cursor"]).exitCode, 0);

    const pulled = pull("CV1.DS1.TS1", SLASHED.ts1, "technical_story");
    assert.equal(pulled.exitCode, 0, pulled.stderr);
    const pullRows = allCardRows(pulled.stdout);
    assert.ok(
      pullRows.some((row) => row.startsWith("Remove the dormant pair (`execute")),
      "header",
    );
    assert.ok(
      pullRows.some((row) => row.startsWith("  └─ 🟦[TS1] Remove the dormant pair")),
      "tree",
    );

    assert.equal(run(["prepare-item"]).exitCode, 0);
    const planned = run(["plan-item"]);
    assert.equal(planned.exitCode, 0, planned.stderr);
    const planMd = readFileSync(join(project, "docs/project/roadmap/cv1/ds1/ts1/plan.md"), "utf8");
    assert.equal(
      planSection(planMd, "Objective"),
      `Plan the smallest coherent, testable slice for ${SLASHED.ts1}.`,
    );
    assert.equal(
      planSection(planMd, "Scope").split("\n")[0],
      `- Deliver ${SLASHED.ts1} as an observable slice.`,
    );
    assert.equal(
      planSection(planMd, "Non-Goals"),
      `- Do not implement sibling roadmap item: ${SLASHED.ts2}.`,
    );
    assert.equal(
      cardRows(planned.stdout, "non-goals", "acceptance"),
      `○ Do not implement sibling roadmap item: ${SLASHED.ts2}.`,
    );

    const ready = pull("CV1.DS2", SLASHED.ds2, "delivery_story");
    assert.equal(ready.exitCode, 0, ready.stderr);
    const readyRows = allCardRows(ready.stdout);
    const pulledAt = readyRows.indexOf("What was pulled?");
    assert.equal(readyRows[pulledAt + 1]?.trim(), SLASHED.ds2);
    assert.ok(
      readyRows.some((row) => row.startsWith(`  └─ 🟦[DS2] ${SLASHED.ds2}`)),
      "tree",
    );
    assert.ok(
      readyRows.some((row) => row.startsWith(`🟩[US1] ${SLASHED.us1}`)),
      "recommendation",
    );

    const snapshot = invokeReadOnlyBuilderArgv(db, [
      "pull-candidates",
      "--method",
      "ariad",
      "--journey",
      "demo",
    ]);
    const backlog = allCardRows(snapshot.stdout).map((row) => row.trim());
    for (const [code, title] of [
      ["CV1.DS1", SLASHED.ds1],
      ["CV1.DS1.TS2", SLASHED.ts2],
    ] as const) {
      const row = `○ 🟦[${code}] ${title}`;
      assert.ok(
        backlog.some((line) => {
          // Plateau 4 marks the cut with `…`; the rest must be the start of the title.
          const kept = line.replace(/…$/u, "").trimEnd();
          return row.startsWith(kept) && kept.length > `○ 🟦[${code}] `.length + 8;
        }),
        `${code} is listed from the start of its title`,
      );
    }
    assert.ok(
      backlog.some((line) => line.startsWith(`└─ 🟦[US1] ${SLASHED.us1}`)),
      "the current row",
    );
  } finally {
    db.close();
  }
});

// CR018 plateau 3 — the CV row names the CV by its own title: the focus Project Position
// shows for the same cursor. Python borrowed the pulled item's title for it.

test("CR018: Pull and Ready name the CV by its own title, never the item's", () => {
  const project = slashedProject();
  const db = seed("adopted", project);
  const run = (argv: readonly string[]) =>
    invoke(db, [argv[0] ?? "", "--method", "ariad", "--journey", "demo", ...argv.slice(1)]);
  const pull = (code: string, title: string, level: string) =>
    run([
      "pull-item",
      "--item-code",
      code,
      "--item-title",
      title,
      "--item-level",
      level,
      "--why-now",
      "CR018",
    ]);
  try {
    assert.equal(run(["sync-cursor"]).exitCode, 0);
    const pulled = pull("CV1.DS1.TS1", SLASHED.ts1, "technical_story");
    assert.ok(allCardRows(pulled.stdout).includes(`🟪[CV1] ${SLASHED.cv}`), "Pull");
    const ready = pull("CV1.DS2", SLASHED.ds2, "delivery_story");
    assert.ok(allCardRows(ready.stdout).includes(`🟪[CV1] ${SLASHED.cv}`), "Ready");
    const position = invokeReadOnlyBuilderArgv(db, [
      "pull-candidates",
      "--method",
      "ariad",
      "--journey",
      "demo",
    ]);
    assert.ok(
      allCardRows(position.stdout).some((row) => row.startsWith(`🟪[CV1]  ${SLASHED.cv}`)),
      "the Snapshot names the same CV the same way",
    );
  } finally {
    db.close();
  }
});

test("CR018: with no roadmap row or package for the CV, the row says so instead of borrowing", () => {
  const project = slashedProject();
  rmSync(join(project, "docs/project/roadmap/cv1/index.md"));
  const db = seed("adopted", project);
  try {
    assert.equal(invoke(db, ["sync-cursor", "--method", "ariad", "--journey", "demo"]).exitCode, 0);
    const pulled = invoke(db, [
      "pull-item",
      "--method",
      "ariad",
      "--journey",
      "demo",
      "--item-code",
      "CV1.DS1.TS2",
      "--item-title",
      SLASHED.ts2,
      "--item-level",
      "technical_story",
      "--why-now",
      "CR018",
    ]);
    assert.equal(pulled.exitCode, 0, pulled.stderr);
    const rows = allCardRows(pulled.stdout);
    const cvRow = rows.find((row) => row.startsWith("🟪[CV1]"));
    assert.equal(cvRow?.trimEnd(), "🟪[CV1] no authored package");
  } finally {
    db.close();
  }
});

// CR018 plateau 4 — width (C1): a title is whole where it is read, and a row that
// restates it on one line says `…` when it is cut.

const LONG = {
  cv: "Builder/Ariad trust across every surface the Navigator reads before deciding",
  ts1: SLASHED.ts1,
  ts2: SLASHED.ts2,
  ds2: "Web retirement: split the client/server seam and delete the dead console",
  us1: "Retire the web surface and every and/or fallback the console still carries",
} as const;

function longProject(): string {
  const project = slashedProject();
  const roadmap = join(project, "docs/project/roadmap");
  writeFileSync(
    join(roadmap, "cv1/index.md"),
    `# CV1 — ${LONG.cv}\n\n**Status:** 🟢 Active\n`,
    "utf8",
  );
  writeFileSync(
    join(roadmap, "cv1/ds2/index.md"),
    `# CV1.DS2 — ${LONG.ds2}\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n` +
      "## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n" +
      `| CV1.DS2.US1 | ${LONG.us1} | User Story | 🟡 Planned |\n`,
    "utf8",
  );
  return project;
}

/** The rows from the first one `starts` matches, up to a blank row or one `stops` matches, joined. */
function wrappedFrom(
  rows: readonly string[],
  starts: (row: string) => boolean,
  stops: (row: string) => boolean = () => false,
): string {
  const first = rows.findIndex(starts);
  assert.ok(first !== -1, "the block is there");
  const block: string[] = [];
  for (const row of rows.slice(first)) {
    if (row.trim() === "" || (block.length > 0 && stops(row))) break;
    block.push(row.trim());
  }
  return block.join(" ");
}

/**
 * The one row `starts` matches: the start of `whole`, ending in `…`, cut between two
 * words unless that would keep less than half the card (CR018 debt 3).
 */
function assertClipped(rows: readonly string[], starts: string, whole: string): void {
  const matching = rows.filter((row) => row.startsWith(starts));
  assert.equal(matching.length, 1, `one ${starts} row`);
  const row = matching[0] ?? "";
  assert.ok(row.endsWith("…"), `${starts} says it was cut: ${row}`);
  const kept = row.slice(0, -1).trimEnd();
  assert.ok(whole.startsWith(kept), `${starts} is the start of the title`);
  assert.ok([...kept].length >= 27, `${starts} keeps at least half the card`);
  const next = whole.slice(kept.length, kept.length + 1);
  assert.ok(next === " " || [...row].length === 54, `${starts} is cut between words: ${row}`);
}

test("CR018: a title is whole where it is read, and a one-line restatement ends in …", () => {
  const project = longProject();
  const db = seed("adopted", project);
  const run = (argv: readonly string[]) =>
    invoke(db, [argv[0] ?? "", "--method", "ariad", "--journey", "demo", ...argv.slice(1)]);
  const pull = (code: string, title: string, level: string) =>
    run([
      "pull-item",
      "--item-code",
      code,
      "--item-title",
      title,
      "--item-level",
      level,
      "--why-now",
      "CR018",
    ]);
  const isTree = (row: string) => row.startsWith("  └─");
  try {
    assert.equal(run(["sync-cursor"]).exitCode, 0);

    const pullRows = allCardRows(pull("CV1.DS1.TS1", LONG.ts1, "technical_story").stdout);
    const header = pullRows.findIndex((row) => row.includes("DELIVERY STORY ACTIVATED"));
    assert.equal(
      wrappedFrom(pullRows.slice(header + 2), () => true),
      LONG.ts1,
      "Pull header",
    );
    assert.equal(
      wrappedFrom(pullRows, (row) => row.startsWith("🟪[CV1]"), isTree),
      `🟪[CV1] ${LONG.cv}`,
      "Pull CV row",
    );
    assertClipped(pullRows, "  └─ 🟦[TS1] ", `  └─ 🟦[TS1] ${LONG.ts1}`);

    const readyRows = allCardRows(pull("CV1.DS2", LONG.ds2, "delivery_story").stdout);
    assert.equal(
      wrappedFrom(readyRows, (row) => row.startsWith("🟪[CV1]"), isTree),
      `🟪[CV1] ${LONG.cv}`,
      "Ready CV row",
    );
    assertClipped(readyRows, "  └─ 🟦[DS2] ", `  └─ 🟦[DS2] ${LONG.ds2}`);
    assert.equal(
      wrappedFrom(readyRows, (row) => row.startsWith("🟩[US1]")),
      `🟩[US1] ${LONG.us1}`,
      "Ready's recommendation, which the skill copies",
    );

    const snapshot = invokeReadOnlyBuilderArgv(db, [
      "pull-candidates",
      "--method",
      "ariad",
      "--journey",
      "demo",
    ]);
    const snapshotRows = allCardRows(snapshot.stdout.split("<<<END:ROADMAP_SNAPSHOT>>>")[0] ?? "");
    const focus = snapshotRows.find((row) => row.startsWith("🟪[CV1]"));
    assert.ok(focus?.endsWith(" ◉ active"), `the status stays whole: ${focus}`);
    assert.ok(
      focus?.replace(/ +◉ active$/u, "").endsWith("…"),
      `the CV title says it was cut: ${focus}`,
    );
    assert.equal(
      wrappedFrom(snapshotRows, (row) => row.startsWith("value: ")),
      `value: ${LONG.cv}`,
      "the value row",
    );
    assertClipped(snapshotRows, "      ○ 🟦[CV1.DS2.US1] ", `      ○ 🟦[CV1.DS2.US1] ${LONG.us1}`);
  } finally {
    db.close();
  }
});

// CR018 plateau 5 — links (B1): a title enters Ariad with each link reduced to its
// label, from the roadmap and from `--item-title` alike, so no surface, file, or folder
// name carries a target written for another file.

const LINKED = {
  ts1:
    "Remove the dormant pair (`executeToolCallsWeb` + route `/v1/mcp/execute`) " +
    "(see [CV1.DS2](../../ds2/index.md)): the dead path goes",
  ts1Plain:
    "Remove the dormant pair (`executeToolCallsWeb` + route `/v1/mcp/execute`) " +
    "(see CV1.DS2): the dead path goes",
  us1: "Retire the web surface (per [D12](../../../decisions/d12.md)) and its and/or fallbacks",
  us1Plain: "Retire the web surface (per D12) and its and/or fallbacks",
} as const;

/** The route's roadmap: TS1's own heading and DS2's candidate table carry links. */
function linkedProject(): string {
  const project = slashedProject();
  const roadmap = join(project, "docs/project/roadmap");
  writeFileSync(
    join(roadmap, "cv1/ds1/ts1/index.md"),
    `# CV1.DS1.TS1 — ${LINKED.ts1}\n\n**Status:** 🟡 Planned\n**Type:** Technical Story\n`,
    "utf8",
  );
  writeFileSync(
    join(roadmap, "cv1/ds2/index.md"),
    `# CV1.DS2 — ${SLASHED.ds2}\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n` +
      "## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n" +
      `| CV1.DS2.US1 | ${LINKED.us1} | User Story | 🟡 Planned |\n`,
    "utf8",
  );
  return project;
}

test("CR018: a title's links become their labels where the title enters Ariad", () => {
  const project = linkedProject();
  const db = seed("adopted", project);
  const run = (argv: readonly string[]) =>
    invoke(db, [argv[0] ?? "", "--method", "ariad", "--journey", "demo", ...argv.slice(1)]);
  const pull = (code: string, title: string, level: string) =>
    run([
      "pull-item",
      "--item-code",
      code,
      "--item-title",
      title,
      "--item-level",
      level,
      "--why-now",
      "CR018",
    ]);
  try {
    assert.equal(run(["sync-cursor"]).exitCode, 0);

    // `--item-title` as an agent copies it from the roadmap, link and all.
    const pulled = pull("CV1.DS1.TS1", LINKED.ts1, "technical_story");
    assert.equal(pulled.exitCode, 0, pulled.stderr);
    assert.equal(getDeliveryCursor(db, "demo")?.activeItemTitle, LINKED.ts1Plain, "the cursor");
    const pullRows = allCardRows(pulled.stdout);
    const header = pullRows.findIndex((row) => row.includes("DELIVERY STORY ACTIVATED"));
    assert.equal(
      wrappedFrom(pullRows.slice(header + 2), () => true),
      LINKED.ts1Plain,
      "Pull header",
    );

    assert.equal(run(["prepare-item"]).exitCode, 0);
    const planned = run(["plan-item"]);
    assert.equal(planned.exitCode, 0, planned.stderr);
    const ts1 = join(project, "docs/project/roadmap/cv1/ds1/ts1");
    assert.equal(
      planSection(readFileSync(join(ts1, "plan.md"), "utf8"), "Objective"),
      `Plan the smallest coherent, testable slice for ${LINKED.ts1Plain}.`,
      "the roadmap's own heading enters link-free too",
    );
    assert.doesNotMatch(planned.stdout, /\]\(/u, "the Plan card");

    const ready = pull("CV1.DS2", SLASHED.ds2, "delivery_story");
    assert.equal(ready.exitCode, 0, ready.stderr);
    assert.equal(
      wrappedFrom(allCardRows(ready.stdout), (row) => row.startsWith("🟩[US1]")),
      `🟩[US1] ${LINKED.us1Plain}`,
      "Ready's recommendation",
    );
    assert.doesNotMatch(ready.stdout, /\]\(/u, "no surface of the Pull");
    const folder = "cv1/ds2/cv1-ds2-us1-retire-the-web-surface-per-d12-and-its-and-or-fallbacks";
    assert.deepEqual(claimants(project, "CV1.DS2.US1"), [folder], "named from the label");
    const child = readFileSync(join(project, "docs/project/roadmap", folder, "index.md"), "utf8");
    assert.doesNotMatch(child, /\]\(\.\.\/\.\.\/\.\./u, "no link one level short");
    assert.equal(child.split(LINKED.us1Plain).length - 1, 5, "the label, five times");

    const listed = invokeReadOnlyBuilderArgv(db, [
      "pull-candidates",
      "--method",
      "ariad",
      "--journey",
      "demo",
    ]);
    assert.doesNotMatch(listed.stdout, /\]\(/u, "Snapshot and Pull Candidates");
  } finally {
    db.close();
  }
});

test("CR018: EXPAND_BLOCKED's action names the Delivery Story whose index.md needs the table", () => {
  // Handoff review, finding 2: the fixed action pointed at "the resolved package's
  // index.md", and a Delivery Story with no package has none.
  const project = claimsProject({ duplicate: false });
  const orphan = join(project, "docs/project/roadmap/cv1/orphan-us1");
  mkdirSync(orphan, { recursive: true });
  writeFileSync(
    join(orphan, "index.md"),
    "# CV1.DS9.US1 — Orphan story\n\n**Status:** 🟡 Planned\n**Type:** User Story\n",
    "utf8",
  );
  const db = seed("adopted", project);
  try {
    assert.equal(invoke(db, ["sync-cursor", "--method", "ariad", "--journey", "demo"]).exitCode, 0);
    const pulled = invoke(db, [...PULL_HYGIENE.slice(0, 6), "CV1.DS9", ...PULL_HYGIENE.slice(7)]);
    const rows = allCardRows(pulled.stdout);
    const action = wrappedFrom(
      rows.slice(rows.indexOf("required Navigator action") + 1),
      () => true,
    );
    assert.equal(
      action,
      "Add a canonical candidate-stories table (Markdown table header including Code, " +
        "Story, Type, and Status columns) to CV1.DS9's index.md, creating it if the " +
        "Delivery Story has none, or resolve the duplicate heading, then Expand again.",
    );
  } finally {
    db.close();
  }
});

test("CR112: build show and the artifacts card name what each Plan-stage artifact is", () => {
  const project = mkdtempSync("/tmp/builder-command-cr112-");
  temporaryDirectories.push(project);
  writeSiblingTree(project, { guide: false });
  const packageDir = join(
    project,
    "docs/project/roadmap/cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first",
  );
  // The index the sibling tree wrote is replaced by the scaffold Expand would write, so
  // the artifacts card has an existing scaffold to name.
  writeFileSync(
    join(packageDir, "index.md"),
    renderTechnicalStoryIndex("CV1.DS1.TS1", "First slice"),
    "utf8",
  );
  const db = seed("adopted", project);
  const run = (argv: readonly string[]) =>
    invoke(db, [argv[0] ?? "", "--method", "ariad", "--journey", "demo", ...argv.slice(1)]);
  // Every row from the first artifact on: the folder rows precede it, and a wrapped
  // `to author:` list continues on the row after it.
  const recordRows = () => {
    const lines = cardLines(run(["show"]).stdout, "records", "boundary");
    return lines.slice(lines.findIndex((line) => /^[✓○] /u.test(line)));
  };
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.TS1",
        activeItemTitle: "First slice",
        activeItemLevel: "technical_story",
        lastDeliveryEvent: "prepare",
        navigatorFlowUnit: "story_by_story",
      },
      { nowIso: () => NOW },
    );
    assert.deepEqual(recordRows().slice(0, 5), [
      "○ index.md — scaffold",
      "to author: Technical Story, Outcome,",
      "Acceptance Behavior",
      "○ plan.md — missing",
      "○ test-guide.md — missing",
    ]);

    const planned = run(["plan-item"]);
    assert.equal(planned.exitCode, 0, planned.stderr);
    assert.match(planned.stdout, /│ ↻ existing story index — scaffold +│/u);
    assert.match(planned.stdout, /│ ✓ created plan +│/u);

    const planPath = join(packageDir, "plan.md");
    const scaffold = readFileSync(planPath, "utf8");
    writeFileSync(
      planPath,
      scaffold.replace(
        "- Deliver First slice as an observable slice.",
        "- The first slice of the seam.",
      ),
      "utf8",
    );
    assert.deepEqual(recordRows().slice(3, 6), [
      "○ plan.md — partly authored",
      "to author: Objective, Acceptance Behavior,",
      "Validation Route",
    ]);

    writeFileSync(
      planPath,
      readFileSync(planPath, "utf8")
        .replace("Plan the smallest coherent, testable slice for First slice.", "Cut the seam.")
        .replace("Given the starting state needed for First slice", "Given the seam")
        .replace(
          "- Run automated tests that cover the planned behavior.",
          "- Run the seam's tests.",
        ),
      "utf8",
    );
    assert.deepEqual(recordRows().slice(3, 5), [
      "✓ plan.md — authored",
      "○ test-guide.md — scaffold",
    ]);

    rmSync(planPath);
    assert.deepEqual(recordRows().slice(3, 4), ["○ plan.md — missing"]);
  } finally {
    db.close();
  }
});

test("CR112: continue-lifecycle closes a story only when its index is authored, as done-item does", () => {
  const project = mkdtempSync("/tmp/builder-command-cr112-continue-");
  temporaryDirectories.push(project);
  writeSiblingTree(project, { guide: false });
  const index = join(
    project,
    "docs/project/roadmap/cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first/index.md",
  );
  writeFileSync(index, renderTechnicalStoryIndex("CV1.DS1.TS1", "First slice"), "utf8");
  const db = seed("adopted", project);
  const cursorRow = () =>
    (
      db
        .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
        .get("__builder_delivery_cursor__:demo") as { metadata: string }
    ).metadata;
  const continueLifecycle = () =>
    invoke(db, [
      "continue-lifecycle",
      "--method",
      "ariad",
      "--journey",
      "demo",
      ...["--process", "p", "--project", "p", "--product", "p"],
      ...["--history-action", "h", "--roadmap-update", "r", "--next-recommendation", "n"],
    ]);
  try {
    setDeliveryCursor(
      db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.DS1.TS1",
        activeItemTitle: "First slice",
        activeItemLevel: "technical_story",
        lastDeliveryEvent: "review_complete",
        cadenceProfile: "accelerated",
        navigatorFlowUnit: "story_by_story",
      },
      { nowIso: () => NOW },
    );
    const before = cursorRow();
    const refused = continueLifecycle();
    assert.equal(refused.exitCode, 1, refused.stdout + refused.stderr);
    assert.equal(refused.stderr, "");
    assert.deepEqual(surfaceIds(refused.stdout), ["CHECKPOINT_REFUSED"]);
    assert.equal(
      cardRows(refused.stdout, "reason", "cursor"),
      asCardRows(
        "Done needs the story's own record. Still to author in docs/project/roadmap/cv1-first/cv1-ds1-alpha/cv1-ds1-ts1-first/index.md: Technical Story, Outcome, Acceptance Behavior.",
      ),
    );
    assert.equal(cursorRow(), before, "the refusal changed nothing");

    authorStoryIndex(index);
    const closed = continueLifecycle();
    assert.equal(closed.exitCode, 0, closed.stdout + closed.stderr);
    assert.deepEqual(surfaceIds(closed.stdout), ["DONE_CHECKPOINT"]);
    assert.match(cursorRow(), /"last_delivery_event": "done_complete"/u);
  } finally {
    db.close();
  }
});
