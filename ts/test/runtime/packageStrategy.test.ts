// CV22.DS10.US3 plateau 4 — `runtime update --check` for a package install.
//
// Until this plateau `--check` was git for every install kind: on a package
// it ran `ls-remote` from whatever directory the person stood in. A package
// checks the registry's dist-tags, the same question the pipeline's plan
// stage asks, and says which way the channel lies.

import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { assertNamesNoInterpreter } from "#helpers/noInterpreter.ts";
import {
  applyCwd,
  checkPackageUpdateAvailability,
  installGlobal,
  type NpmCall,
  type NpmRunner,
  npmInvocation,
  npmRootGlobal,
  packageStrategy,
  readDistTags,
  renderPackageUpdateAvailability,
} from "#runtime/strategies/package.ts";

const INSTALL = {
  name: "mirror-mind",
  version: "0.31.14",
  root: "/usr/local/lib/node_modules/mirror-mind",
};
const STABLE = { value: "stable", note: null };

function npmAnswering(tags: Record<string, string> | null): NpmRunner {
  return (args) => {
    if (args[0] === "view" && tags !== null) {
      return { code: 0, stdout: JSON.stringify(tags), stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "npm ERR! code ENOTFOUND\n" };
  };
}

test("a channel ahead of the install is an available update, named by version", () => {
  const report = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ stable: "0.32.0", main: "0.33.0" }),
  );
  assert.equal(report.status, "update_available");
  assert.equal(report.resolved, "0.32.0");
  const render = renderPackageUpdateAvailability(report);
  assert.match(render, /^Mirror runtime update check\n\n/);
  assert.match(render, /^Version: 0\.31\.14$/m);
  assert.match(render, /^Install: package \(mirror-mind@0\.31\.14\)$/m);
  assert.match(render, /^Update channel: stable$/m);
  assert.match(render, /^Channel version: 0\.32\.0$/m);
  assert.match(render, /^Availability: update_available$/m);
  assert.match(render, /^Preview:\nruntime update --dry-run$/m);
  assert.match(render, /^Update:\nruntime update$/m);
  assertNamesNoInterpreter(render);
});

test("a channel at the installed version is up to date", () => {
  const report = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ stable: "0.31.14" }),
  );
  assert.equal(report.status, "up_to_date");
  const render = renderPackageUpdateAvailability(report);
  assert.match(render, /^Availability: up_to_date$/m);
  assert.match(render, /^Next: no update needed$/m);
  assert.doesNotMatch(render, /^Update:$/m);
});

test("a channel behind the install is named as behind, with the channel that carries it", () => {
  // A `main` install that switched to `stable` before stable caught up.
  const report = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ stable: "0.31.9", main: "0.31.14" }),
  );
  assert.equal(report.status, "channel_behind");
  assert.equal(report.resolved, "0.31.9");
  const render = renderPackageUpdateAvailability(report);
  assert.match(render, /^Availability: channel_behind$/m);
  assert.match(
    render,
    /^Reason: 'stable' is behind the installed version \(0\.31\.9 < 0\.31\.14\)$/m,
  );
  assert.match(render, /^Next: runtime channel main$/m);
  assert.doesNotMatch(render, /^Update:$/m, "a behind channel is never offered as an update");
});

test("an unreachable registry or an unknown tag is unresolved, with the reason", () => {
  const offline = checkPackageUpdateAvailability(INSTALL, STABLE, npmAnswering(null));
  assert.equal(offline.status, "unresolved");
  assert.equal(offline.resolved, null);
  assert.match(renderPackageUpdateAvailability(offline), /^Channel version: unresolved$/m);
  assert.match(renderPackageUpdateAvailability(offline), /^Reason: npm ERR! code ENOTFOUND$/m);

  const untagged = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ main: "0.33.0" }),
  );
  assert.equal(untagged.status, "unresolved");
  assert.match(untagged.note ?? "", /no dist-tag 'stable'/);

  const notAVersion = checkPackageUpdateAvailability(
    INSTALL,
    STABLE,
    npmAnswering({ stable: "file:/tmp/x" }),
  );
  assert.equal(notAVersion.status, "unresolved");
  assert.match(notAVersion.note ?? "", /is not a version/);
});

/** An npm that records each call's argv and options, and answers `stdout`. */
function recording(stdout: string): {
  runner: NpmRunner;
  calls: { args: string[]; call: NpmCall | undefined }[];
} {
  const calls: { args: string[]; call: NpmCall | undefined }[] = [];
  return {
    calls,
    runner: (args, call) => {
      calls.push({ args: [...args], call });
      return { code: 0, stdout, stderr: "" };
    },
  };
}

test("apply runs npm from the parent of node_modules, never inside the package it replaces", () => {
  // npm renames the package directory aside before installing the new version;
  // on Windows a process whose cwd is inside that directory holds it against
  // the rename (EBUSY, every time). The parent of node_modules is still the
  // install's own tree, so CR135's rule -- never the person's project -- holds.
  assert.equal(applyCwd("/usr/local/lib/node_modules/mirror-mind"), "/usr/local/lib");
  const npm = recording("changed 2 packages\n");
  const applied = packageStrategy(INSTALL, "stable", npm.runner).apply("0.31.14", "0.35.0");
  assert.equal(applied.ok, true);
  assert.deepEqual(npm.calls, [
    { args: ["install", "-g", "mirror-mind@0.35.0"], call: { cwd: "/usr/local/lib" } },
  ]);
  assert.equal(npm.calls[0]?.call.cwd?.startsWith(INSTALL.root), false);
});

test("every npm call runs where it is told, so a project's .npmrc cannot answer it (CR135)", () => {
  // npm reads the project config of the directory it runs in. The person's
  // project can carry an `.npmrc` that names another registry or prefix, so
  // the package's own calls run in the install's own tree: its root, or for
  // the apply the parent of node_modules (the test above).
  const view = recording(JSON.stringify({ stable: "0.32.0" }));
  checkPackageUpdateAvailability(INSTALL, STABLE, view.runner);
  assert.deepEqual(view.calls, [
    { args: ["view", "mirror-mind", "dist-tags", "--json"], call: { cwd: INSTALL.root } },
  ]);

  const install = recording("added 1 package\n");
  installGlobal("mirror-mind", "0.32.0", INSTALL.root, install.runner);
  assert.deepEqual(install.calls, [
    { args: ["install", "-g", "mirror-mind@0.32.0"], call: { cwd: INSTALL.root } },
  ]);

  // `root -g` runs before the install is known: in the tree the front door
  // runs from, which for a package is its root.
  const root = recording("/usr/local/lib/node_modules\n");
  assert.equal(npmRootGlobal(INSTALL.root, root.runner), "/usr/local/lib/node_modules");
  assert.deepEqual(root.calls, [{ args: ["root", "-g"], call: { cwd: INSTALL.root } }]);
});

test("readDistTags bounds the read and drops npm's retries only when asked (CR135)", () => {
  const plain = recording(JSON.stringify({ stable: "0.32.0" }));
  readDistTags("mirror-mind", plain.runner, { cwd: "/x" });
  assert.deepEqual(plain.calls[0], {
    args: ["view", "mirror-mind", "dist-tags", "--json"],
    call: { cwd: "/x" },
  });

  const bounded = recording(JSON.stringify({ stable: "0.32.0" }));
  const read = readDistTags("mirror-mind", bounded.runner, {
    cwd: "/x",
    timeoutMs: 1234,
    fetchRetries: 0,
  });
  assert.deepEqual(read, { ok: true, tags: { stable: "0.32.0" } });
  assert.deepEqual(bounded.calls[0], {
    args: ["view", "mirror-mind", "dist-tags", "--json", "--fetch-retries=0"],
    call: { cwd: "/x", timeoutMs: 1234 },
  });
});

test("the channel's own note travels with the report", () => {
  const report = checkPackageUpdateAvailability(
    INSTALL,
    { value: "stable", note: "unknown channel 'beta', defaulting to stable" },
    npmAnswering({ stable: "0.31.14" }),
  );
  assert.match(
    renderPackageUpdateAvailability(report),
    /^Update channel note: unknown channel 'beta', defaulting to stable$/m,
  );
});

// --- Spawning npm on Windows ---
//
// npm is npm.cmd there, which Node runs only through a shell (since
// CVE-2024-27980 it refuses otherwise), and a shell's timeout ends the shell,
// not the npm under it. Without the shell every probe answered "npm is
// unavailable" on a machine with npm on its PATH, and the update lane refused
// for a reason that was not true.

test("elsewhere than Windows, npm is the file on the PATH, spawned directly", () => {
  assert.deepEqual(npmInvocation(["root", "-g"], "linux", "/usr/bin/node"), {
    file: "npm",
    args: ["root", "-g"],
  });
  assert.deepEqual(npmInvocation(["root", "-g"], "darwin", "/usr/local/bin/node"), {
    file: "npm",
    args: ["root", "-g"],
  });
});

test("on Windows, a node with no npm-cli.js beside it is a named absence, not a stack", () => {
  const node = join("C:\\", "tools", "node", "node.exe");
  const answer = npmInvocation(["root", "-g"], "win32", node, () => false);
  assert.ok("unavailable" in answer);
  assert.match(answer.unavailable, /npm-cli\.js not found beside node: .*tools/);
});

test("on Windows, npm is npm-cli.js beside node.exe, run by the node already running", () => {
  // No shell: the budget's kill reaches npm itself, and nothing is
  // concatenated for a shell to read (DEP0190).
  const node = join("C:\\", "Program Files", "nodejs", "node.exe");
  assert.deepEqual(
    npmInvocation(["view", "mirror-mind", "dist-tags", "--json"], "win32", node, () => true),
    {
      file: node,
      args: [
        join("C:\\", "Program Files", "nodejs", "node_modules", "npm", "bin", "npm-cli.js"),
        "view",
        "mirror-mind",
        "dist-tags",
        "--json",
      ],
    },
  );
});
