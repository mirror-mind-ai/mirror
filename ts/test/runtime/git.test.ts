// CV22.DS7.TS3 plateau 1 — read-only git inspection, graded against the
// Python oracle over the same fixture repository the golden was generated
// from: a clone with a `file://` bare remote, rebuilt here from the golden's
// recipe so the test is offline and needs no committed repository.
//
// The oracle's own commit ids appear in the golden as `<sha:N>` placeholders
// keyed by first appearance; the test resolves the fixture's real ids the same
// way, so identity and ordering are graded without pinning hashes.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  checkUpdateAvailability,
  inspectCloneRole,
  inspectGit,
  inspectGitWorktree,
  inspectUpdateChannel,
  renderRuntimeUpdateAvailability,
  renderRuntimeVersion,
  versionFromPyproject,
} from "#runtime/git.ts";

const GOLDEN_PATH = new URL("../goldens/runtime-git.golden.json", import.meta.url);

interface Scenario {
  channel_override: string | null;
  git: {
    repository: string | null;
    branch: string | null;
    commit: string | null;
    dirty: boolean | null;
    error: string | null;
  };
  worktree: { status: string; path: string }[];
  clone_role: { value: string; marker: string | null; note: string | null };
  update_channel: { value: string; source: string | null; note: string | null };
  version_render: string;
  availability: Record<string, unknown>;
  availability_render: string;
}

interface Golden {
  meta: { fixture_version: string; pyproject_version: string };
  scenarios: Record<string, Scenario>;
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
const PYPROJECT = `[project]\nname = "mirror"\nversion = "${golden.meta.fixture_version}"\n`;

const GIT_ENV = {
  ...process.env,
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

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

/** The golden's fixture recipe, rebuilt locally. */
function fixture(): { root: string; clone: string; seed: string; cleanup: () => void } {
  // realpath: on macOS /tmp is a symlink to /private/tmp, and both cores
  // resolve the repository path, so the placeholder must match the resolved form.
  const root = realpathSync(mkdtempSync("/tmp/runtime-git-"));
  const seed = join(root, "seed");
  const remote = join(root, "remote.git");
  const clone = join(root, "clone");
  mkdirSync(seed, { recursive: true });
  git(seed, "init", "--initial-branch=stable");
  writeFileSync(join(seed, "pyproject.toml"), PYPROJECT);
  writeFileSync(join(seed, "README.md"), "fixture\n");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "first");
  git(root, "clone", "--bare", seed, remote);
  git(root, "clone", remote, clone);
  git(clone, "checkout", "stable");
  writeFileSync(join(seed, "README.md"), "fixture, moved on\n");
  git(seed, "commit", "-am", "second");
  git(seed, "push", remote, "stable");
  return { root, clone, seed, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * Only the temp root is a placeholder. Commit ids are compared for real: the
 * fixture's fixed content and fixed author/committer dates make git object ids
 * reproducible and path-independent, so this test's repository has the same
 * hashes the generator's did. If either recipe drifts, the ids diverge and the
 * test says so — which is the point.
 */
function normalize(value: string, root: string): string {
  return value.replaceAll(root, "<root>");
}

function normalizeValue<T>(value: T, root: string): T {
  return JSON.parse(normalize(JSON.stringify(value), root)) as T;
}

function checkScenario(label: string, start: string, root: string, channel?: string): void {
  const scenario = golden.scenarios[label] as Scenario;
  const gitStatus = inspectGit(start);
  assert.deepEqual(normalizeValue(gitStatus, root), scenario.git, `${label}: git`);
  assert.deepEqual(
    normalizeValue(inspectGitWorktree(gitStatus.repository), root),
    scenario.worktree,
    `${label}: worktree`,
  );
  assert.deepEqual(
    normalizeValue(inspectCloneRole(start), root),
    scenario.clone_role,
    `${label}: clone role`,
  );
  const updateChannel = inspectUpdateChannel(start, channel ?? null);
  assert.deepEqual(
    normalizeValue(updateChannel, root),
    scenario.update_channel,
    `${label}: update channel`,
  );
  assert.equal(
    normalize(
      renderRuntimeVersion({
        version: golden.meta.fixture_version,
        git: gitStatus,
        cloneRole: inspectCloneRole(start),
        updateChannel,
      }),
      root,
    ),
    scenario.version_render,
    `${label}: version render`,
  );
  const availability = checkUpdateAvailability(start, channel ?? null, golden.meta.fixture_version);
  assert.deepEqual(
    normalizeValue(availability, root),
    scenario.availability,
    `${label}: availability`,
  );
  assert.equal(
    normalize(renderRuntimeUpdateAvailability(availability), root),
    scenario.availability_render,
    `${label}: availability render`,
  );
}

test("git inspection matches the oracle across the fixture's states", () => {
  const f = fixture();
  try {
    checkScenario("behind_by_one", f.clone, f.root);
    checkScenario("channel_override_main", f.clone, f.root, "main");
    checkScenario("channel_override_unknown", f.clone, f.root, "Nonsense");

    writeFileSync(join(f.clone, ".mirror-update-channel"), "main\n");
    writeFileSync(join(f.clone, ".mirror-clone-role"), "dev\n");
    checkScenario("markers_valid", f.clone, f.root);
    writeFileSync(join(f.clone, ".mirror-update-channel"), "weekly\n");
    writeFileSync(join(f.clone, ".mirror-clone-role"), "staging\n");
    checkScenario("markers_unknown_value", f.clone, f.root);
    rmSync(join(f.clone, ".mirror-update-channel"));
    rmSync(join(f.clone, ".mirror-clone-role"));

    writeFileSync(join(f.clone, "README.md"), "locally modified\n");
    writeFileSync(join(f.clone, "untracked.txt"), "scratch\n");
    git(f.clone, "mv", "pyproject.toml", "project.toml");
    writeFileSync(join(f.clone, "project.toml"), PYPROJECT);
    checkScenario("dirty_worktree", f.clone, f.root);
    git(f.clone, "mv", "project.toml", "pyproject.toml");
    git(f.clone, "checkout", "--", "README.md");
    rmSync(join(f.clone, "untracked.txt"));

    git(f.clone, "pull", "--ff-only");
    checkScenario("up_to_date", f.clone, f.root);

    writeFileSync(join(f.clone, "local.txt"), "local work\n");
    git(f.clone, "add", "local.txt");
    git(f.clone, "commit", "-m", "local ahead");
    checkScenario("local_ahead", f.clone, f.root);

    // Diverged needs the remote commit present locally: the classifier asks
    // the local object database, so an unfetched divergence reads as
    // "update available" instead.
    writeFileSync(join(f.seed, "README.md"), "remote moved again\n");
    git(f.seed, "commit", "-am", "third");
    git(f.seed, "push", join(f.root, "remote.git"), "stable");
    git(f.clone, "fetch", "origin");
    checkScenario("diverged", f.clone, f.root);

    writeFileSync(join(f.clone, ".mirror-update-channel"), "  MAIN \n");
    writeFileSync(join(f.clone, ".mirror-clone-role"), "DeV\n");
    checkScenario("markers_uppercase", f.clone, f.root);
    rmSync(join(f.clone, ".mirror-update-channel"));
    rmSync(join(f.clone, ".mirror-clone-role"));

    const outside = join(f.root, "not-a-repo");
    mkdirSync(outside);
    checkScenario("not_a_repository", outside, f.root);
  } finally {
    f.cleanup();
  }
});

test("the networked read uses the network budget, not the local one", () => {
  // The v0.30.1 release incident: one shared 2 s budget made a network
  // operation report failure after it had already succeeded. A fixture with a
  // file:// remote answers instantly, so this cannot be observed behaviorally
  // — it is pinned at the call site instead.
  const source = readFileSync(new URL("../../src/runtime/git.ts", import.meta.url), "utf8");
  const lsRemote = /runGit\(\s*\[\s*"ls-remote"[\s\S]*?\);/.exec(source)?.[0] ?? "";
  assert.match(lsRemote, /GIT_NETWORK_TIMEOUT_MS/, "ls-remote must use the network budget");
  const localReads = source.match(/runGit\(\s*\[\s*"(rev-parse|status|branch)"/g) ?? [];
  assert.ok(localReads.length >= 3, "local reads keep the local budget by default");
});

test("versionFromPyproject walks upward like the oracle", () => {
  const f = fixture();
  try {
    assert.equal(versionFromPyproject(f.clone), golden.meta.pyproject_version);
    const nested = join(f.clone, "a", "b");
    mkdirSync(nested, { recursive: true });
    assert.equal(
      versionFromPyproject(nested),
      golden.meta.pyproject_version,
      "found by walking up",
    );
    assert.equal(versionFromPyproject("/"), null, "absent above the root");
  } finally {
    f.cleanup();
  }
});

test("every git invocation in the module is a read", () => {
  // The plan's boundary, enforced rather than promised: the git updater and
  // release machinery are DS10's, and nothing here may grow a write path. The
  // check reads the verbs actually passed to `runGit`, not tokens anywhere in
  // the file — `branch --show-current` is a read and must not trip it, while a
  // future `["branch", name]` must.
  const source = readFileSync(new URL("../../src/runtime/git.ts", import.meta.url), "utf8");
  const invocations = [...source.matchAll(/runGit\(\s*\[([^\]]*)\]/g)].map((match) =>
    (match[1] as string)
      .split(",")
      .map((token) => token.trim().replace(/^["'`]|["'`]$/g, ""))
      .filter((token) => token.length > 0),
  );
  assert.ok(invocations.length >= 8, "the scan found the invocations it grades");

  const READ_ONLY: Record<string, (args: string[]) => boolean> = {
    "rev-parse": () => true,
    status: (args) => args.includes("--porcelain"),
    "rev-list": (args) => args.includes("--count"),
    "merge-base": (args) => args.includes("--is-ancestor"),
    "cat-file": (args) => args.includes("-e"),
    config: (args) => args.includes("--get"),
    "ls-remote": () => true,
    show: () => true,
    // `branch` reads only in its --show-current form; `["branch", name]` writes.
    branch: (args) => args.length === 2 && args[1] === "--show-current",
  };

  for (const argv of invocations) {
    const verb = argv[0] as string;
    const rule = READ_ONLY[verb];
    assert.ok(rule, `unexpected git verb in a read-only module: ${argv.join(" ")}`);
    assert.ok(rule(argv), `git verb used in a mutating form: ${argv.join(" ")}`);
  }
});

test("an option-shaped channel override is normalized, never passed to git", () => {
  // The channel is allowlisted to stable|main before it is used to build the
  // upstream ref, so an attacker-shaped value cannot become a git argument. The
  // oracle normalizes rather than refuses, and so does this port; the refusal
  // path belongs where refs are genuinely user-supplied (`release-notes --ref`,
  // plateau 2).
  const f = fixture();
  try {
    const channel = inspectUpdateChannel(f.clone, "--upload-pack=touch /tmp/pwned");
    assert.equal(channel.value, "stable");
    assert.match(channel.note ?? "", /unknown channel/);
    const availability = checkUpdateAvailability(
      f.clone,
      "--upload-pack=touch /tmp/pwned",
      "0.0.0",
    );
    assert.equal(availability.upstream, "origin/stable");
  } finally {
    f.cleanup();
  }
});
