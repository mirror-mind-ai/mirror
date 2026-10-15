// CR134 — `release-notes pending` answers for the install that is running,
// never for the cwd.
//
// Run in-process with the install and its npm injected, as the welcome route's
// tests do: a spawned front door would detect THIS checkout, whose refs differ
// between a developer machine and CI's shallow clone. Each case runs from two
// directories -- one outside any repository, and one inside an unrelated
// project whose own `origin/stable` holds `v9.9.9` -- and the answer must not
// move. The process's own cwd moves with them, so a reader that fell back to
// `process.cwd()` would be caught the same way.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { runRuntimeReadRoute } from "#frontDoor/runtimeRoute.ts";
import type { InstallKind } from "#runtime/installKind.ts";
import type { NpmRunner } from "#runtime/strategies/package.ts";

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

function note(version: string, title: string): string {
  return `# v${version} — ${title}\n\n## Highlights\n\n- ${title}, highlighted\n`;
}

function commitNotes(repo: string, notes: Record<string, string>, message: string): void {
  mkdirSync(join(repo, "docs", "releases"), { recursive: true });
  for (const [version, title] of Object.entries(notes)) {
    writeFileSync(join(repo, "docs", "releases", `v${version}.md`), note(version, title));
  }
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", message);
}

interface World {
  root: string;
  /** A directory in no repository. */
  plain: string;
  /** Another project's clone: its `origin/stable` holds `v9.9.9`. */
  unrelated: string;
  /** The install's own checkout. */
  clone: string;
  /** XDG_CONFIG_HOME, where a package keeps its channel. */
  configHome: string;
  cleanup: () => void;
}

/**
 * The install's project has `v0.9.0` and `v0.10.0` when the install clones
 * it; `v0.11.0` reaches its `stable` only afterwards, so seeing it proves the
 * fetch ran in the install's clone. Its `main` carries `v0.12.0`.
 */
function world(): World {
  const root = realpathSync(mkdtempSync("/tmp/pending-release-notes-"));
  const seed = join(root, "seed");
  mkdirSync(seed);
  git(seed, "init", "--quiet", "--initial-branch=stable");
  commitNotes(seed, { "0.9.0": "Ninth", "0.10.0": "Tenth" }, "notes");
  const remote = join(root, "remote.git");
  git(root, "clone", "--quiet", "--bare", seed, remote);
  const clone = join(root, "clone");
  git(root, "clone", "--quiet", remote, clone);
  commitNotes(seed, { "0.11.0": "Eleventh" }, "eleventh");
  git(seed, "push", "--quiet", remote, "stable");
  git(seed, "checkout", "--quiet", "-b", "main");
  commitNotes(seed, { "0.12.0": "Twelfth" }, "twelfth");
  git(seed, "push", "--quiet", remote, "main");

  const other = join(root, "other");
  mkdirSync(other);
  git(other, "init", "--quiet", "--initial-branch=stable");
  commitNotes(other, { "9.9.9": "Not Mirror" }, "another project's notes");
  const otherRemote = join(root, "other.git");
  git(root, "clone", "--quiet", "--bare", other, otherRemote);
  const unrelated = join(root, "unrelated");
  git(root, "clone", "--quiet", otherRemote, unrelated);
  rmSync(join(unrelated, ".git", "FETCH_HEAD"), { force: true });

  const plain = join(root, "plain");
  mkdirSync(plain);
  const configHome = join(root, "config");
  mkdirSync(configHome);
  return {
    root,
    plain,
    unrelated,
    clone,
    configHome,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function pending(
  w: World,
  cwd: string,
  install: InstallKind,
  args: string[] = [],
  npm?: NpmRunner,
): Promise<Run> {
  let stdout = "";
  let stderr = "";
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    const code = await runRuntimeReadRoute(["runtime", "release-notes", "pending", ...args], {
      cwd,
      env: { ...process.env, XDG_CONFIG_HOME: w.configHome },
      install,
      osHome: w.root,
      ...(npm === undefined ? {} : { npm }),
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

const fetchHead = (repo: string): boolean => existsSync(join(repo, ".git", "FETCH_HEAD"));

// --- a clone -----------------------------------------------------------------

test("a clone reads its own channel ref, fetched in its own repository, from any cwd", async () => {
  const w = world();
  try {
    const install: InstallKind = { kind: "clone", repository: w.clone };
    const fromPlain = await pending(w, w.plain, install, ["--from", "0.9.0"]);
    rmSync(join(w.clone, ".git", "FETCH_HEAD"), { force: true });
    const fromUnrelated = await pending(w, w.unrelated, install, ["--from", "0.9.0"]);

    assert.equal(fromUnrelated.stdout, fromPlain.stdout, "the cwd moved the answer");
    assert.equal(fromPlain.code, 0, fromPlain.stdout + fromPlain.stderr);
    assert.match(fromPlain.stdout, /^Source: origin\/stable$/m);
    assert.match(fromPlain.stdout, /^Pending releases: 2$/m);
    assert.match(fromPlain.stdout, /^## v0\.10\.0 — Tenth$/m);
    assert.match(
      fromPlain.stdout,
      /^## v0\.11\.0 — Eleventh$/m,
      "v0.11.0 reached the remote after the clone: only a fetch in the install's clone sees it",
    );
    assert.doesNotMatch(fromPlain.stdout, /9\.9\.9|Not Mirror/);
    assert.ok(fetchHead(w.clone), "the install's clone was fetched");
    assert.ok(!fetchHead(w.unrelated), "the cwd's repository was fetched into");
  } finally {
    w.cleanup();
  }
});

test("a clone follows its own channel: `main` reads origin/main", async () => {
  const w = world();
  try {
    writeFileSync(join(w.clone, ".mirror-update-channel"), "main\n");
    const install: InstallKind = { kind: "clone", repository: w.clone };
    const run = await pending(w, w.unrelated, install, ["--from", "0.11.0"]);
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /^Source: origin\/main$/m);
    assert.match(run.stdout, /^## v0\.12\.0 — Twelfth$/m);
  } finally {
    w.cleanup();
  }
});

test("a clone whose fetch fails says unknown; --no-fetch reads the ref as last fetched", async () => {
  const w = world();
  try {
    git(w.clone, "remote", "set-url", "origin", join(w.root, "gone.git"));
    const install: InstallKind = { kind: "clone", repository: w.clone };

    const failed = await pending(w, w.plain, install, ["--from", "0.9.0"]);
    assert.equal(failed.code, 1, failed.stdout);
    assert.match(failed.stdout, /^Pending releases: unknown$/m);
    assert.match(failed.stdout, /^Reason: fetch failed: .+$/m);
    assert.doesNotMatch(failed.stdout, /Pending releases: none/);

    const offline = await pending(w, w.plain, install, ["--from", "0.9.0", "--no-fetch"]);
    assert.equal(offline.code, 0, offline.stdout);
    assert.match(offline.stdout, /^## v0\.10\.0 — Tenth$/m);
    assert.doesNotMatch(offline.stdout, /v0\.11\.0/, "the last fetched ref predates v0.11.0");
  } finally {
    w.cleanup();
  }
});

test("a ref that does not resolve is unknown, not none", async () => {
  const w = world();
  try {
    const install: InstallKind = { kind: "clone", repository: w.clone };
    const run = await pending(w, w.plain, install, ["--ref", "origin/nope", "--no-fetch"]);
    assert.equal(run.code, 1, run.stdout);
    assert.match(run.stdout, /^Source: origin\/nope$/m);
    assert.match(run.stdout, /^Pending releases: unknown$/m);
    assert.match(run.stdout, /^Reason: ref origin\/nope does not resolve$/m);
  } finally {
    w.cleanup();
  }
});

test("a ref cannot become a git option, on either side of its first slash", async () => {
  // Run from the unrelated project: until CR134 the fetch ran in the cwd's
  // repository, so that is where an injected command would have landed.
  const w = world();
  try {
    const install: InstallKind = { kind: "clone", repository: w.clone };
    for (const ref of ["--upload-pack=touch PWNED-A/x", "origin/--upload-pack=touch PWNED-B"]) {
      const run = await pending(w, w.unrelated, install, ["--ref", ref]);
      assert.equal(run.code, 1, `${ref}: ${run.stdout}`);
      assert.match(run.stdout, /^Pending releases: unknown$/m, ref);
    }
    for (const dir of [w.clone, w.unrelated, w.plain, join(w.root, "remote.git")]) {
      for (const name of ["PWNED-A", "PWNED-B", "x"]) {
        assert.ok(!existsSync(join(dir, name)), `${name} was created in ${dir}`);
      }
    }
  } finally {
    w.cleanup();
  }
});

// --- a package ---------------------------------------------------------------

interface NpmCall {
  args: string[];
  cwd: string | undefined;
}

/** A tarball as the registry serves one: everything under `package/`. */
function tarball(w: World, versions: string[]): string {
  const source = join(w.root, `tarball-${versions.join("-")}`);
  mkdirSync(join(source, "package", "docs", "releases"), { recursive: true });
  writeFileSync(
    join(source, "package", "package.json"),
    JSON.stringify({ name: "mirror-mind", version: versions.at(-1) }),
  );
  writeFileSync(join(source, "package", "docs", "releases", "index.md"), "# Releases\n");
  for (const version of versions) {
    writeFileSync(
      join(source, "package", "docs", "releases", `v${version}.md`),
      note(version, `Release ${version}`),
    );
  }
  const out = join(w.root, `mirror-mind-${versions.at(-1)}.source.tgz`);
  execFileSync("tar", ["-czf", out, "-C", source, "package"], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  return out;
}

/**
 * `npm view <name> dist-tags --json` and `npm pack <name>@<version> ...`, as
 * the registry would answer them. Every call is recorded with its directory.
 */
function fakeNpm(
  tags: Record<string, string> | { fail: string },
  tgz: string | null,
  calls: NpmCall[],
  destinations: string[],
): NpmRunner {
  return (args, call) => {
    calls.push({ args: [...args], cwd: call?.cwd });
    if (args[0] === "view") {
      if ("fail" in tags) return { code: 1, stdout: "", stderr: `${tags.fail}\n` };
      return { code: 0, stdout: JSON.stringify(tags), stderr: "" };
    }
    if (args[0] === "pack") {
      if (tgz === null) return { code: 1, stdout: "", stderr: "npm error 404 Not Found\n" };
      const destination = args[args.indexOf("--pack-destination") + 1] as string;
      destinations.push(destination);
      const filename = `${(args[1] as string).replace("@", "-")}.tgz`;
      copyFileSync(tgz, join(destination, filename));
      return { code: 0, stdout: JSON.stringify([{ filename }]), stderr: "" };
    }
    return { code: 1, stdout: "", stderr: `unexpected npm call: ${args.join(" ")}\n` };
  };
}

function packageInstall(w: World, version = "0.9.0"): InstallKind & { kind: "package" } {
  const root = join(w.root, "prefix", "lib", "node_modules", "mirror-mind");
  mkdirSync(root, { recursive: true });
  return { kind: "package", root, name: "mirror-mind", version };
}

test("a package lists what its channel's version brings, from that tarball, from any cwd", async () => {
  const w = world();
  try {
    const install = packageInstall(w);
    const calls: NpmCall[] = [];
    const destinations: string[] = [];
    const npm = fakeNpm(
      { latest: "0.11.0", stable: "0.11.0" },
      tarball(w, ["0.9.0", "0.10.0", "0.11.0"]),
      calls,
      destinations,
    );

    const fromPlain = await pending(w, w.plain, install, [], npm);
    const fromUnrelated = await pending(w, w.unrelated, install, [], npm);
    assert.equal(fromUnrelated.stdout, fromPlain.stdout, "the cwd moved the answer");
    assert.equal(fromPlain.code, 0, fromPlain.stdout + fromPlain.stderr);
    assert.match(fromPlain.stdout, /^Current version: v0\.9\.0$/m, "the installed version");
    assert.match(fromPlain.stdout, /^Source: npm mirror-mind@stable \(0\.11\.0\)$/m);
    assert.match(fromPlain.stdout, /^Pending releases: 2$/m);
    assert.match(fromPlain.stdout, /^## v0\.10\.0 — Release 0\.10\.0$/m);
    assert.match(fromPlain.stdout, /^## v0\.11\.0 — Release 0\.11\.0$/m);
    assert.doesNotMatch(fromPlain.stdout, /## v0\.9\.0|9\.9\.9/);

    for (const call of calls) {
      assert.equal(call.cwd, install.root, `npm ${call.args.join(" ")} ran in ${call.cwd}`);
    }
    const packs = calls.filter((call) => call.args[0] === "pack");
    assert.equal(packs.length, 2, "one tarball per check that finds an update");
    for (const pack of packs) {
      assert.equal(pack.args[1], "mirror-mind@0.11.0", "the exact version, never the tag");
      assert.ok(pack.args.includes("--ignore-scripts"), "no script runs at the trust boundary");
    }
    for (const destination of destinations) {
      assert.ok(!existsSync(destination), `the tarball's directory ${destination} was left behind`);
    }
    assert.ok(!fetchHead(w.unrelated), "the cwd's repository was fetched into");
  } finally {
    w.cleanup();
  }
});

test("a package whose channel is current or behind downloads nothing and has none", async () => {
  const w = world();
  try {
    const install = packageInstall(w);
    for (const stable of ["0.9.0", "0.8.0"]) {
      const calls: NpmCall[] = [];
      const npm = fakeNpm({ stable }, tarball(w, ["0.9.0"]), calls, []);
      const run = await pending(w, w.plain, install, [], npm);
      assert.equal(run.code, 0, run.stdout + run.stderr);
      assert.match(
        run.stdout,
        new RegExp(`^Source: npm mirror-mind@stable \\(${stable.replaceAll(".", "\\.")}\\)$`, "m"),
      );
      assert.match(run.stdout, /^Pending releases: none$/m);
      assert.ok(
        calls.every((call) => call.args[0] !== "pack"),
        `stable ${stable}: a tarball was fetched for nothing`,
      );
    }
  } finally {
    w.cleanup();
  }
});

test("a package compares against --from when it is given", async () => {
  const w = world();
  try {
    const install = packageInstall(w, "0.11.0");
    const npm = fakeNpm({ stable: "0.11.0" }, tarball(w, ["0.9.0", "0.10.0", "0.11.0"]), [], []);
    const run = await pending(w, w.plain, install, ["--from", "0.10.0"], npm);
    assert.equal(run.code, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /^Current version: v0\.10\.0$/m);
    assert.match(run.stdout, /^Pending releases: 1$/m);
    assert.match(run.stdout, /^## v0\.11\.0 — Release 0\.11\.0$/m);
  } finally {
    w.cleanup();
  }
});

test("a package says unknown when the registry, the tag, or the tarball cannot answer", async () => {
  const w = world();
  try {
    const install = packageInstall(w);
    const cases: Array<[string, NpmRunner, RegExp]> = [
      [
        "registry unreachable",
        fakeNpm({ fail: "npm error code ENOTFOUND" }, null, [], []),
        /^Reason: npm error code ENOTFOUND$/m,
      ],
      [
        "no such tag",
        fakeNpm({ latest: "0.11.0" }, null, [], []),
        /^Reason: no dist-tag 'stable'/m,
      ],
      [
        "pack fails",
        fakeNpm({ stable: "0.11.0" }, null, [], []),
        /^Reason: npm error 404 Not Found$/m,
      ],
    ];
    for (const [label, npm, reason] of cases) {
      const run = await pending(w, w.plain, install, [], npm);
      assert.equal(run.code, 1, `${label}: ${run.stdout}`);
      assert.match(run.stdout, /^Pending releases: unknown$/m, label);
      assert.match(run.stdout, reason, label);
    }
  } finally {
    w.cleanup();
  }
});

test("a package's tarball past the bound is unknown, not read", async () => {
  const w = world();
  try {
    const install = packageInstall(w);
    // About 65 KB of gzip that inflates past the 64 MB bound.
    const bomb = join(w.root, "bomb.tgz");
    writeFileSync(bomb, gzipSync(Buffer.alloc(65 * 1024 * 1024)));
    const run = await pending(w, w.plain, install, [], fakeNpm({ stable: "0.11.0" }, bomb, [], []));
    assert.equal(run.code, 1, run.stdout);
    assert.match(run.stdout, /^Pending releases: unknown$/m);
    assert.match(run.stdout, /^Reason: the archive inflates to more than 67108864 bytes$/m);
  } finally {
    w.cleanup();
  }
});

test("a package cannot read offline, and refuses --ref as a usage error", async () => {
  const w = world();
  try {
    const install = packageInstall(w);
    const calls: NpmCall[] = [];
    const npm = fakeNpm({ stable: "0.11.0" }, null, calls, []);

    const offline = await pending(w, w.plain, install, ["--no-fetch"], npm);
    assert.equal(offline.code, 1, offline.stdout);
    assert.match(offline.stdout, /^Pending releases: unknown$/m);
    assert.match(offline.stdout, /^Reason: a package keeps no copy of its channel/m);

    const withRef = await pending(w, w.plain, install, ["--ref", "origin/stable"], npm);
    assert.equal(withRef.code, 2);
    assert.equal(withRef.stdout, "");
    assert.match(withRef.stderr, /--ref names a git ref/);

    assert.deepEqual(calls, [], "npm was asked anyway");
  } finally {
    w.cleanup();
  }
});

// --- an install that cannot be identified --------------------------------------

test("an unknown install says unknown, with the detector's reason", async () => {
  const w = world();
  try {
    const install: InstallKind = {
      kind: "unknown",
      reason: "not a git checkout, and not laid out as a global npm install",
    };
    const run = await pending(w, w.unrelated, install, ["--from", "0.9.0"]);
    assert.equal(run.code, 1, run.stdout);
    assert.match(run.stdout, /^Pending releases: unknown$/m);
    assert.match(
      run.stdout,
      /^Reason: install kind unknown \(not a git checkout, and not laid out as a global npm install\)$/m,
    );
    assert.doesNotMatch(run.stdout, /9\.9\.9/);
    assert.ok(!fetchHead(w.unrelated), "the cwd's repository was fetched into");
  } finally {
    w.cleanup();
  }
});
