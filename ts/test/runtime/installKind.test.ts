// CV22.DS10.US2 plateau 3 — where is this Mirror installed?
//
// The answer decides whether the next step is `git merge --ff-only` or
// `npm install -g`, so a wrong answer is not a wrong label: it is an update
// applied to the wrong tree.

import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { describeInstallKind, detectInstallKind } from "#runtime/installKind.ts";

/** A filesystem that exists only as a set of paths. */
function fs(paths: readonly string[]) {
  const set = new Set(paths.map((path) => path.replace(/\/+$/, "")));
  return (path: string) => set.has(path.replace(/\/+$/, ""));
}

test("a git checkout carrying ts/package.json is a clone", () => {
  const root = "/home/dev/mirror";
  const kind = detectInstallKind({
    frontDoorPath: join(root, "ts/src/frontDoor/cli.ts"),
    exists: fs([join(root, ".git"), join(root, "ts/package.json")]),
  });
  assert.deepEqual(kind, { kind: "clone", repository: root });
  assert.match(describeInstallKind(kind), /^clone \(/);
});

test("a global npm install is a package, named and versioned from its manifest", () => {
  const globalRoot = "/usr/local/lib/node_modules";
  const pkg = join(globalRoot, "mirror-core");
  const kind = detectInstallKind({
    frontDoorPath: join(pkg, "dist/frontDoor/cli.js"),
    npmRootGlobal: globalRoot,
    exists: fs([join(pkg, "package.json")]),
    readFile: () => JSON.stringify({ name: "mirror-core", version: "1.2.3" }),
  });
  assert.deepEqual(kind, { kind: "package", root: pkg, name: "mirror-core", version: "1.2.3" });
  assert.equal(describeInstallKind(kind), "package (mirror-core@1.2.3)");
});

test("a PROJECT-LOCAL node_modules is not a package install", () => {
  // The trap: being under some `node_modules/` is not being under the GLOBAL
  // one. `npm install -g` would update a different tree from the one running,
  // and the user would watch an update succeed and change nothing.
  const local = "/home/dev/someapp/node_modules/mirror-core";
  const kind = detectInstallKind({
    frontDoorPath: join(local, "dist/frontDoor/cli.js"),
    npmRootGlobal: "/usr/local/lib/node_modules",
    exists: fs([join(local, "package.json")]),
    readFile: () => JSON.stringify({ name: "mirror-core", version: "1.2.3" }),
  });
  assert.equal(kind.kind, "unknown");
  assert.match(kind.kind === "unknown" ? kind.reason : "", /global npm root/);
});

test("a path that merely SHARES A PREFIX with the global root is not inside it", () => {
  // `/usr/local/lib/node_modules-old/...` starts with the global root as a
  // string and is a different directory. Component-wise containment, not
  // `startsWith`.
  const kind = detectInstallKind({
    frontDoorPath: "/usr/local/lib/node_modules-old/mirror-core/dist/cli.js",
    npmRootGlobal: "/usr/local/lib/node_modules",
    exists: fs(["/usr/local/lib/node_modules-old/mirror-core/package.json"]),
    readFile: () => JSON.stringify({ name: "mirror-core", version: "1.2.3" }),
  });
  assert.equal(kind.kind, "unknown");
});

test("without npm, a non-checkout is unknown and says npm is why", () => {
  const kind = detectInstallKind({
    frontDoorPath: "/opt/somewhere/cli.js",
    npmRootGlobal: null,
    exists: fs([]),
  });
  assert.equal(kind.kind, "unknown");
  assert.match(kind.kind === "unknown" ? kind.reason : "", /npm is unavailable/);
});

test("a checkout without ts/package.json is not this project's clone", () => {
  // A `.git` alone is any repository. The updater must not fast-forward a
  // tree that merely happens to contain the front door.
  const kind = detectInstallKind({
    frontDoorPath: "/home/dev/other/tools/cli.ts",
    exists: fs(["/home/dev/other/.git"]),
  });
  assert.equal(kind.kind, "unknown");
});

test("the real front door in this checkout detects as a clone", () => {
  // The one test that touches the real filesystem: the detector must agree
  // with reality for the repository it is running in.
  const kind = detectInstallKind({
    frontDoorPath: new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname,
  });
  assert.equal(kind.kind, "clone");
});
