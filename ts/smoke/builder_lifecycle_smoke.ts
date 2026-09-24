// The Ariad lifecycle smoke through the production front door (CV22.DS7.US8;
// single-engine since CV22.DS10.TS5).
//
// Everything below the smoke grades a STEP: a surface, a cursor transition, a
// written artifact, an exit code. This runs whole lifecycles -- adopt through
// done, a Delivery Story closed at aggregate level, and the cadence and authority
// paths -- through the real front-door process, because a port can be right at
// each step and wrong about the state it hands the next one.
//
// Run from the repo root:  node --no-warnings ts/smoke/builder_lifecycle_smoke.ts
//
// ## What it proves
//
// Routing, lazy Builder import, production argv validation, the database and
// backup seam, stream writes, and exit status are all in the path: every step is a
// fresh `cli.ts build ...` process against a disposable home and a disposable copy
// of the fixture project. After each sequence it asserts that
//
//   * every step exited as the sequence expects -- the refusals included, since a
//     refusal inside a sequence is behavior, not a gap;
//   * an authored edit changed the authored status and published nothing;
//   * the sequence REACHED its end, read from the cursor row itself, so the checks
//     above cannot be satisfied by a lifecycle that refused its way through;
//   * no Journey projection was published anywhere (the subsystem was retired by
//     CV22.DS10.TS1, and a full lifecycle must write nothing under `.mirror/`);
//   * nothing was written into THIS repository's docs tree.
//
// ## What it no longer proves
//
// Until CV22.DS10.TS5 each step also ran on the Python engine in a twin world,
// and stdout, stderr, the Builder runtime rows (`metadata` byte for byte), and
// every authored file were compared after every step. That comparison left with
// the oracle. Byte-level behavior per surface is graded by the frozen goldens
// (`builder-lifecycle`, `builder-command`, `builder-cursor`, ...); this smoke keeps
// the one thing they cannot see, which is the sequence.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  type Dirent,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { bootstrapDatabaseIfMissing } from "../src/db/bootstrap.ts";
import { openDatabaseCopyForWrite } from "../src/db/database.ts";
import { createJourney } from "../src/journey/journeyWrite.ts";
import { activateOperatingMode } from "../src/mode/operatingMode.ts";

const TS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(TS_ROOT, "..");
const FIXTURE_PROJECT = join(TS_ROOT, "test", "fixtures", "builder-command", "project");
const SESSION_ID = "builder-lifecycle-smoke";
const JOURNEY = "demo";
const CURSOR_SESSION = `__builder_delivery_cursor__:${JOURNEY}`;
const HOME_BASENAME = "home";

// This process's own environment must not choose the database: the home is
// passed explicitly to every step.
process.env.MEMORY_ENV = "test";
process.env.MIRROR_USER = HOME_BASENAME;
delete process.env.DB_PATH;
delete process.env.MIRROR_HOME;
delete process.env.MIRROR_SESSION_ID;

/**
 * Each step's environment. `MIRROR_USER` is pinned to the home's basename rather
 * than deleted: the home resolver refuses a `MIRROR_HOME` whose basename
 * disagrees with `MIRROR_USER`, and a developer shell usually carries one. The
 * empty key keeps the run provably offline -- `build` makes no model call.
 */
function frontDoorEnvironment(home: string): Record<string, string> {
  const environment: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("MIRROR_TS_")) delete environment[key];
  }
  environment.MEMORY_ENV = "test";
  environment.MIRROR_HOME = home;
  environment.MIRROR_USER = HOME_BASENAME;
  environment.OPENROUTER_API_KEY = "";
  environment.NODE_OPTIONS = "--no-warnings";
  delete environment.DB_PATH;
  delete environment.MIRROR_SESSION_ID;
  return environment;
}

// --- reporting ----------------------------------------------------------------

const failures: string[] = [];
let checks = 0;

function check(condition: boolean, description: string, detail = ""): void {
  checks += 1;
  if (condition) return;
  failures.push(`${description}${detail ? `\n      ${detail}` : ""}`);
  process.stderr.write(`FAIL  ${description}\n      ${detail.trim()}\n`);
}

// --- the world ----------------------------------------------------------------

interface World {
  readonly home: string;
  readonly project: string;
  readonly dbPath: string;
}

mkdirSync(join(TS_ROOT, "tmp"), { recursive: true });
const root = mkdtempSync(join(TS_ROOT, "tmp", "smoke-builder-"));

/**
 * One world per SEQUENCE. Sequences do not share one: the DS flow drives the same
 * cursor row through a different state machine, and a shared world would make the
 * second sequence grade the first one's leftovers.
 */
function createWorld(sequence: string): World {
  const home = join(root, sequence, HOME_BASENAME);
  const project = join(root, sequence, "project");
  mkdirSync(home, { recursive: true });
  cpSync(FIXTURE_PROJECT, project, { recursive: true });
  const dbPath = join(home, "memory_test.db");
  bootstrapDatabaseIfMissing(dbPath);
  const db = openDatabaseCopyForWrite(dbPath);
  try {
    createJourney(
      db,
      {
        id: `journey-${JOURNEY}-smoke`,
        slug: JOURNEY,
        content: "# Demo journey\n\nA journey for the lifecycle smoke.\n",
        projectPath: project,
      },
      "2026-01-01T00:00:00Z",
    );
    activateOperatingMode(
      db,
      { mode: "Builder Mode", journey: JOURNEY, sessionId: SESSION_ID },
      "2026-01-01T00:00:00Z",
    );
  } finally {
    db.close();
  }
  return { home, project, dbPath };
}

// --- observation --------------------------------------------------------------

/** The cursor row's metadata, or null before the cursor exists. */
function cursorMetadata(world: World): string | null {
  const db = new DatabaseSync(world.dbPath, { readOnly: true });
  try {
    const row = db
      .prepare("SELECT metadata FROM runtime_sessions WHERE session_id = ?")
      .get(CURSOR_SESSION) as { metadata: string | null } | undefined;
    return row?.metadata ?? null;
  } finally {
    db.close();
  }
}

/** Authored project files. `.mirror/` is the retired publisher's tree, counted apart. */
function projectFiles(world: World): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true, encoding: "utf8" })) {
      const full = join(directory, entry.name);
      const key = relative(world.project, full).split(sep).join("/");
      if (key.startsWith(".mirror/")) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      files[key] = readFileSync(full, "utf8");
    }
  };
  walk(world.project);
  return files;
}

/** Anything under `.mirror/projections/`: published documents and receipts. */
function projections(world: World): { documents: string[]; receipts: number } {
  const publications = join(world.project, ".mirror", "projections");
  const documents: string[] = [];
  let receipts = 0;
  const walk = (directory: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const key = relative(publications, full).split(sep).join("/");
      if (key.startsWith(".receipts/")) {
        receipts += 1;
        continue;
      }
      if (entry.name === ".publication.lock") continue;
      documents.push(key);
    }
  };
  walk(publications);
  return { documents: documents.sort(), receipts };
}

function run(
  world: World,
  argv: readonly string[],
): { stdout: string; stderr: string; exitCode: number | null } {
  const result = spawnSync(
    process.execPath,
    [join(TS_ROOT, "src", "frontDoor", "cli.ts"), "build", ...argv],
    { cwd: REPO_ROOT, encoding: "utf8", env: frontDoorEnvironment(world.home) },
  );
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", exitCode: result.status };
}

// --- the lifecycle ------------------------------------------------------------

const ARIAD = ["--journey", JOURNEY, "--method", "ariad"] as const;

/**
 * A step is either an invocation or an AUTHORED EDIT.
 *
 * The edit exists because `done-delivery-story` refuses on the content of the
 * Navigator's roadmap: the Delivery Story package Ariad itself scaffolds says
 * `🟡 Planned`, so closing it requires a human to mark the work Done. It is a
 * step rather than a hidden `writeFileSync` because it has checks of its own:
 * the edit must actually change the authored status, and -- an authored edit
 * not being a cursor write -- it must publish nothing.
 */
type Step =
  | {
      readonly kind: "command";
      readonly label: string;
      readonly argv: readonly string[];
      /** The expected exit status: a refusal is behavior, not a gap. */
      readonly exit: number;
    }
  | {
      readonly kind: "edit";
      readonly label: string;
      readonly edit: (project: string) => void;
    };

function command(label: string, argv: readonly string[], exit = 0): Step {
  return { kind: "command", label, argv, exit };
}

const STORY_STEPS: readonly Step[] = [
  command("inspect-method before adoption", ["inspect-method", "--journey", JOURNEY], 0),
  command("adopt", ["adopt", ...ARIAD], 0),
  command("prepare-templates", ["prepare-templates", ...ARIAD], 0),
  command("sync-cursor", ["sync-cursor", ...ARIAD], 0),
  command("pull-candidates", ["pull-candidates", ...ARIAD], 0),
  command(
    "pull-item",
    [
      "pull-item",
      ...ARIAD,
      "--item-code",
      "CV1.DS1.US1",
      "--item-title",
      "A user story",
      "--item-level",
      "user_story",
      "--why-now",
      "The lifecycle smoke needs one implementable story.",
    ],
    0,
  ),
  command("prepare-item", ["prepare-item", ...ARIAD], 0),
  // A refusal INSIDE the sequence, not a seeded one: implementation before a Plan
  // exists is blocked, and the guard renders a surface on stdout while exiting 1.
  command("check-implementation before a plan", ["check-implementation", ...ARIAD], 1),
  command("plan-item", ["plan-item", ...ARIAD], 0),
  // The second refusal: closure cannot skip the pending Plan approval.
  command(
    "done-item while the plan checkpoint is pending",
    [
      "done-item",
      ...ARIAD,
      "--history-action",
      "premature",
      "--roadmap-update",
      "premature",
      "--next-recommendation",
      "premature",
    ],
    1,
  ),
  command("approve-plan", ["approve-plan", ...ARIAD], 0),
  command("check-implementation after approval", ["check-implementation", ...ARIAD], 0),
  command(
    "validate-item",
    [
      "validate-item",
      ...ARIAD,
      "--implementation-complete",
      "--check",
      "node --test ts/test/builder",
      "--checks-status",
      "passed",
      "--e2e-decision",
      "not_required",
      "--e2e-evidence",
      "The smoke itself is the end-to-end route.",
      "--navigator-route",
      "Run the smoke and read the report.",
      "--navigator-accepted",
      "--expected-observation",
      "Every step exits as the sequence expects.",
      "--pass-condition",
      "No check fails.",
      "--fail-condition",
      "Any check fails.",
    ],
    0,
  ),
  command(
    "review-item",
    ["review-item", ...ARIAD, "--debt", "No debt found", "--decision", "no_action"],
    0,
  ),
  command(
    "coherence-item",
    [
      "coherence-item",
      ...ARIAD,
      "--process",
      "The lifecycle ran in its documented order.",
      "--project",
      "The story package carries the plan and the closure artifacts.",
      "--product",
      "Ariad behavior is unchanged.",
    ],
    0,
  ),
  command(
    "done-item",
    [
      "done-item",
      ...ARIAD,
      "--history-action",
      "Committed as the plateau-4 smoke.",
      "--roadmap-update",
      "The story package records the closure.",
      "--next-recommendation",
      "Pull the next story.",
    ],
    0,
  ),
  // Reads after closure: the state the lifecycle left is the state orientation sees.
  command("pull-candidates after done", ["pull-candidates", ...ARIAD], 0),
  command("inspect-method after done", ["inspect-method", "--journey", JOURNEY], 0),
];

/** The plateau-3 lesson: a run that writes into THIS repository must fail loudly. */
function repositoryFingerprint(): string[] {
  const docs = join(REPO_ROOT, "docs");
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true, encoding: "utf8" })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      found.push(relative(REPO_ROOT, full));
    }
  };
  walk(docs);
  return found.sort();
}

const fingerprintBefore = repositoryFingerprint();

/**
 * The Delivery Story flow: choose the aggregate unit, pull a Delivery Story (which
 * expands it into children), plan and approve at DS level, close it — and get
 * REFUSED by the authored preflight, because Ariad's own scaffold writes
 * `🟡 Planned` and only a human may say the work is Done. Then the edit, then the
 * close that succeeds.
 */
const PLANNED = "**Status:** 🟡 Planned";
const DONE = "**Status:** ✅ Done";

/** The authored edit: mark the package, its children, and the table rows Done. */
function markDeliveryStoryDone(project: string): void {
  const packageRoot = join(project, "docs/project/roadmap/cv1-first/cv1-ds2-pullable");
  const touch = (path: string): void => {
    if (!existsSync(path)) return;
    const before = readFileSync(path, "utf8");
    const after = before.replaceAll(PLANNED, DONE).replaceAll("| 🟡 Planned |", "| ✅ Done |");
    if (after !== before) writeFileSync(path, after, "utf8");
  };
  touch(join(packageRoot, "index.md"));
  for (const entry of readdirSync(packageRoot, { withFileTypes: true, encoding: "utf8" })) {
    if (entry.isDirectory()) touch(join(packageRoot, entry.name, "index.md"));
  }
}

const DS_STEPS: readonly Step[] = [
  command("adopt", ["adopt", ...ARIAD]),
  command("sync-cursor", ["sync-cursor", ...ARIAD]),
  // Pulling a Delivery Story also EXPANDS it, so this one step exercises the
  // candidate-table grammar and materializes both child packages.
  command("pull-item (delivery story, expands)", [
    "pull-item",
    ...ARIAD,
    "--item-code",
    "CV1.DS2",
    "--item-title",
    "Pullable delivery story",
    "--item-level",
    "delivery_story",
    "--why-now",
    "The aggregate smoke needs a Delivery Story with children.",
  ]),
  // Before the flow unit is chosen, the DS verbs must refuse: the default is
  // story_by_story, and the flow unit is the gate rather than the item level.
  command(
    "plan-delivery-story before the flow unit is chosen",
    ["plan-delivery-story", ...ARIAD, "--objective", "Too early.", "--child", "CV1.DS2.US1"],
    1,
  ),
  command("set-flow-unit delivery_story", ["set-flow-unit", ...ARIAD, "--unit", "delivery_story"]),
  command("plan-delivery-story", [
    "plan-delivery-story",
    ...ARIAD,
    "--objective",
    "Deliver both children as one coherent outcome.",
    "--child",
    "CV1.DS2.US1",
    "--child",
    "CV1.DS2.TS1",
  ]),
  command("approve-delivery-story-plan", ["approve-delivery-story-plan", ...ARIAD]),
  command("validate-delivery-story", [
    "validate-delivery-story",
    ...ARIAD,
    "--summary",
    "Both children behave as one delivery.",
    "--navigator-accepted",
  ]),
  command("review-delivery-story", [
    "review-delivery-story",
    ...ARIAD,
    "--decision",
    "no_action",
    "--summary",
    "No aggregate debt found.",
  ]),
  // The preflight refusal: the authored roadmap still says Planned.
  command(
    "done-delivery-story refused by the authored preflight",
    ["done-delivery-story", ...ARIAD, "--summary", "Too early."],
    1,
  ),
  {
    kind: "edit",
    label: "a human marks the Delivery Story and its children Done",
    edit: markDeliveryStoryDone,
  },
  command("done-delivery-story", [
    "done-delivery-story",
    ...ARIAD,
    "--summary",
    "Aggregate closure recorded.",
  ]),
];

/** A Delivery Story package with a canonical candidate table, for Expand to read. */
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

/**
 * Cadence and authority: the paths that decide what may happen WITHOUT asking.
 *
 * It ends at a Plan checkpoint rather than at Done, because that is the honest end
 * of this sequence — conditional authority exists to cross the Plan gate, and the
 * gate it must never cross is Navigator Validation.
 */
const CADENCE_STEPS: readonly Step[] = [
  command("adopt", ["adopt", ...ARIAD]),
  command("sync-cursor", ["sync-cursor", ...ARIAD]),
  command("pull-item", [
    "pull-item",
    ...ARIAD,
    "--item-code",
    "CV1.DS1.US1",
    "--item-title",
    "A user story",
    "--item-level",
    "user_story",
    "--why-now",
    "The cadence smoke needs an implementable story.",
  ]),
  command("prepare-item", ["prepare-item", ...ARIAD]),
  // Release intent belongs to the Delivery Story ANCESTOR, so it is readable from
  // a child story and reports `not_recorded` before anything is decided.
  command("release-intent (inspect)", ["release-intent", ...ARIAD]),
  command("release-intent planned", ["release-intent", ...ARIAD, "--intent", "planned"]),
  command("release-intent (inspect again)", ["release-intent", ...ARIAD]),
  // `sync-cursor` leaves cadence at stepwise, which refuses to continue at all.
  command(
    "continue-lifecycle refuses under stepwise",
    [
      "continue-lifecycle",
      ...ARIAD,
      "--history-action",
      "none",
      "--roadmap-update",
      "none",
      "--next-recommendation",
      "none",
    ],
    1,
  ),
  command(
    "set-cadence autonomous without limits",
    ["set-cadence", ...ARIAD, "--profile", "autonomous"],
    1,
  ),
  command("set-cadence checkpoint", ["set-cadence", ...ARIAD, "--profile", "checkpoint"]),
  // Under checkpoint the cadence guard passes and the LIFECYCLE guard refuses
  // instead: a prepared story has no bypassable continuation.
  command(
    "continue-lifecycle refuses an unbypassable event",
    [
      "continue-lifecycle",
      ...ARIAD,
      "--history-action",
      "none",
      "--roadmap-update",
      "none",
      "--next-recommendation",
      "none",
    ],
    1,
  ),
  // Bounded story authority: recorded, then withdrawn, leaving the ordinary gate.
  command("plan-item --preauthorize-approval", [
    "plan-item",
    ...ARIAD,
    "--preauthorize-approval",
    "--stop-after",
    "navigator_validation",
  ]),
  command("cancel-plan-preauthorization", ["cancel-plan-preauthorization", ...ARIAD]),
  command("cancel-plan-preauthorization again", ["cancel-plan-preauthorization", ...ARIAD], 1),
  // The withdrawal did not consume the Plan gate: ordinary approval still works.
  command("approve-plan", ["approve-plan", ...ARIAD]),
  command("check-implementation after approval", ["check-implementation", ...ARIAD]),
];

function runSequence(name: string, steps: readonly Step[], seed?: (project: string) => void): void {
  const world = createWorld(name);
  seed?.(world.project);

  for (const step of steps) {
    const where = `${name} / ${step.label}`;
    if (step.kind === "edit") {
      const before = projections(world);
      step.edit(world.project);
      check(
        projections(world).receipts === before.receipts,
        `${where}: the edit published nothing`,
        `${before.receipts} → ${projections(world).receipts}`,
      );
      check(
        Object.values(projectFiles(world)).some((content) => content.includes(DONE)),
        `${where}: the edit actually changed the authored status`,
      );
      continue;
    }
    const outcome = run(world, step.argv);
    check(
      outcome.exitCode === step.exit,
      `${where}: exits ${step.exit}`,
      `exit=${outcome.exitCode} stderr=${outcome.stderr.trim()}`,
    );
  }

  sequenceOutcome(name, world);
}

/**
 * A sequence must actually REACH its end, or every exit-code check above could
 * have been a lifecycle refusing its way through.
 */
function sequenceOutcome(name: string, world: World): void {
  const event =
    name === "ds"
      ? "delivery_story_done_complete"
      : name === "cd"
        ? "plan_approved"
        : "done_complete";
  const metadata = cursorMetadata(world) ?? "<no cursor>";
  check(
    metadata.includes(`"last_delivery_event": "${event}"`),
    `${name}: the lifecycle reached ${event}`,
    metadata,
  );
  // CV22.DS10.TS1 retired the Journey projection subsystem: a full Ariad
  // lifecycle, on a real project, writes nothing under `.mirror/`.
  check(
    projections(world).documents.length === 0 && projections(world).receipts === 0,
    `${name}: the run published no Journey projection`,
    JSON.stringify(projections(world)),
  );
}

runSequence("story", STORY_STEPS);
runSequence("ds", DS_STEPS, (project) => {
  const target = join(project, "docs/project/roadmap/cv1-first/cv1-ds2-pullable/index.md");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, PULLABLE_DS_INDEX, "utf8");
});
runSequence("cd", CADENCE_STEPS);

check(
  JSON.stringify(fingerprintBefore) === JSON.stringify(repositoryFingerprint()),
  "the smoke wrote nothing into this repository's docs tree",
);

// --- report -------------------------------------------------------------------

process.stdout.write(`\n${checks - failures.length}/${checks} checks passed\n`);
if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} failing:\n`);
  for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
  process.stdout.write(`\nworlds kept for inspection: ${root}\n`);
  process.exit(1);
}
rmSync(root, { recursive: true, force: true });
process.stdout.write("builder lifecycle smoke: every sequence reached its end\n");
