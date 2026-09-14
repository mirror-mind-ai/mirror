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
import { getAriadMethod } from "#builder/ariadMethod.ts";
import { cardText } from "#builder/card.ts";
import { surfacesForTrigger } from "#builder/commands.ts";
import { setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { setAdoptedMethod } from "#builder/methodAdoption.ts";
import { planLifecycleItem } from "#builder/plan.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/builder-command.golden.json" with { type: "json" };
import { invokeBuilderArgv } from "#helpers/builderInvoke.ts";
import { normalizePathRows, projectRelative, scrubMessage } from "#helpers/builderSurfacePaths.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
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
const PENDING_LEAVES: readonly string[] = [
  "approve-delivery-story-plan",
  "cancel-delivery-story-plan-preauthorization",
  "coherence-delivery-story",
  "done-delivery-story",
  "plan-delivery-story",
  "review-delivery-story",
  "set-flow-unit",
  "validate-delivery-story",
];

const isPorted = (entry: Case): boolean =>
  (PORTED_LEAVES as readonly string[]).includes(entry.argv[0] ?? "");
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
]);

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
    assert.match(entry.stdout, /No Builder journey is active yet\./u);
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
  // source and the empty-state frame rows appear.
  assert.match(entry.stdout, /source\nnone/u);
  // The ragged empty-state row, verbatim: 57 inner code points, not the 56 a
  // card produces.
  assert.ok(entry.stdout.includes("│ roadmap field                                      none │"));
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
