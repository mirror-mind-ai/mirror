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
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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

function createWorld(name: "py" | "ts"): World {
  const home = join(root, name, HOME_BASENAME);
  const project = join(root, name, "project");
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

const python = createWorld("py");
const typescript = createWorld("ts");

check(
  python.project.length === typescript.project.length,
  "the two project roots are the same length",
  `py=${python.project} ts=${typescript.project}`,
);

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

function runPython(argv: readonly string[]): Observation {
  const result = spawnSync("uv", ["run", "python", "-m", "memory", "build", ...argv], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: pythonEnvironment(python.home),
  });
  return {
    stdout: normalize(result.stdout ?? "", python),
    stderr: normalize(result.stderr ?? "", python),
    exitCode: result.status,
    rows: runtimeRows(python),
    files: projectFiles(python),
    projections: projections(python),
  };
}

const projectionSeam = createPythonProjectionRefresh({ mirrorHome: typescript.home });

function runTypeScript(argv: readonly string[]): Observation {
  // A connection per invocation, closed before the state is read: the real front
  // door is one process per command, and a long-lived handle would let this smoke
  // pass on a cache Python never sees.
  const db = openDatabaseCopyForWrite(typescript.dbPath);
  let outcome: { stdout: string; stderr: string; exitCode: number };
  try {
    outcome = invokeBuilderArgv(db, argv, {
      nowIso: () => new Date().toISOString(),
      requestProjectionRefresh: (journey) => projectionSeam.request(journey),
    });
  } finally {
    db.close();
  }
  return {
    stdout: normalize(outcome.stdout, typescript),
    stderr: normalize(outcome.stderr, typescript),
    exitCode: outcome.exitCode,
    rows: runtimeRows(typescript),
    files: projectFiles(typescript),
    projections: projections(typescript),
  };
}

// --- the lifecycle ------------------------------------------------------------

const ARIAD = ["--journey", JOURNEY, "--method", "ariad"] as const;

/** `exit` is the expected status on BOTH engines: a refusal is behavior, not a gap. */
interface Step {
  readonly label: string;
  readonly argv: readonly string[];
  readonly exit: number;
}

const STEPS: readonly Step[] = [
  { label: "inspect-method before adoption", argv: ["inspect-method", "--journey", JOURNEY], exit: 0 },
  { label: "adopt", argv: ["adopt", ...ARIAD], exit: 0 },
  { label: "prepare-templates", argv: ["prepare-templates", ...ARIAD], exit: 0 },
  { label: "sync-cursor", argv: ["sync-cursor", ...ARIAD], exit: 0 },
  { label: "pull-candidates", argv: ["pull-candidates", ...ARIAD], exit: 0 },
  {
    label: "pull-item",
    argv: [
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
    exit: 0,
  },
  { label: "prepare-item", argv: ["prepare-item", ...ARIAD], exit: 0 },
  // A refusal INSIDE the sequence, not a seeded one: implementation before a Plan
  // exists is blocked, and the guard renders a surface on stdout while exiting 1.
  { label: "check-implementation before a plan", argv: ["check-implementation", ...ARIAD], exit: 1 },
  { label: "plan-item", argv: ["plan-item", ...ARIAD], exit: 0 },
  // The second refusal: closure cannot skip the pending Plan approval.
  {
    label: "done-item while the plan checkpoint is pending",
    argv: [
      "done-item",
      ...ARIAD,
      "--history-action",
      "premature",
      "--roadmap-update",
      "premature",
      "--next-recommendation",
      "premature",
    ],
    exit: 1,
  },
  { label: "approve-plan", argv: ["approve-plan", ...ARIAD], exit: 0 },
  { label: "check-implementation after approval", argv: ["check-implementation", ...ARIAD], exit: 0 },
  {
    label: "validate-item",
    argv: [
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
    ],
    exit: 0,
  },
  {
    label: "review-item",
    argv: ["review-item", ...ARIAD, "--debt", "No debt found", "--decision", "no_action"],
    exit: 0,
  },
  {
    label: "coherence-item",
    argv: [
      "coherence-item",
      ...ARIAD,
      "--process",
      "The lifecycle ran in its documented order.",
      "--project",
      "The story package carries the plan and the closure artifacts.",
      "--product",
      "Ariad behavior is unchanged.",
    ],
    exit: 0,
  },
  {
    label: "done-item",
    argv: [
      "done-item",
      ...ARIAD,
      "--history-action",
      "Committed as the plateau-4 smoke.",
      "--roadmap-update",
      "The story package records the closure.",
      "--next-recommendation",
      "Pull the next story.",
    ],
    exit: 0,
  },
  // Reads after closure: the state the lifecycle left is the state orientation sees.
  { label: "pull-candidates after done", argv: ["pull-candidates", ...ARIAD], exit: 0 },
  { label: "inspect-method after done", argv: ["inspect-method", "--journey", JOURNEY], exit: 0 },
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

for (const step of STEPS) {
  const expected = runPython(step.argv);
  const actual = runTypeScript(step.argv);

  check(
    expected.exitCode === step.exit,
    `${step.label}: python exits ${step.exit}`,
    `exit=${expected.exitCode} stderr=${expected.stderr.trim()}`,
  );
  check(
    actual.exitCode === step.exit,
    `${step.label}: typescript exits ${step.exit}`,
    `exit=${actual.exitCode} stderr=${actual.stderr.trim()}`,
  );
  check(
    expected.stdout === actual.stdout,
    `${step.label}: stdout is identical`,
    firstDifference(expected.stdout, actual.stdout),
  );
  check(
    expected.stderr === actual.stderr,
    `${step.label}: stderr is identical`,
    firstDifference(expected.stderr, actual.stderr),
  );
  check(
    JSON.stringify(expected.rows) === JSON.stringify(actual.rows),
    `${step.label}: the Builder runtime rows are identical, metadata byte for byte`,
    firstDifference(
      JSON.stringify(expected.rows, null, 2),
      JSON.stringify(actual.rows, null, 2),
    ),
  );
  check(
    JSON.stringify(Object.keys(expected.files)) === JSON.stringify(Object.keys(actual.files)),
    `${step.label}: the same project files exist`,
    `python=${Object.keys(expected.files).length} ts=${Object.keys(actual.files).length}`,
  );
  for (const [path, content] of Object.entries(expected.files)) {
    if (actual.files[path] === content) continue;
    check(
      false,
      `${step.label}: ${path} is byte-identical`,
      firstDifference(content, actual.files[path] ?? "<absent>"),
    );
  }
  check(
    JSON.stringify(expected.projections) === JSON.stringify(actual.projections),
    `${step.label}: the projection seam published the same documents and receipts`,
    `python=${JSON.stringify(expected.projections)} ts=${JSON.stringify(actual.projections)}`,
  );
}

check(
  JSON.stringify(fingerprintBefore) === JSON.stringify(repositoryFingerprint()),
  "the smoke wrote nothing into this repository's docs tree",
);

// The lifecycle must actually have reached its end, or every comparison above
// could have been two engines agreeing on a refusal.
const finalRows = runtimeRows(typescript);
const finalCursor = finalRows[CURSOR_SESSION]?.metadata ?? "";
const DONE_EVENT = '"last_delivery_event": "done_complete"';
check(
  finalCursor.includes(DONE_EVENT),
  "the lifecycle reached done on the TypeScript engine",
  finalCursor,
);
check(
  (runtimeRows(python)[CURSOR_SESSION]?.metadata ?? "").includes(DONE_EVENT),
  "the lifecycle reached done on the Python engine",
);
check(
  projections(typescript).documents.some((document) => document.endsWith("operational.json")),
  "the TypeScript run published an operational projection through the Python seam",
  JSON.stringify(projections(typescript)),
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
