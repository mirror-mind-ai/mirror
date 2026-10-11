// CV22.DS10.TS1 plateau 1 — the guard: TypeScript writes spawn no Python.
//
// This is the story's acceptance test, and it is written BEFORE the seam is
// removed so that it is seen to fail against the seam it grades. Red first,
// then the deletion turns it green. A guard authored after the fact proves only
// that the author believed the code.
//
// It does not spy on `node:child_process`. A spy grades the module graph the
// test imported; this grades the PROCESS TABLE. A shim directory goes first on
// `PATH` carrying fake `uv`, `python`, and `python3` executables that append
// their argv to a marker file and exit 0. Anything the front door executes by
// name lands in that file, including a spawn from a module this test never
// imported, and including one added later by a different story.
//
// The commands chosen are the two that request a projection refresh today:
// a Builder cursor write that changes the projected active work
// (`deliveryCursor.ts:461` via `buildRoute.ts:387`), and an Explorer story
// mutation (`exploreRoute.ts:207`). Both are real front-door invocations in a
// real subprocess, not route functions called with hand-made deps.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { createJourney } from "#journey/journeyWrite.ts";

const CLI = new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname;

/** Every interpreter the core could reach for. Shimmed by name, not by path. */
const SHIMMED = ["uv", "python", "python3"] as const;

interface Fixture {
  root: string;
  home: string;
  project: string;
  marker: string;
  binDir: string;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "no-python-spawn-"));
  const home = join(root, "home");
  const project = join(root, "project");
  const binDir = join(root, "bin");
  const marker = join(root, "spawned.log");
  for (const dir of [home, project, binDir]) mkdirSync(dir, { recursive: true });

  // A neutral project directory, for the reason buildCli.test.ts records: the
  // clone-role guard judges the shell's directory when the journey has none,
  // and this repository carries a `dev` marker a CI runner does not.
  for (const name of SHIMMED) {
    const shim = join(binDir, name);
    writeFileSync(shim, `#!/bin/sh\nprintf '%s %s\\n' "${name}" "$*" >> "${marker}"\nexit 0\n`);
    chmodSync(shim, 0o755);
  }

  const db = bootstrapDatabase(join(home, "memory.db"));
  createJourney(
    db,
    {
      id: "journey-guard",
      slug: "guard",
      content: "# Guard\n\nA journey whose writes must not reach an interpreter.",
      projectPath: project,
    },
    "2026-01-01T00:00:00Z",
  );
  db.close();
  return { root, home, project, marker, binDir };
}

function run(f: Fixture, args: readonly string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: f.root,
    encoding: "utf8",
    env: {
      // The shim wins over any real interpreter on the machine or the runner.
      PATH: `${f.binDir}:${process.env.PATH ?? ""}`,
      HOME: f.root,
      NODE_OPTIONS: "--no-warnings",
      MIRROR_HOME: f.home,
      MIRROR_USER: "home",
      MEMORY_ENV: "",
    },
  });
}

/** What the front door executed by name, or an empty list. */
function spawned(f: Fixture): string[] {
  if (!existsSync(f.marker)) return [];
  return readFileSync(f.marker, "utf8").trim().split("\n").filter(Boolean);
}

function assertNoSpawn(f: Fixture, what: string): void {
  const calls = spawned(f);
  assert.deepEqual(
    calls,
    [],
    `${what} executed an interpreter:\n  ${calls.join("\n  ")}\n` +
      "TypeScript writes must not spawn Python. See CV22.DS10.TS1.",
  );
}

test("a Builder cursor write spawns no interpreter", (t) => {
  const f = fixture();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));

  const adopt = run(f, ["build", "adopt", "--journey", "guard", "--method", "ariad"]);
  assert.equal(adopt.status, 0, `adopt failed: ${adopt.stderr}`);
  const sync = run(f, ["build", "sync-cursor", "--journey", "guard", "--method", "ariad"]);
  assert.equal(sync.status, 0, `sync-cursor failed: ${sync.stderr}`);

  // The write that changes projected active work, and therefore requests a
  // refresh. A technical story, so Expand never runs: this grades the cursor
  // write, not package materialization.
  const pull = run(f, [
    "build",
    "pull-item",
    "--journey",
    "guard",
    "--method",
    "ariad",
    "--item-code",
    "CV1.DS1.TS1",
    "--item-title",
    "A cursor write that must stay in one language",
    "--item-level",
    "technical_story",
    "--why-now",
    "the guard needs a projected active item to change",
  ]);
  assert.equal(pull.status, 0, `pull-item failed: ${pull.stderr}`);

  assertNoSpawn(f, "a Builder cursor write");
});

test("an Explorer story write spawns no interpreter", (t) => {
  const f = fixture();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));

  // Creating a story changes the projected title, which is what requests a
  // refresh; editing it afterwards deliberately does not.
  const open = run(f, [
    "explore",
    "story",
    "open",
    "guard",
    "--story",
    "a story whose write must not reach an interpreter",
  ]);
  assert.equal(open.status, 0, `explore story open failed: ${open.stderr}`);

  assertNoSpawn(f, "an Explorer story write");
});

test("the shim itself is reachable, so a green result means something", (t) => {
  // Without this, a broken shim (not executable, wrong PATH, unwritable marker)
  // would make every assertion above pass for the wrong reason. The guard has
  // to be able to catch a spawn before it can be trusted to report none.
  const f = fixture();
  t.after(() => rmSync(f.root, { recursive: true, force: true }));

  // Every shim, not only the first: a guard that can catch `uv` and not a
  // bare `python3` would report "no spawn" for exactly the invocation the
  // runtime hooks used.
  for (const name of SHIMMED) {
    const probe = spawnSync(name, ["--probe"], {
      cwd: f.root,
      encoding: "utf8",
      env: { PATH: `${f.binDir}:${process.env.PATH ?? ""}` },
    });
    assert.equal(probe.status, 0, `the ${name} shim did not run`);
  }

  assert.deepEqual(
    spawned(f),
    SHIMMED.map((name) => `${name} --probe`),
    "the marker records each shim's name and argv",
  );
});
