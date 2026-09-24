// CV22.DS7.US8 — Builder through the real front-door process, on the shipped default.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { createJourney } from "#journey/journeyWrite.ts";

const CLI = new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname;

interface Fixture {
  root: string;
  home: string;
}

function fixture(): Fixture {
  const root = mkdtempSync("/tmp/builder-cli-");
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  // A NEUTRAL project directory: the clone-role guard `load` runs first judges
  // the journey's project path, and with none it judges the SHELL's directory.
  // The test runner's cwd is this repository, which carries a `dev` marker on a
  // developer machine and none on a CI runner (default `production`, refusal,
  // exit 2). The plateau-1 lesson yet again: stage inputs, never inherit them.
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });
  const db = bootstrapDatabase(join(home, "memory.db"));
  createJourney(
    db,
    {
      id: "journey-demo",
      slug: "demo",
      content: "# Demo\n\n## Briefing\n\nBRIEFING_SECRET should never reach front-door.log.",
      projectPath: project,
    },
    "2026-01-01T00:00:00Z",
  );
  db.close();
  return { root, home };
}

function run(f: Fixture, args: readonly string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: f.root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: f.root,
      NODE_OPTIONS: "--no-warnings",
      MIRROR_HOME: f.home,
      MIRROR_USER: "home",
      MEMORY_ENV: "",
      // No gate: since the plateau-9 flip these tests prove the shipped default.
      ...extraEnv,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("the default route lazily dispatches an inspect leaf and logs only its name", () => {
  const f = fixture();
  try {
    const result = run(f, ["build", "inspect-method", "ariad", "--mirror-home", f.home]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^■ Builder Method Available/);
    assert.equal(result.stderr, "");

    const log = readFileSync(join(f.home, "front-door.log"), "utf8");
    assert.match(log, /\tbuild\tts\texit=0\tleaf=inspect-method/);
    assert.doesNotMatch(log, /ariad|builder-cli-/);
    assert.equal(existsSync(join(f.home, "backups")), false, "a read-only leaf takes no backup");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("build load crosses the real route and logs calls, never the derived briefing query", () => {
  const f = fixture();
  const fixtures = new URL("../fixtures/builder-load/", import.meta.url).pathname;
  try {
    const result = run(f, ["build", "load", "demo", "--session-id", "load-test"], {
      MIRROR_TS_BUILD_LLM_REPLAY: join(fixtures, "replay-llm.json"),
      MIRROR_TS_BUILD_EMBEDDING_REPLAY: join(fixtures, "replay-embedding.json"),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /■ {2}BUILDER MODE ACTIVE/);
    assert.match(result.stderr, /Builder Mode active — journey: demo/);

    const log = readFileSync(join(f.home, "front-door.log"), "utf8");
    assert.match(log, /\tbuild\tts\texit=0\tleaf=load calls=2/);
    assert.doesNotMatch(log, /BRIEFING_SECRET/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("an incomplete build replay fixture is refused by name, in one line, before anything runs", () => {
  // Until CV22.DS10.TS5 this surfaced as an uncaught error with a stack trace,
  // exit 1. The front door now answers it as the refusal it is: one line naming
  // the missing variable, exit 2, nothing spent.
  const f = fixture();
  try {
    const result = run(f, ["build", "load", "demo"], {
      MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/only-half.json",
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^Mirror TS front door: .*MIRROR_TS_BUILD_EMBEDDING_REPLAY/);
    assert.doesNotMatch(result.stderr, /\n\s+at /, "no stack trace");

    const log = readFileSync(join(f.home, "front-door.log"), "utf8");
    assert.match(log, /\tbuild\tts\texit=2\tReplayFixtureIncompleteError/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("Builder argument prose never reaches front-door.log", () => {
  const f = fixture();
  const secrets = [
    "WHY_SECRET",
    "OBJECTIVE_SECRET",
    "VALIDATION_SECRET",
    "DEBT_SECRET",
    "PROCESS_SECRET",
    "HISTORY_SECRET",
    "LIMIT_SECRET",
    "CHILD_SECRET",
  ];
  try {
    const invocations = [
      [
        "build",
        "pull-item",
        "--method",
        "ariad",
        "--item-code",
        "CV1.US1",
        "--item-title",
        "TITLE_SECRET",
        "--item-level",
        "user_story",
        "--why-now",
        secrets[0],
      ],
      [
        "build",
        "plan-delivery-story",
        "--method",
        "ariad",
        "--objective",
        secrets[1],
        "--child",
        secrets[7],
      ],
      [
        "build",
        "validate-item",
        "--method",
        "ariad",
        "--check",
        secrets[2],
        "--navigator-route",
        "ROUTE_SECRET",
      ],
      [
        "build",
        "review-item",
        "--method",
        "ariad",
        "--debt",
        secrets[3],
        "--decision",
        "defer",
        "--defer-reason",
        "REASON_SECRET",
        "--revisit-trigger",
        "TRIGGER_SECRET",
      ],
      [
        "build",
        "coherence-item",
        "--method",
        "ariad",
        "--process",
        secrets[4],
        "--project",
        "PROJECT_SECRET",
        "--product",
        "PRODUCT_SECRET",
        "--local-difference",
        "DIFF_SECRET",
      ],
      [
        "build",
        "done-item",
        "--method",
        "ariad",
        "--history-action",
        secrets[5],
        "--roadmap-update",
        "ROADMAP_SECRET",
        "--next-recommendation",
        "NEXT_SECRET",
      ],
      [
        "build",
        "set-cadence",
        "--method",
        "ariad",
        "--profile",
        "autonomous",
        "--limit",
        secrets[6],
      ],
    ];
    for (const argv of invocations) run(f, argv);

    const log = readFileSync(join(f.home, "front-door.log"), "utf8");
    for (const secret of [
      ...secrets,
      "TITLE_SECRET",
      "ROUTE_SECRET",
      "REASON_SECRET",
      "TRIGGER_SECRET",
      "PROJECT_SECRET",
      "PRODUCT_SECRET",
      "DIFF_SECRET",
      "ROADMAP_SECRET",
      "NEXT_SECRET",
    ]) {
      assert.doesNotMatch(log, new RegExp(secret), secret);
    }
    assert.match(log, /leaf=pull-item/);
    assert.match(log, /leaf=validate-item/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("argparse-class and domain refusals preserve their distinct exit codes", () => {
  const f = fixture();
  try {
    const usage = run(f, ["build", "adopt", "--mirror-home", f.home]);
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /the following argument is required: --method/);

    const domain = run(f, ["build", "inspect-method", "bogus", "--mirror-home", f.home]);
    assert.equal(domain.status, 1);
    assert.equal(
      domain.stderr,
      "Error: Builder method 'bogus' not found. Available methods: ariad\n",
    );

    // argparse's `--option=value` and prefix spellings reach the command with
    // Python's own domain answer, measured on the Python CLI: exit 1, not 2.
    const spelled = run(f, [
      "build",
      "check-implementation",
      "--meth=ariad",
      "--jour=no-such-journey",
      "--mirror-home",
      f.home,
    ]);
    assert.equal(spelled.status, 1);
    assert.equal(spelled.stderr, "Error: journey 'no-such-journey' not found.\n");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
