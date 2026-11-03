// CR135 — the welcome card's update check asks the running install, never
// the directory the person is in.
//
// Until CR135 the card checked the repository holding the cwd. Pi's session
// start runs in the person's project, so the verdict was about that project:
// a scratch project with a tagged `origin/stable` made the card announce its
// tag on the newest Mirror, and outside any repository a package was never
// told of a release. Every check below runs from two directories, one outside
// any repository and an unrelated project whose `origin/stable` is one commit
// ahead, tagged `v9.9.9`, and fetched, with an `.npmrc` naming a closed port.
// Neither may change the verdict.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
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
import { runWelcomeRoute } from "#frontDoor/runtimeRoute.ts";
import { tempDir } from "#helpers/tempDir.ts";
import type { InstallKind } from "#runtime/installKind.ts";
import type { NpmRunner } from "#runtime/strategies/package.ts";
import { composeWelcome, WELCOME_REMOTE_BUDGET_MS } from "#welcome/card.ts";
import { composeStatusLine } from "#welcome/statusLine.ts";
import {
  readUpdateCache,
  recordUpToDate,
  UPDATE_CHECK_CACHE,
  type UpdateAwareness,
  verdictApplies,
  writeUpdateCache,
} from "#welcome/updateCache.ts";
import { stageMirrorPackage } from "../support/mirrorTree.ts";

type PackageInstall = Extract<InstallKind, { kind: "package" }>;
type CloneInstall = Extract<InstallKind, { kind: "clone" }>;

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

/** The card's environment: production database name, remote check on. */
const CHECKING = { MEMORY_ENV: undefined } as NodeJS.ProcessEnv;
const NOT_CHECKING = {
  MEMORY_ENV: undefined,
  MIRROR_WELCOME_REMOTE_UPDATE_CHECK: "off",
} as NodeJS.ProcessEnv;

interface World {
  root: string;
  /** A directory outside any repository. */
  outside: string;
  /** Someone else's project: `origin/stable` one commit ahead, `v9.9.9`, fetched. */
  unrelated: string;
  /** The OS home whose config directory holds a package's channel file. */
  osHome: string;
  cleanup: () => void;
}

function world(): World {
  // realpath: on macOS /tmp is a symlink to /private/tmp.
  const root = tempDir("cr135-");
  const outside = join(root, "outside");
  const osHome = join(root, "os-home");
  mkdirSync(outside);
  mkdirSync(osHome);

  const remote = join(root, "unrelated-remote.git");
  git(root, "init", "-q", "--bare", remote);
  const unrelated = join(root, "unrelated");
  mkdirSync(unrelated);
  git(unrelated, "init", "-q", "--initial-branch=stable");
  writeFileSync(join(unrelated, "package.json"), '{"name":"someone-else","version":"1.0.0"}\n');
  // npm reads the project config of the directory it runs in: this one would
  // send a registry read to a closed port.
  writeFileSync(join(unrelated, ".npmrc"), "registry=http://127.0.0.1:9/\n");
  git(unrelated, "add", ".");
  git(unrelated, "commit", "-q", "-m", "A");
  git(unrelated, "remote", "add", "origin", remote);
  git(unrelated, "push", "-q", "origin", "stable");
  writeFileSync(join(unrelated, "B"), "b\n");
  git(unrelated, "add", ".");
  git(unrelated, "commit", "-q", "-m", "B");
  git(unrelated, "tag", "v9.9.9");
  git(unrelated, "push", "-q", "origin", "stable", "v9.9.9");
  git(unrelated, "reset", "-q", "--hard", "HEAD~1");
  git(unrelated, "fetch", "-q", "origin");

  return {
    root,
    outside,
    unrelated,
    osHome,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

let homes = 0;
function freshHome(w: World): string {
  homes += 1;
  const home = join(w.root, `home-${homes}`);
  mkdirSync(home);
  return home;
}

/** A global package at 1.0.0. Injected, so it need not be detectable. */
function packageInstall(w: World): PackageInstall {
  const root = join(w.root, "prefix", "lib", "node_modules", "mirror-mind");
  stageMirrorPackage(root, { version: "1.0.0" });
  return { kind: "package", root, name: "mirror-mind", version: "1.0.0" };
}

interface CloneFixture {
  install: CloneInstall;
  origin: string;
  head: string;
  stable: string;
}

/**
 * A clone at 1.0.0 whose own `origin/stable` is TWO commits ahead, tagged
 * `v1.1.0`, and fetched -- two, so its "commits behind" count cannot be
 * mistaken for the unrelated project's one.
 */
function cloneInstall(w: World, name = "clone"): CloneFixture {
  const seed = join(w.root, `${name}-seed`);
  const origin = join(w.root, `${name}-origin.git`);
  mkdirSync(seed);
  git(seed, "init", "-q", "--initial-branch=stable");
  stageMirrorPackage(seed, { version: "1.0.0" });
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "installed");
  git(w.root, "clone", "-q", "--bare", seed, origin);
  const repository = join(w.root, name);
  git(w.root, "clone", "-q", origin, repository);
  for (const step of ["second", "third"]) {
    writeFileSync(join(seed, step), `${step}\n`);
    git(seed, "add", ".");
    git(seed, "commit", "-q", "-m", step);
  }
  git(seed, "tag", "v1.1.0");
  git(seed, "push", "-q", origin, "stable", "v1.1.0");
  git(repository, "fetch", "-q", "origin");
  return {
    install: { kind: "clone", repository },
    origin,
    head: git(repository, "rev-parse", "HEAD"),
    stable: git(seed, "rev-parse", "HEAD"),
  };
}

interface NpmCall {
  args: string[];
  cwd: string | undefined;
  timeoutMs: number | undefined;
}

/** A registry that answers `tags`, or fails when `tags` is null, and records every call. */
function registry(tags: Record<string, string> | null): { runner: NpmRunner; calls: NpmCall[] } {
  const calls: NpmCall[] = [];
  const runner: NpmRunner = (args, call) => {
    calls.push({ args: [...args], cwd: call?.cwd, timeoutMs: call?.timeoutMs });
    if (tags === null) return { code: 1, stdout: "", stderr: "npm error code ENOTFOUND\n" };
    return { code: 0, stdout: JSON.stringify(tags), stderr: "" };
  };
  return { runner, calls };
}

/** Run `fn` with the process in each directory; the cwd is restored whatever happens. */
function fromEach<T>(dirs: readonly string[], fn: (dir: string) => T): T[] {
  const original = process.cwd();
  const results: T[] = [];
  try {
    for (const dir of dirs) {
      process.chdir(dir);
      results.push(fn(dir));
    }
  } finally {
    process.chdir(original);
  }
  return results;
}

/** Put executable `scripts` first on PATH while `fn` runs. */
function withPathShims<T>(w: World, scripts: Record<string, string>, fn: () => T): T {
  const dir = mkdtempSync(join(w.root, "shims-"));
  for (const [name, body] of Object.entries(scripts)) {
    writeFileSync(join(dir, name), body);
    chmodSync(join(dir, name), 0o755);
  }
  const original = process.env.PATH;
  process.env.PATH = `${dir}:${original ?? ""}`;
  try {
    return fn();
  } finally {
    process.env.PATH = original;
  }
}

function freshAt(): string {
  return new Date().toISOString().replace("Z", "+00:00");
}

function awareness(fields: Partial<UpdateAwareness>): UpdateAwareness {
  return {
    availability: "update_available",
    checked_at: freshAt(),
    channel: "stable",
    current_commit: null,
    remote_commit: null,
    version: null,
    title: null,
    note: null,
    ...fields,
  };
}

// ------------------------------------------------------------------ package

test("a package's card asks the registry for its own channel, from any directory", () => {
  const w = world();
  try {
    const install = packageInstall(w);
    const results = fromEach([w.outside, w.unrelated], () => {
      const home = freshHome(w);
      const npm = registry({ latest: "1.1.0", stable: "1.1.0" });
      const render = composeWelcome({
        mirrorHome: home,
        install,
        env: CHECKING,
        version: "1.0.0",
        osHome: w.osHome,
        npm: npm.runner,
      });
      return { home, render, npm };
    });
    for (const { home, render, npm } of results) {
      assert.match(render.card, /^Version 1\.0\.0 · channel stable$/m);
      assert.match(render.card, /^✨ New Version Available: v1\.1\.0$/m);
      assert.doesNotMatch(render.card, /v9\.9\.9|commit behind/);
      assert.deepEqual(render.check && { ...render.check, ms: 0 }, {
        source: "registry",
        verdict: "update_available",
        ms: 0,
      });

      const cached = readUpdateCache(home);
      assert.equal(cached?.availability, "update_available");
      assert.equal(cached?.version, "v1.1.0");
      assert.equal(cached?.current_commit, null);
      assert.equal(cached?.remote_commit, null);
      assert.match(
        composeStatusLine({ mirrorHome: home, installedVersion: "1.0.0", env: CHECKING }),
        / · ⬆ v1\.1\.0$/,
      );

      // One read: the channel's dist-tag, in the install's own directory,
      // without npm's retries, inside the budget.
      assert.equal(npm.calls.length, 1);
      const [call] = npm.calls as [NpmCall];
      assert.deepEqual(call.args, [
        "view",
        "mirror-mind",
        "dist-tags",
        "--json",
        "--fetch-retries=0",
      ]);
      assert.equal(call.cwd, install.root);
      assert.ok(call.timeoutMs !== undefined && call.timeoutMs > 0, `timeout ${call.timeoutMs}`);
      assert.ok((call.timeoutMs ?? 0) <= WELCOME_REMOTE_BUDGET_MS);
    }
  } finally {
    w.cleanup();
  }
});

test("a package at its channel's version caches up_to_date and announces nothing", () => {
  const w = world();
  try {
    const install = packageInstall(w);
    fromEach([w.outside, w.unrelated], () => {
      const home = freshHome(w);
      const render = composeWelcome({
        mirrorHome: home,
        install,
        env: CHECKING,
        version: "1.0.0",
        osHome: w.osHome,
        npm: registry({ stable: "1.0.0" }).runner,
      });
      assert.doesNotMatch(render.card, /New Version Available/);
      assert.equal(render.check?.verdict, "up_to_date");
      assert.equal(readUpdateCache(home)?.availability, "up_to_date");
      assert.equal(readUpdateCache(home)?.version, null);
    });
  } finally {
    w.cleanup();
  }
});

test("a channel behind the install, and a registry that fails, cache nothing", () => {
  const w = world();
  try {
    const install = packageInstall(w);
    for (const [tags, verdict] of [
      [{ stable: "0.9.0", main: "1.0.0" }, "channel_behind"],
      [null, "unknown"],
    ] as const) {
      fromEach([w.outside, w.unrelated], () => {
        const home = freshHome(w);
        const render = composeWelcome({
          mirrorHome: home,
          install,
          env: CHECKING,
          version: "1.0.0",
          osHome: w.osHome,
          npm: registry(tags).runner,
        });
        assert.doesNotMatch(render.card, /New Version Available/);
        assert.equal(render.check?.verdict, verdict);
        assert.equal(existsSync(join(home, UPDATE_CHECK_CACHE)), false, verdict);
      });
    }
  } finally {
    w.cleanup();
  }
});

test("MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off keeps a package off the registry", () => {
  const w = world();
  try {
    const npm = registry({ stable: "1.1.0" });
    const render = composeWelcome({
      mirrorHome: freshHome(w),
      install: packageInstall(w),
      env: NOT_CHECKING,
      version: "1.0.0",
      osHome: w.osHome,
      npm: npm.runner,
    });
    assert.deepEqual(npm.calls, []);
    assert.equal(render.check, null);
    assert.doesNotMatch(render.card, /New Version Available/);
  } finally {
    w.cleanup();
  }
});

test("a package's card runs no git, from inside a repository", () => {
  // The cwd is a repository with a fetched, tagged `origin/stable`: the card
  // used to ask it, locally and over the network. A recording `git` first on
  // PATH proves nothing asks it now.
  const w = world();
  try {
    const marker = join(w.root, "git-was-called");
    withPathShims(w, { git: `#!/bin/sh\necho "$*" >> "${marker}"\nexit 1\n` }, () => {
      fromEach([w.unrelated], () =>
        composeWelcome({
          mirrorHome: freshHome(w),
          install: packageInstall(w),
          env: CHECKING,
          version: "1.0.0",
          osHome: w.osHome,
          npm: registry({ stable: "1.1.0" }).runner,
        }),
      );
    });
    assert.equal(existsSync(marker), false, existsSync(marker) ? readFileSync(marker, "utf8") : "");
  } finally {
    w.cleanup();
  }
});

test("npm runs in the install's own directory, so a project's .npmrc cannot answer", () => {
  // The real runner, against an `npm` on PATH that records where it ran. The
  // process stands in the unrelated project, whose `.npmrc` names a closed
  // port: a real npm started there would read it.
  const w = world();
  try {
    const install = packageInstall(w);
    const cwds = join(w.root, "npm-cwds");
    const argv = join(w.root, "npm-argv");
    const npm = `#!/bin/sh\npwd -P >> "${cwds}"\necho "$*" >> "${argv}"\necho '{"stable":"1.1.0"}'\n`;
    const render = withPathShims(w, { npm }, () =>
      fromEach([w.unrelated], () =>
        composeWelcome({
          mirrorHome: freshHome(w),
          install,
          env: CHECKING,
          version: "1.0.0",
          osHome: w.osHome,
        }),
      ),
    )[0];
    assert.equal(readFileSync(cwds, "utf8"), `${realpathSync(install.root)}\n`);
    assert.equal(
      readFileSync(argv, "utf8"),
      "view mirror-mind dist-tags --json --fetch-retries=0\n",
    );
    assert.match(render?.card ?? "", /^✨ New Version Available: v1\.1\.0$/m);
  } finally {
    w.cleanup();
  }
});

test("a registry that never answers is cut at the budget, and the cache stands", () => {
  const w = world();
  try {
    const home = freshHome(w);
    writeUpdateCache(home, awareness({ version: "v1.0.5" }));
    const before = readFileSync(join(home, UPDATE_CHECK_CACHE));
    const started = Date.now();
    const render = withPathShims(w, { npm: "#!/bin/sh\nexec sleep 30\n" }, () =>
      composeWelcome({
        mirrorHome: home,
        install: packageInstall(w),
        env: CHECKING,
        version: "1.0.0",
        osHome: w.osHome,
        remoteBudgetMs: 1_000,
      }),
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 4_000, `the card took ${elapsed} ms on a 1 s budget`);
    assert.equal(render.check?.verdict, "unknown");
    assert.deepEqual(readFileSync(join(home, UPDATE_CHECK_CACHE)), before);
    // A check that answered nothing shows what the cache knows, as the status
    // line does: here, a release newer than the install.
    assert.match(render.card, /^✨ New Version Available: v1\.0\.5$/m);
  } finally {
    w.cleanup();
  }
});

// -------------------------------------------------------------------- clone

test("a clone's card asks its own checkout and its own remote, from any directory", () => {
  const w = world();
  try {
    const clone = cloneInstall(w);
    const results = fromEach([w.outside, w.unrelated], () => {
      const home = freshHome(w);
      const render = composeWelcome({
        mirrorHome: home,
        install: clone.install,
        env: CHECKING,
        version: "1.0.0",
        osHome: w.osHome,
      });
      return { home, render };
    });
    for (const { home, render } of results) {
      assert.match(render.card, /^Version 1\.0\.0 · channel stable$/m);
      assert.match(render.card, /^✨ New Version Available: v1\.1\.0$/m);
      assert.doesNotMatch(render.card, /v9\.9\.9/);
      assert.equal(render.check?.source, "git");
      assert.equal(render.check?.verdict, "update_available");
      const cached = readUpdateCache(home);
      assert.equal(cached?.version, "v1.1.0");
      assert.equal(cached?.current_commit, clone.head);
      assert.equal(cached?.remote_commit, clone.stable);
    }
  } finally {
    w.cleanup();
  }
});

test("a clone's local 'commits behind' line counts the clone, from any directory", () => {
  // No network: the line reads local refs only. The unrelated project is one
  // commit behind its `origin/stable`; the clone is two behind its own.
  const w = world();
  try {
    const clone = cloneInstall(w);
    const cards = fromEach(
      [w.outside, w.unrelated],
      () =>
        composeWelcome({
          mirrorHome: freshHome(w),
          install: clone.install,
          env: NOT_CHECKING,
          version: "1.0.0",
          osHome: w.osHome,
        }).card,
    );
    for (const card of cards) {
      assert.match(
        card,
        /^New Version Available: 2 commits behind origin\/stable · run runtime update$/m,
      );
    }
  } finally {
    w.cleanup();
  }
});

test("a clone remote slower than the budget is cut at the budget", () => {
  const w = world();
  const saved = {
    command: process.env.GIT_SSH_COMMAND,
    variant: process.env.GIT_SSH_VARIANT,
  };
  try {
    const clone = cloneInstall(w);
    // CR132's stand-in: an ssh that takes 3 s, then serves the local remote.
    const slow = join(w.root, "slow-ssh");
    writeFileSync(slow, '#!/bin/sh\nsleep 3\nshift\nexec sh -c "$1"\n');
    chmodSync(slow, 0o755);
    git(clone.install.repository, "remote", "set-url", "origin", `ssh://fixture${clone.origin}`);
    process.env.GIT_SSH_COMMAND = slow;
    process.env.GIT_SSH_VARIANT = "simple";

    const home = freshHome(w);
    const started = Date.now();
    const render = fromEach([w.unrelated], () =>
      composeWelcome({
        mirrorHome: home,
        install: clone.install,
        env: CHECKING,
        version: "1.0.0",
        osHome: w.osHome,
        remoteBudgetMs: 1_000,
      }),
    )[0];
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 4_000, `the card took ${elapsed} ms on a 1 s budget`);
    assert.equal(render?.check?.verdict, "unknown");
    assert.doesNotMatch(render?.card ?? "", /✨/);
    assert.equal(existsSync(join(home, UPDATE_CHECK_CACHE)), false);
  } finally {
    for (const [name, value] of [
      ["GIT_SSH_COMMAND", saved.command],
      ["GIT_SSH_VARIANT", saved.variant],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    w.cleanup();
  }
});

// ------------------------------------------------------------------ channel

test("the channel line and the check follow the install's own channel", () => {
  const w = world();
  try {
    // A package keeps its channel beside the user's config file.
    mkdirSync(join(w.osHome, ".config", "mirror"), { recursive: true });
    writeFileSync(join(w.osHome, ".config", "mirror", "update-channel"), "main\n");
    const npm = registry({ stable: "1.1.0", main: "1.2.0" });
    const pkg = fromEach(
      [w.outside, w.unrelated],
      () =>
        composeWelcome({
          mirrorHome: freshHome(w),
          install: packageInstall(w),
          env: CHECKING,
          version: "1.0.0",
          osHome: w.osHome,
          npm: npm.runner,
        }).card,
    );
    for (const card of pkg) assert.match(card, /^Version 1\.0\.0 · channel main$/m);
    // The card checks `stable` only, as it always has.
    assert.deepEqual(npm.calls, []);

    // A clone keeps it in its own marker, whatever the cwd holds.
    const clone = cloneInstall(w);
    writeFileSync(join(clone.install.repository, ".mirror-update-channel"), "main\n");
    writeFileSync(join(w.unrelated, ".mirror-update-channel"), "stable\n");
    const cards = fromEach([w.outside, w.unrelated], () =>
      composeWelcome({
        mirrorHome: freshHome(w),
        install: clone.install,
        env: CHECKING,
        version: "1.0.0",
        osHome: w.osHome,
      }),
    );
    for (const render of cards) {
      assert.match(render.card, /^Version 1\.0\.0 · channel main$/m);
      assert.equal(render.check, null);
    }
  } finally {
    w.cleanup();
  }
});

// -------------------------------------------------------------- stale verdicts

test("a cached update for the installed version, or an older one, no longer applies", () => {
  assert.equal(verdictApplies(awareness({ version: "v1.0.1" }), "1.0.0"), true);
  assert.equal(verdictApplies(awareness({ version: "v1.0.0" }), "1.0.0"), false);
  assert.equal(verdictApplies(awareness({ version: "v0.32.1" }), "0.33.0"), false);
  // Nothing can judge a verdict without a version: it stands, as before.
  assert.equal(verdictApplies(awareness({ version: null }), "1.0.0"), true);
  // Only an update can go stale this way.
  assert.equal(
    verdictApplies(awareness({ availability: "up_to_date", version: "v0.1.0" }), "1.0.0"),
    true,
  );
});

test("neither surface shows a cached update the install already has", () => {
  const w = world();
  try {
    const install = packageInstall(w);
    const surfaces = (version: string | null): { card: string; line: string } => {
      const home = freshHome(w);
      writeUpdateCache(home, awareness({ version }));
      return {
        card: composeWelcome({
          mirrorHome: home,
          install,
          env: NOT_CHECKING,
          version: "1.0.0",
          osHome: w.osHome,
        }).card,
        line: composeStatusLine({ mirrorHome: home, installedVersion: "1.0.0", env: CHECKING }),
      };
    };

    for (const stale of ["v1.0.0", "v0.9.9"]) {
      const { card, line } = surfaces(stale);
      assert.doesNotMatch(card, /New Version Available/, stale);
      assert.match(line, / · ✓$/, stale);
    }
    const newer = surfaces("v1.0.1");
    assert.match(newer.card, /^✨ New Version Available: v1\.0\.1$/m);
    assert.match(newer.line, / · ⬆ v1\.0\.1$/);
    const unversioned = surfaces(null);
    assert.match(unversioned.card, /^✨ New Version Available on stable$/m);
    assert.match(unversioned.line, / · ⬆$/);
  } finally {
    w.cleanup();
  }
});

test("the oracle's own case, v9.9.9 cached at an install of 9.9.9, is now hidden by both surfaces", () => {
  // The welcome golden recorded this card with the update line: the oracle's
  // fixture installed 9.9.9 and cached an update to v9.9.9. It is the stale
  // verdict CR135 stops showing, and the golden's installed version moved to
  // 9.9.8 so its recorded update lines stay true.
  const w = world();
  try {
    const home = freshHome(w);
    writeUpdateCache(
      home,
      awareness({ version: "v9.9.9", title: "Uma travessia — with an em dash" }),
    );
    const card = composeWelcome({
      mirrorHome: home,
      install: { kind: "unknown", reason: "fixture" },
      env: NOT_CHECKING,
      version: "9.9.9",
      osHome: w.osHome,
    }).card;
    assert.doesNotMatch(card, /New Version Available/);
    assert.match(
      composeStatusLine({ mirrorHome: home, installedVersion: "9.9.9", env: CHECKING }),
      / · ✓$/,
    );
  } finally {
    w.cleanup();
  }
});

// ------------------------------------------------------------- update writer

test("a successful update records up_to_date for the channel it followed", () => {
  const w = world();
  try {
    const clone = freshHome(w);
    recordUpToDate(clone, {
      channel: "stable",
      commit: "abc1234",
      checkedAt: "2026-10-14T20:00:00+00:00",
    });
    assert.deepEqual(readUpdateCache(clone), {
      availability: "up_to_date",
      checked_at: "2026-10-14T20:00:00+00:00",
      channel: "stable",
      current_commit: "abc1234",
      remote_commit: "abc1234",
      version: null,
      title: null,
      note: null,
    });

    // Over a stale verdict, for a package: no commits.
    const pkg = freshHome(w);
    writeUpdateCache(pkg, awareness({ version: "v1.1.0" }));
    recordUpToDate(pkg, { channel: "main", commit: null, checkedAt: "2026-10-14T20:00:00+00:00" });
    const cached = readUpdateCache(pkg);
    assert.equal(cached?.availability, "up_to_date");
    assert.equal(cached?.channel, "main");
    assert.equal(cached?.current_commit, null);
    assert.equal(cached?.version, null);
    assert.match(
      composeStatusLine({ mirrorHome: pkg, installedVersion: "1.1.0", env: CHECKING }),
      / · ✓$/,
    );
  } finally {
    w.cleanup();
  }
});

// ---------------------------------------------------------------- the route

test("the route logs what the check asked, how it answered, and how long it took", () => {
  const w = world();
  try {
    const home = freshHome(w);
    const io = {
      env: CHECKING,
      install: packageInstall(w),
      npm: registry({ stable: "1.1.0" }).runner,
      osHome: w.osHome,
      stdout: () => {},
    };
    runWelcomeRoute(["welcome", "--mirror-home", home], io);
    const log = readFileSync(join(home, "front-door.log"), "utf8");
    assert.match(
      log,
      /\twelcome\tts\texit=0\tupdate-check source=registry verdict=update_available ms=\d+\n$/,
    );

    // No check, no line.
    const quiet = freshHome(w);
    runWelcomeRoute(["welcome", "--mirror-home", quiet], { ...io, env: NOT_CHECKING });
    assert.equal(existsSync(join(quiet, "front-door.log")), false);
  } finally {
    w.cleanup();
  }
});
