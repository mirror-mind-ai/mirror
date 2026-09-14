// CV22.DS7.US8 plateau 4 — the unrouted Ariad story-lifecycle smoke.
//
// Everything before this graded a STEP: a surface, a cursor transition, a written
// artifact, an exit code. This runs a whole lifecycle — adopt through done — on
// both engines and compares what each left behind after every step, which is the
// only way to see a composition defect: a port can be right at each step and wrong
// about the state it hands the next one.
//
// Run from the repo root:  node --no-warnings ts/parity/builder_lifecycle_smoke.ts
//
// ## Two worlds, never one
//
// Each engine gets its own disposable home, its own database, and its own copy of
// the scratch project. That is not tidiness: at plateau 3 a shared tree made the
// second engine report `existing` where the first reported `created`, so a shared
// world would grade the SEQUENCE of two engines instead of each engine's behavior.
//
// The two roots are deliberately the SAME LENGTH (`.../py/...` and `.../ts/...`).
// `cardPrefixed` wraps at a fixed code-point count, so the root's length decides
// where a wrapped path splits — two roots of different lengths would produce
// different row counts and a diff that is an artifact of the harness.
//
// ## What "unrouted" means here, and what it does not prove
//
// `routing.ts` is untouched until plateau 8, so there is no gate to set and no
// route to take: the Python side is the shipped default by construction, and the
// TypeScript side is invoked through `invokeBuilderArgv`, in process, returning the
// `CommandResult` its leaves produce. So this smoke does NOT grade the TypeScript
// side's stream mechanics — how the bytes reach a terminal, and the exit status a
// shell observes. Plateau 8 owns that by construction, when the front door route
// exists; the command corpus already pins the bytes themselves against Python's
// real subprocess output. Stating the limit is the point: a smoke that overclaims
// is worse than one that claims less.
//
// The environment assertion is real today and load-bearing later: the smoke refuses
// to run with `MIRROR_TS_BUILD` set, and strips every `MIRROR_TS_*` from the Python
// side's environment, so at plateau 9 the same file proves the flip rather than a
// configuration.
//
// ## What is graded after EVERY step
//
//   * stdout, stderr, exit code (paths normalized per world, see `normalize`);
//   * the Builder runtime rows — cursor and method adoption — as whole rows, with
//     `metadata` compared BYTE FOR BYTE. The write probe canonicalizes that cell;
//     this does not, because compare-and-swap matches on that exact string and the
//     `MIRROR_TS_BUILD=0` revert is only sound if the bytes agree (D2);
//   * every authored project file and its content;
//   * the Journey projection seam: which documents were published, and how many
//     receipts. US7 shipped a seam that silently stopped publishing, so the
//     assertion is the published FILE, never a log line.

import { spawnSync } from "node:child_process";
import {
  cpSync,
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
import { createPythonProjectionRefresh } from "../src/explorer/projectionRefresh.ts";
import { createJourney } from "../src/journey/journeyWrite.ts";
import { activateOperatingMode } from "../src/mode/operatingMode.ts";
import { invokeBuilderArgv } from "../test/helpers/builderInvoke.ts";
import {
  absolutePathsIn,
  normalizePathRows,
  projectRelative,
} from "../test/helpers/builderSurfacePaths.ts";

const TS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(TS_ROOT, "..");
const FIXTURE_PROJECT = join(TS_ROOT, "test", "fixtures", "builder-command", "project");
const SESSION_ID = "builder-lifecycle-smoke";
const JOURNEY = "demo";
const CURSOR_SESSION = `__builder_delivery_cursor__:${JOURNEY}`;
const ADOPTION_SESSION = `__builder_method_adoption__:${JOURNEY}`;
const ROW_COLUMNS = [
  "session_id",
  "interface",
  "journey",
  "active",
  "started_at",
  "updated_at",
  "closed_at",
  "metadata",
] as const;

// --- the environment contract -------------------------------------------------

if (process.env.MIRROR_TS_BUILD !== undefined) {
  process.stderr.write(
    "refusing to run: MIRROR_TS_BUILD is set. This smoke proves the SHIPPED default,\n" +
      "so it must run with no Builder gate in the environment.\n",
  );
  process.exit(2);
}

// Both worlds' homes are named `home` on purpose, and `MIRROR_USER` is pinned to
// that basename rather than deleted. `memory.config` re-applies the repository
// `.env` at import with `setdefault`, so a DELETED `MIRROR_USER` comes back as the
// developer's real user — and `resolve_mirror_home` REFUSES the pair when
// `MIRROR_HOME`'s basename disagrees with `MIRROR_USER`. Measured: with it deleted,
// every Python step exited 2 with "Mirror home is not configured" and the smoke was
// comparing TypeScript against nothing.
const HOME_BASENAME = "home";

// The projection seam spawns Python and resolves its own database from the home it
// is handed, so this process's own environment decides which database that is.
process.env.MEMORY_ENV = "test";
process.env.MIRROR_USER = HOME_BASENAME;
delete process.env.DB_PATH;
delete process.env.MIRROR_HOME;
delete process.env.MIRROR_SESSION_ID;

/** The Python side's environment: no Mirror TS gate can be inherited from a shell. */
function pythonEnvironment(home: string): Record<string, string> {
  const environment: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("MIRROR_TS_")) delete environment[key];
  }
  environment.MEMORY_ENV = "test";
  environment.MIRROR_HOME = home;
  environment.MIRROR_USER = HOME_BASENAME;
  delete environment.DB_PATH;
  delete environment.MIRROR_SESSION_ID;
  // `build` makes no model call (US8's seam boundary), and `memory.config`
  // re-applies a repository `.env` at import with `setdefault`, so a deleted key
  // comes back. Empty rather than absent keeps the run provably offline.
  environment.OPENROUTER_API_KEY = "";
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

function firstDifference(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  for (let index = 0; index < Math.max(expectedLines.length, actualLines.length); index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return `line ${index + 1}:\n      python: ${JSON.stringify(expectedLines[index])}\n      ts:     ${JSON.stringify(actualLines[index])}`;
    }
  }
  return "";
}

// --- the two worlds -----------------------------------------------------------

interface World {
  readonly name: "py" | "ts";
  readonly home: string;
  readonly project: string;
  readonly dbPath: string;
}

mkdirSync(join(TS_ROOT, "tmp"), { recursive: true });
const root = mkdtempSync(join(TS_ROOT, "tmp", "smoke-builder-"));

/**
 * One pair of worlds per SEQUENCE, under a two-character directory so the two
 * project roots stay the same length. Sequences do not share worlds: the DS flow
 * drives the same cursor row through a different state machine, and a shared world
 * would make the second sequence grade the first one's leftovers.
 */
function createWorld(sequence: string, name: "py" | "ts"): World {
  const home = join(root, sequence, name, HOME_BASENAME);
  const project = join(root, sequence, name, "project");
  mkdirSync(home, { recursive: true });
  cpSync(FIXTURE_PROJECT, project, { recursive: true });
  const dbPath = join(home, "memory_test.db");
  // TypeScript owns the schema since DS6, so both engines start from a database
  // TypeScript bootstrapped — which also means the Python side reads rows the port
  // wrote, before it writes any of its own.
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
  return { name, home, project, dbPath };
}

interface WorldPair {
  readonly python: World;
  readonly typescript: World;
}

function createWorldPair(sequence: string): WorldPair {
  const pair = {
    python: createWorld(sequence, "py"),
    typescript: createWorld(sequence, "ts"),
  };
  check(
    pair.python.project.length === pair.typescript.project.length,
    `${sequence}: the two project roots are the same length`,
    `py=${pair.python.project} ts=${pair.typescript.project}`,
  );
  return pair;
}

// --- observation --------------------------------------------------------------

/**
 * Make one engine's output comparable with the other's.
 *
 * Wrapped path rows collapse to a token (their split points depend on the root),
 * and any untruncated absolute path inside this world is rewritten
 * project-relative. Same rule as the command corpus, applied per world rather than
 * per machine.
 */
function normalize(text: string, world: World): string {
  if (text === "") return text;
  const absolute: string[] = [world.project, world.home, root];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      absolute.push(full);
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(world.project);
  absolute.sort((a, b) => b.length - a.length);
  let result = normalizePathRows(text, absolute);
  for (const path of absolutePathsIn(result)) {
    if (path.startsWith(world.project)) {
      result = result.replaceAll(path, projectRelative(path, world.project));
    } else if (path.startsWith(world.home)) {
      result = result.replaceAll(path, `<HOME>/${projectRelative(path, world.home)}`);
    }
  }
  return result.replaceAll(world.project, "<PROJECT>").replaceAll(world.home, "<HOME>");
}

/** The Builder runtime rows, whole, with only the clock normalized. */
function runtimeRows(world: World): Record<string, Record<string, string>> {
  const db = new DatabaseSync(world.dbPath, { readOnly: true });
  try {
    const rows: Record<string, Record<string, string>> = {};
    for (const sessionId of [ADOPTION_SESSION, CURSOR_SESSION]) {
      const row = db
        .prepare(`SELECT ${ROW_COLUMNS.join(", ")} FROM runtime_sessions WHERE session_id = ?`)
        .get(sessionId) as Record<string, unknown> | undefined;
      if (row === undefined) continue;
      const recorded: Record<string, string> = {};
      for (const column of ROW_COLUMNS) {
        const value = row[column];
        // The timestamps are the one part two runs cannot share. Their PRESENCE is
        // behavior (`started_at` proves the upsert preserved a pre-existing row),
        // their value is a clock reading.
        recorded[column] =
          column.endsWith("_at") && value !== null ? "<WHEN>" : String(value ?? "<null>");
      }
      rows[sessionId] = recorded;
    }
    return rows;
  } finally {
    db.close();
  }
}

/** Authored project files. `.mirror/` is the publisher's tree, summarized apart. */
function projectFiles(world: World): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
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
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * The projection seam's observable result: what was published, and how many
 * receipts. Receipt NAMES are uuid4 and their digests are content stamps, so the
 * count is the part that is behavior — it says the refresh fired at the call sites
 * Python fires it at, which is exactly what a port loses silently.
 */
function projections(world: World): { documents: string[]; receipts: number } {
  const publications = join(world.project, ".mirror", "projections");
  const documents: string[] = [];
  let receipts = 0;
  const walk = (directory: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
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

interface Observation {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  rows: Record<string, Record<string, string>>;
  files: Record<string, string>;
  projections: { documents: string[]; receipts: number };
}

// --- the two engines ----------------------------------------------------------

function observe(world: World, outcome: { stdout: string; stderr: string; exitCode: number | null }): Observation {
  return {
    stdout: normalize(outcome.stdout, world),
    stderr: normalize(outcome.stderr, world),
    exitCode: outcome.exitCode,
    rows: runtimeRows(world),
    files: projectFiles(world),
    projections: projections(world),
  };
}

function runPython(world: World, argv: readonly string[]): Observation {
  const result = spawnSync("uv", ["run", "python", "-m", "memory", "build", ...argv], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: pythonEnvironment(world.home),
  });
  return observe(world, {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status,
  });
}

/** One seam per world: it spawns Python with that world's home. */
const projectionSeams = new Map<string, ReturnType<typeof createPythonProjectionRefresh>>();
function projectionSeamFor(world: World) {
  const existing = projectionSeams.get(world.home);
  if (existing !== undefined) return existing;
  const seam = createPythonProjectionRefresh({ mirrorHome: world.home });
  projectionSeams.set(world.home, seam);
  return seam;
}

function runTypeScript(world: World, argv: readonly string[]): Observation {
  // A connection per invocation, closed before the state is read: the real front
  // door is one process per command, and a long-lived handle would let this smoke
  // pass on a cache Python never sees.
  const seam = projectionSeamFor(world);
  const db = openDatabaseCopyForWrite(world.dbPath);
  let outcome: { stdout: string; stderr: string; exitCode: number };
  try {
    outcome = invokeBuilderArgv(db, argv, {
      nowIso: () => new Date().toISOString(),
      requestProjectionRefresh: (journey) => seam.request(journey),
    });
  } finally {
    db.close();
  }
  return observe(world, outcome);
}

// --- the lifecycle ------------------------------------------------------------

const ARIAD = ["--journey", JOURNEY, "--method", "ariad"] as const;

/**
 * A step is either an invocation or an AUTHORED EDIT.
 *
 * The edit exists because `done-delivery-story` refuses on the content of the
 * Navigator's roadmap: the Delivery Story package Ariad itself scaffolds says
 * `🟡 Planned`, so closing it requires a human to mark the work Done. Replaying
 * that as a `writeFileSync` between two invocations would hide the one thing worth
 * grading — that the same edit lands identically in both worlds — so it is a step
 * with the same comparison as any other, plus one of its own: an authored edit is
 * not a cursor write, so it must produce ZERO new projection receipts.
 */
type Step =
  | {
      readonly kind: "command";
      readonly label: string;
      readonly argv: readonly string[];
      /** The expected status on BOTH engines: a refusal is behavior, not a gap. */
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
      "The lifecycle smoke needs one implementable story.",
    ], 0),
  command("prepare-item", ["prepare-item", ...ARIAD], 0),
  // A refusal INSIDE the sequence, not a seeded one: implementation before a Plan
  // exists is blocked, and the guard renders a surface on stdout while exiting 1.
  command("check-implementation before a plan", ["check-implementation", ...ARIAD], 1),
  command("plan-item", ["plan-item", ...ARIAD], 0),
  // The second refusal: closure cannot skip the pending Plan approval.
  command("done-item while the plan checkpoint is pending", [
      "done-item",
      ...ARIAD,
      "--history-action",
      "premature",
      "--roadmap-update",
      "premature",
      "--next-recommendation",
      "premature",
    ], 1),
  command("approve-plan", ["approve-plan", ...ARIAD], 0),
  command("check-implementation after approval", ["check-implementation", ...ARIAD], 0),
  command("validate-item", [
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
      "Both engines agree after every step.",
      "--pass-condition",
      "No difference is reported.",
      "--fail-condition",
      "Any difference is reported.",
    ], 0),
  command("review-item", ["review-item", ...ARIAD, "--debt", "No debt found", "--decision", "no_action"], 0),
  command("coherence-item", [
      "coherence-item",
      ...ARIAD,
      "--process",
      "The lifecycle ran in its documented order.",
      "--project",
      "The story package carries the plan and the closure artifacts.",
      "--product",
      "Ariad behavior is unchanged.",
    ], 0),
  command("done-item", [
      "done-item",
      ...ARIAD,
      "--history-action",
      "Committed as the plateau-4 smoke.",
      "--roadmap-update",
      "The story package records the closure.",
      "--next-recommendation",
      "Pull the next story.",
    ], 0),
  // Reads after closure: the state the lifecycle left is the state orientation sees.
  command("pull-candidates after done", ["pull-candidates", ...ARIAD], 0),
  command("inspect-method after done", ["inspect-method", "--journey", JOURNEY], 0),
];

/** The plateau-3 lesson: a run that writes into THIS repository must fail loudly. */
function repositoryFingerprint(): string[] {
  const docs = join(REPO_ROOT, "docs");
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
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
    const after = before
      .replaceAll(PLANNED, DONE)
      .replaceAll("| 🟡 Planned |", "| ✅ Done |");
    if (after !== before) writeFileSync(path, after, "utf8");
  };
  touch(join(packageRoot, "index.md"));
  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
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
    [
      "plan-delivery-story",
      ...ARIAD,
      "--objective",
      "Too early.",
      "--child",
      "CV1.DS2.US1",
    ],
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
  command(
    "cancel-plan-preauthorization again",
    ["cancel-plan-preauthorization", ...ARIAD],
    1,
  ),
  // The withdrawal did not consume the Plan gate: ordinary approval still works.
  command("approve-plan", ["approve-plan", ...ARIAD]),
  command("check-implementation after approval", ["check-implementation", ...ARIAD]),
];

function runSequence(name: string, steps: readonly Step[], seed?: (project: string) => void): void {
  const { python, typescript } = createWorldPair(name);
  for (const world of [python, typescript]) seed?.(world.project);

  for (const step of steps) {
    if (step.kind === "edit") {
      const before = { python: projections(python), typescript: projections(typescript) };
      for (const world of [python, typescript]) step.edit(world.project);
      const expected = observe(python, { stdout: "", stderr: "", exitCode: 0 });
      const actual = observe(typescript, { stdout: "", stderr: "", exitCode: 0 });
      compareFiles(`${name} / ${step.label}`, expected, actual);
      // An authored edit is not a cursor write, so nothing may be published by it.
      check(
        expected.projections.receipts === before.python.receipts &&
          actual.projections.receipts === before.typescript.receipts,
        `${name} / ${step.label}: the edit published nothing`,
        `python ${before.python.receipts}→${expected.projections.receipts}, ` +
          `ts ${before.typescript.receipts}→${actual.projections.receipts}`,
      );
      check(
        Object.values(expected.files).some((content) => content.includes(DONE)),
        `${name} / ${step.label}: the edit actually changed the authored status`,
      );
      continue;
    }
    const expected = runPython(python, step.argv);
    const actual = runTypeScript(typescript, step.argv);
    const where = `${name} / ${step.label}`;

    check(
      expected.exitCode === step.exit,
      `${where}: python exits ${step.exit}`,
      `exit=${expected.exitCode} stderr=${expected.stderr.trim()}`,
    );
    check(
      actual.exitCode === step.exit,
      `${where}: typescript exits ${step.exit}`,
      `exit=${actual.exitCode} stderr=${actual.stderr.trim()}`,
    );
    check(
      expected.stdout === actual.stdout,
      `${where}: stdout is identical`,
      firstDifference(expected.stdout, actual.stdout),
    );
    check(
      expected.stderr === actual.stderr,
      `${where}: stderr is identical`,
      firstDifference(expected.stderr, actual.stderr),
    );
    check(
      JSON.stringify(expected.rows) === JSON.stringify(actual.rows),
      `${where}: the Builder runtime rows are identical, metadata byte for byte`,
      firstDifference(
        JSON.stringify(expected.rows, null, 2),
        JSON.stringify(actual.rows, null, 2),
      ),
    );
    compareFiles(where, expected, actual);
    check(
      JSON.stringify(expected.projections) === JSON.stringify(actual.projections),
      `${where}: the projection seam published the same documents and receipts`,
      `python=${JSON.stringify(expected.projections)} ts=${JSON.stringify(actual.projections)}`,
    );
  }

  return sequenceOutcome(name, python, typescript);
}

function compareFiles(where: string, expected: Observation, actual: Observation): void {
  check(
    JSON.stringify(Object.keys(expected.files)) === JSON.stringify(Object.keys(actual.files)),
    `${where}: the same project files exist`,
    `python=${Object.keys(expected.files).length} ts=${Object.keys(actual.files).length}`,
  );
  for (const [path, content] of Object.entries(expected.files)) {
    if (actual.files[path] === content) continue;
    check(
      false,
      `${where}: ${path} is byte-identical`,
      firstDifference(content, actual.files[path] ?? "<absent>"),
    );
  }
}

/**
 * A sequence must actually REACH its end, or every comparison above could have been
 * two engines agreeing on a refusal.
 */
function sequenceOutcome(name: string, python: World, typescript: World): void {
  const event =
    name === "ds"
      ? "delivery_story_done_complete"
      : name === "cd"
        ? "plan_approved"
        : "done_complete";
  const marker = `"last_delivery_event": "${event}"`;
  for (const world of [python, typescript]) {
    check(
      (runtimeRows(world)[CURSOR_SESSION]?.metadata ?? "").includes(marker),
      `${name}: the lifecycle reached ${event} on the ${world.name} engine`,
      runtimeRows(world)[CURSOR_SESSION]?.metadata ?? "<no cursor>",
    );
  }
  check(
    projections(typescript).documents.some((document) => document.endsWith("operational.json")),
    `${name}: the TypeScript run published an operational projection through the Python seam`,
    JSON.stringify(projections(typescript)),
  );
}

runSequence("story", STORY_STEPS);
runSequence("ds", DS_STEPS, (project) => {
  const target = join(project, "docs/project/roadmap/cv1-first/cv1-ds2-pullable/index.md");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, PULLABLE_DS_INDEX, "utf8");
});
// `cd`, two characters like the others: the project roots must stay equal-length.
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
process.stdout.write("builder lifecycle smoke: both engines agree at every step\n");
