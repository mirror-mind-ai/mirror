// CR138 — `runtime status`, `version`, and `diagnose` answer for the install
// that is running, never for the cwd.
//
// Run in-process with the install injected, as the `pending` tests do: a
// spawned front door would detect THIS checkout, whose state differs between a
// developer machine and CI. Each command runs from two directories -- one
// outside any repository, and one inside an unrelated project with
// uncommitted work and markers of its own -- and the answer must not move.
//
// The unrelated project is also hostile. Git reads a repository's own
// `.git/config`, and `core.fsmonitor` there names a command git runs on
// `status`. Its command here creates a marker file, so a marker that never
// appears proves git never ran in that project, which is stronger than proving
// its output was filtered. `version --start <that project>` is the one
// documented way to run git there, and the marker shows it does.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { runRuntimeReadRoute } from "#frontDoor/runtimeRoute.ts";
import { tempDir } from "#helpers/tempDir.ts";
import type { InstallKind } from "#runtime/installKind.ts";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Mirror Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Mirror Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

interface World {
  root: string;
  /** The install's own checkout: clean, channel `main`, role `dev`, an `origin`. */
  clone: string;
  /** Another project: uncommitted work, markers `stable` and `production`, a hostile config. */
  other: string;
  /** A directory in no repository. */
  plain: string;
  home: string;
  /** Created only if git runs in `other`. */
  marker: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
}

function world(): World {
  const root = tempDir("runtime-install-reads-");

  const clone = join(root, "clone");
  mkdirSync(clone);
  git(clone, "init", "--quiet", "--initial-branch=main");
  // The markers are per checkout and ignored, as in the real repository, so
  // the fixture clone is clean.
  writeFileSync(join(clone, ".gitignore"), ".mirror-update-channel\n.mirror-clone-role\n");
  writeFileSync(join(clone, "file.txt"), "mirror\n");
  git(clone, "add", ".");
  git(clone, "commit", "--quiet", "-m", "install");
  writeFileSync(join(clone, ".mirror-update-channel"), "main\n");
  writeFileSync(join(clone, ".mirror-clone-role"), "dev\n");
  const remote = join(root, "remote.git");
  git(root, "clone", "--quiet", "--bare", clone, remote);
  git(clone, "remote", "add", "origin", remote);
  git(clone, "fetch", "--quiet", "origin");

  const other = join(root, "other");
  mkdirSync(other);
  git(other, "init", "--quiet", "--initial-branch=feature");
  writeFileSync(join(other, "tracked.txt"), "a\n");
  git(other, "add", ".");
  git(other, "commit", "--quiet", "-m", "other");
  writeFileSync(join(other, "tracked.txt"), "changed\n");
  writeFileSync(join(other, "untracked.txt"), "new\n");
  writeFileSync(join(other, ".mirror-update-channel"), "stable\n");
  writeFileSync(join(other, ".mirror-clone-role"), "production\n");
  const marker = join(root, "FSMON-RAN");
  // Last, so no fixture command trips it.
  git(other, "config", "core.fsmonitor", `touch ${marker}; false`);

  const plain = join(root, "plain");
  mkdirSync(plain);
  const home = join(root, "home");
  mkdirSync(home, { mode: 0o700 });
  chmodSync(home, 0o700);
  bootstrapDatabase(join(home, "memory.db")).close();

  // No provider key, no ambient Mirror user: diagnose's other findings are the
  // fixture's own on any machine.
  const env: NodeJS.ProcessEnv = { HOME: root, PATH: process.env.PATH, MIRROR_HOME: home };
  return {
    root,
    clone,
    other,
    plain,
    home,
    marker,
    env,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(w: World, cwd: string, install: InstallKind, argv: string[]): Promise<Run> {
  let stdout = "";
  let stderr = "";
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const code = await runRuntimeReadRoute(["runtime", ...argv], {
      cwd,
      env: w.env,
      install,
      osHome: w.root,
      stdout: (text) => {
        stdout += text;
      },
      stderr: (text) => {
        stderr += text;
      },
    });
    return { code, stdout, stderr };
  } finally {
    process.chdir(previous);
  }
}

const cloneOf = (w: World): InstallKind => ({ kind: "clone", repository: w.clone });

test("status, version, and diagnose describe the clone from any cwd, and never run git in it", async () => {
  const w = world();
  try {
    const install = cloneOf(w);
    for (const argv of [
      ["status", "--mirror-home", w.home],
      ["version"],
      ["diagnose", "--mirror-home", w.home],
    ]) {
      const fromPlain = await run(w, w.plain, install, argv);
      const fromOther = await run(w, w.other, install, argv);
      const label = argv[0] as string;
      assert.equal(fromOther.stdout, fromPlain.stdout, `${label}: the cwd moved the answer`);
      assert.equal(fromOther.code, fromPlain.code, `${label}: the cwd moved the exit code`);
      assert.doesNotMatch(
        fromOther.stdout,
        /tracked\.txt|untracked\.txt|Git branch: feature/,
        label,
      );
      if (label !== "diagnose") {
        assert.match(fromPlain.stdout, new RegExp(`^Repository: ${w.clone}$`, "m"), label);
        assert.match(fromPlain.stdout, /^Clone role: dev$/m, label);
        assert.match(fromPlain.stdout, /^Update channel: main$/m, label);
      }
    }
    const status = await run(w, w.other, install, ["status", "--mirror-home", w.home]);
    assert.match(status.stdout, /^Status: ready$/m, status.stdout);
    assert.equal(status.code, 0);
    assert.ok(!existsSync(w.marker), "git ran in the cwd's repository");
  } finally {
    w.cleanup();
  }
});

test("the update check asks the clone's own remote, never the cwd's repository", async () => {
  const w = world();
  try {
    const answer = await run(w, w.other, cloneOf(w), ["update", "--check"]);
    assert.match(answer.stdout, /^Mirror runtime update check$/m, answer.stdout + answer.stderr);
    assert.doesNotMatch(answer.stdout, /tracked\.txt|untracked\.txt/);
    assert.ok(!existsSync(w.marker), "git ran in the cwd's repository");
  } finally {
    w.cleanup();
  }
});

test("a dirty install is still reported, from anywhere: its own files, not the cwd's", async () => {
  const w = world();
  try {
    writeFileSync(join(w.clone, "file.txt"), "edited\n");
    const install = cloneOf(w);
    const status = await run(w, w.other, install, ["status", "--mirror-home", w.home]);
    assert.equal(status.code, 1);
    assert.match(status.stdout, /^Git dirty: yes$/m);
    assert.match(status.stdout, /^Status: attention needed$/m);
    const diagnose = await run(w, w.other, install, ["diagnose", "--mirror-home", w.home]);
    assert.match(diagnose.stdout, /git_dirty: M {1,2}file\.txt/);
    assert.doesNotMatch(diagnose.stdout, /tracked\.txt|untracked\.txt/);
    assert.ok(!existsSync(w.marker), "git ran in the cwd's repository");
  } finally {
    w.cleanup();
  }
});

test("version --start is the one explicit way to inspect another repository", async () => {
  const w = world();
  try {
    const answer = await run(w, w.plain, cloneOf(w), ["version", "--start", w.other]);
    assert.match(answer.stdout, new RegExp(`^Repository: ${w.other}$`, "m"));
    assert.match(answer.stdout, /^Git branch: feature$/m);
    assert.match(answer.stdout, /^Clone role: production$/m);
    assert.match(answer.stdout, /^Update channel: stable$/m);
    assert.ok(existsSync(w.marker), "--start asks git about that repository, by request");
  } finally {
    w.cleanup();
  }
});

test("a package reads no clone role from the cwd", async () => {
  const w = world();
  try {
    const install: InstallKind = {
      kind: "package",
      root: join(w.root, "prefix", "lib", "node_modules", "mirror-mind"),
      name: "mirror-mind",
      version: "9.9.9",
    };
    // From inside the clone, whose marker says `dev`, and from the hostile project.
    for (const cwd of [w.clone, w.other]) {
      for (const argv of [["status", "--mirror-home", w.home], ["version"]]) {
        const answer = await run(w, cwd, install, argv);
        assert.match(answer.stdout, /^Repository: none \(package install\)$/m);
        assert.match(answer.stdout, /^Clone role: none \(package install\)$/m, answer.stdout);
        assert.doesNotMatch(answer.stdout, /^Clone role: (dev|production)/m);
      }
    }
    assert.ok(!existsSync(w.marker), "git ran in the cwd's repository");
  } finally {
    w.cleanup();
  }
});

test("an install that cannot be identified inspects no repository, and says why", async () => {
  const w = world();
  try {
    const reason = "not a git checkout, and not laid out as a global npm install";
    const install: InstallKind = { kind: "unknown", reason };
    const status = await run(w, w.other, install, ["status", "--mirror-home", w.home]);
    assert.equal(status.code, 1);
    assert.match(status.stdout, /^Repository: unknown$/m);
    assert.match(
      status.stdout,
      new RegExp(`^Git status note: install kind unknown: ${reason}$`, "m"),
    );
    assert.match(status.stdout, /^Status: attention needed$/m);
    // The hostile project's markers say `production` and `stable`, the same values
    // as the defaults, so the notes are what tell a default from a marker read.
    assert.match(status.stdout, /^Clone role note: no repository$/m);
    assert.match(status.stdout, /^Update channel note: install kind unknown$/m);

    const check = await run(w, w.other, install, ["update", "--check"]);
    assert.equal(check.code, 1);
    assert.match(check.stdout, new RegExp(`install kind unknown: ${reason}`));
    assert.ok(!existsSync(w.marker), "git ran in the cwd's repository");
  } finally {
    w.cleanup();
  }
});
