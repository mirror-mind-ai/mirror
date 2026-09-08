// CV22.DS7.TS3 plateau 5 — `welcome` and the read-only `runtime` subcommands
// through the REAL front door, gated off by default.
//
// The unit goldens grade the renders; this grades the wiring: argument
// handling, exit codes, the gate, and the boundary that keeps DS10's updater
// on Python. Every invocation runs the actual CLI entry point in a child
// process, so the routing table, dispatch, and the front-door log are all in
// the path a user's command takes.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";

const CLI = new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname;
const REPO_ROOT = new URL("../../..", import.meta.url).pathname;

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Mirror Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Mirror Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_AUTHOR_DATE: "2026-09-01T12:00:00+00:00",
  GIT_COMMITTER_DATE: "2026-09-01T12:00:00+00:00",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

interface Fixture {
  root: string;
  home: string;
  repo: string;
  cleanup: () => void;
}

function fixture(): Fixture {
  const root = realpathSync(mkdtempSync("/tmp/runtime-tail-cli-"));
  const home = join(root, "mirror-home");
  mkdirSync(home, { recursive: true });
  bootstrapDatabase(join(home, "memory.db")).close();

  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: repo, env: { ...process.env, ...GIT_ENV }, encoding: "utf8" });
  };
  git("init", "--initial-branch=stable");
  writeFileSync(join(repo, "pyproject.toml"), '[project]\nname = "mirror"\nversion = "9.9.9"\n');
  mkdirSync(join(repo, "docs", "releases"), { recursive: true });
  writeFileSync(
    join(repo, "docs", "releases", "v9.9.9.md"),
    "# v9.9.9 — Fixture release\n\n## Highlights\n\n- One thing\n",
  );
  git("add", ".");
  git("commit", "-m", "fixture");

  return { root, home, repo, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * `cwd` defaults to the fixture repository, which pins git inspection and the
 * package version. Tests that exercise the PYTHON fallback must pass the real
 * repo root instead: `uv run python -m memory` needs the project it lives in,
 * and from a temp directory it fails before Python is ever reached.
 */
function runCli(
  f: Fixture,
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
  cwd: string = f.repo,
): RunResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: f.root,
      NODE_OPTIONS: "--no-warnings",
      MIRROR_HOME: f.home,
      MIRROR_USER: "mirror-home",
      // Keep the corpus off this machine and off the network.
      MEMORY_ENV: "",
      MIRROR_WELCOME_REMOTE_UPDATE_CHECK: "off",
      ...env,
    },
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function logLines(f: Fixture): string[] {
  const path = join(f.home, "front-door.log");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean);
}

test("the gates are the revert control: =0 hands the tail back to Python", () => {
  const f = fixture();
  try {
    // Flipped 2026-09-08, so TS is the default and `=0` is the way back with
    // no code change. Run from the repo root so the Python fallback genuinely
    // answers instead of failing to spawn.
    const welcome = runCli(
      f,
      ["welcome", "--mirror-home", f.home],
      { MIRROR_TS_WELCOME: "0" },
      REPO_ROOT,
    );
    assert.equal(welcome.status, 0, welcome.stderr);
    assert.match(welcome.stdout, /◇ Mirror · mirror-home/);
    assert.ok(
      logLines(f).some((line) => line.includes("\twelcome\tpython\t")),
      "expected the front-door log to record welcome on python",
    );

    const status = runCli(f, ["runtime", "version"], { MIRROR_TS_RUNTIME_READS: "0" }, REPO_ROOT);
    assert.match(status.stdout, /^Mirror runtime version\n/);
    assert.ok(
      logLines(f).some((line) => line.includes("\truntime\tpython\t")),
      "expected the front-door log to record runtime on python",
    );
  } finally {
    f.cleanup();
  }
});

test("welcome answers from TS by default, card and status line alike", () => {
  const f = fixture();
  try {
    const env = {};

    const card = runCli(f, ["welcome", "--mirror-home", f.home], env);
    assert.equal(card.status, 0, card.stderr);
    assert.match(card.stdout, /^◇ Mirror · mirror-home\n/);
    assert.match(card.stdout, /Version 9\.9\.9 · channel stable\n/);
    assert.match(
      card.stdout,
      /0 journeys · 0 personas · 0 memories · 0 conversations · since today/,
    );
    assert.match(card.stdout, /→ Where shall we begin\?\n$/);

    const line = runCli(f, ["welcome", "--status-line", "--mirror-home", f.home], env);
    assert.equal(line.status, 0, line.stderr);
    assert.equal(line.stdout, "◇ mirror-home · ◌ Mirror Mode · ✓\n");

    assert.ok(
      logLines(f).some((entry) => entry.includes("\twelcome\tts\t")),
      "expected the front-door log to record welcome on ts",
    );
  } finally {
    f.cleanup();
  }
});

test("MIRROR_WELCOME=off silences the card on both engines", () => {
  const f = fixture();
  try {
    // Both engines honour the kill switch, which is why it is asserted on
    // both: a gate that silences one core and not the other would make the
    // flip itself user-visible.
    for (const env of [{}, { MIRROR_TS_WELCOME: "0" }]) {
      const result = runCli(
        f,
        ["welcome", "--mirror-home", f.home],
        { ...env, MIRROR_WELCOME: "off" },
        REPO_ROOT,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "", `expected silence with ${JSON.stringify(env)}`);
    }
  } finally {
    f.cleanup();
  }
});

test("runtime version and release-notes answer from TS with exit 0", () => {
  const f = fixture();
  try {
    const env = {};

    const version = runCli(f, ["runtime", "version"], env);
    assert.equal(version.status, 0, version.stderr);
    assert.match(version.stdout, /^Mirror runtime version\n\nVersion: 9\.9\.9\n/);
    assert.match(version.stdout, /Git branch: stable\n/);
    assert.match(version.stdout, /Update channel: stable\n/);

    const latest = runCli(f, ["runtime", "release-notes"], env);
    assert.equal(latest.status, 0, latest.stderr);
    assert.match(latest.stdout, /Fixture release/);
    // An explicit version and the `latest` default resolve to the same note.
    assert.equal(runCli(f, ["runtime", "release-notes", "v9.9.9"], env).stdout, latest.stdout);
    assert.equal(runCli(f, ["runtime", "release-notes", "latest"], env).stdout, latest.stdout);
    // A version with no note is "not found", not a crash.
    const missing = runCli(f, ["runtime", "release-notes", "v0.0.1"], env);
    assert.equal(missing.status, 0);
    assert.match(missing.stdout, /Release notes: not found/);
  } finally {
    f.cleanup();
  }
});

test("runtime status and diagnose carry the oracle's exit codes", () => {
  const f = fixture();
  try {
    const env = {};

    // The fixture repo is clean and the database is bootstrapped, but the
    // fixture home is a fresh temp dir whose permissions are the process
    // umask's -- so `status` may legitimately be either verdict. What must
    // hold is that the exit code AGREES with the rendered verdict.
    const status = runCli(f, ["runtime", "status", "--mirror-home", f.home], env);
    assert.match(status.stdout, /^Mirror runtime status\n/);
    const ready = /\nStatus: ready\n$/.test(status.stdout);
    assert.equal(status.status, ready ? 0 : 1, status.stdout);

    const diagnose = runCli(f, ["runtime", "diagnose", "--mirror-home", f.home], env);
    assert.match(diagnose.stdout, /^Mirror runtime drift diagnosis\n/);
    const noFindings = /\nFindings: 0\n/.test(diagnose.stdout);
    assert.equal(diagnose.status, noFindings ? 0 : 1, diagnose.stdout);

    // The reason this story exists: the TS-authored migration is KNOWN here,
    // so the false alarm Python raises on every TS-migrated install is gone.
    assert.doesNotMatch(diagnose.stdout, /core_migration_unknown/);
    assert.doesNotMatch(status.stdout, /017_journey_parent_column/);
  } finally {
    f.cleanup();
  }
});

test("the DS10 updater stays on Python even with the reads flipped", () => {
  const f = fixture();
  try {
    // `--check` is the cheapest updater path and needs no network to refuse.
    const result = runCli(f, ["runtime", "update", "--check"], { MIRROR_TS_BACKUP: "1" });
    // Python answers (or fails to spawn in a bare test env); either way the
    // front door must have ROUTED it to python, which the log records.
    assert.ok(
      logLines(f).some((line) => line.includes("\truntime\tpython\t")),
      "expected the front-door log to record runtime update on python",
    );
    assert.doesNotMatch(result.stdout, /Mirror runtime drift diagnosis/);
  } finally {
    f.cleanup();
  }
});

test("the status line reaches the database read-only: no bootstrap, no migration", () => {
  const f = fixture();
  try {
    const dbPath = join(f.home, "memory.db");
    const before = readFileSync(dbPath);
    const result = runCli(f, ["welcome", "--status-line", "--mirror-home", f.home], {});
    assert.equal(result.status, 0, result.stderr);
    // Byte-identical: a diagnostic that migrates the database it reads would
    // report a state it created, and the per-turn path must never write.
    assert.deepEqual(readFileSync(dbPath), before);
  } finally {
    f.cleanup();
  }
});

test("an unbootstrapped home still renders, with zeroes", () => {
  const f = fixture();
  try {
    const empty = join(f.root, "empty-home");
    mkdirSync(empty, { recursive: true });
    const card = runCli(f, ["welcome", "--mirror-home", empty], {});
    assert.equal(card.status, 0, card.stderr);
    assert.match(card.stdout, /0 journeys · 0 personas · 0 memories · 0 conversations/);
    // The card must not have created a database as a side effect.
    assert.equal(existsSync(join(empty, "memory.db")), false);

    const line = runCli(f, ["welcome", "--status-line", "--mirror-home", empty], {});
    assert.equal(line.stdout, "◇ empty-home · ✓\n");
  } finally {
    f.cleanup();
  }
});

test("REPO_ROOT stays out of the fixture: the CLI under test is this checkout", () => {
  // Guards the harness itself -- a mistyped path here would silently test
  // nothing, since spawnSync reports a non-zero status either way.
  assert.ok(existsSync(CLI), `front door entry not found at ${CLI}`);
  assert.ok(existsSync(join(REPO_ROOT, "pyproject.toml")));
});

test("release-notes tells a positional from an option value", () => {
  const f = fixture();
  try {
    const env = {};
    const latest = runCli(f, ["runtime", "release-notes"], env).stdout;

    // `--ref pending` names a REF; the positional is still absent, so this is
    // the `latest` lookup, not the pending bundle. Walking the argument list
    // is the only way to tell the two apart.
    const refNamedPending = runCli(f, ["runtime", "release-notes", "--ref", "pending"], env);
    assert.equal(refNamedPending.stdout, latest);
    assert.doesNotMatch(refNamedPending.stdout, /Current version:/);

    // The bare positional IS the bundle, and it renders the bundle header.
    const bundle = runCli(f, ["runtime", "release-notes", "pending", "--no-fetch"], env);
    assert.equal(bundle.status, 0, bundle.stderr);
    assert.match(bundle.stdout, /^Mirror runtime release notes\n/);
    assert.match(bundle.stdout, /Current version: v9\.9\.9/);

    // `--from` takes a value too, and its value is not the positional.
    const fromOnly = runCli(f, ["runtime", "release-notes", "--from", "v0.1.0"], env);
    assert.equal(fromOnly.stdout, latest);
  } finally {
    f.cleanup();
  }
});
