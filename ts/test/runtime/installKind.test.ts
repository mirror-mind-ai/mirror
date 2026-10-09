// CV22.DS10.US2 plateau 3 — where is this Mirror installed?
//
// The answer decides whether the next step is `git merge --ff-only` or
// `npm install -g`, so a wrong answer is not a wrong label: it is an update
// applied to the wrong tree.

import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  describeInstallKind,
  detectInstallKind,
  renderInstallLines,
} from "#runtime/installKind.ts";

/** A filesystem that exists only as a set of paths. */
function fs(paths: readonly string[]) {
  const set = new Set(paths.map((path) => path.replace(/\/+$/, "")));
  return (path: string) => set.has(path.replace(/\/+$/, ""));
}

test("a git checkout carrying a root package.json is a clone", () => {
  // CV22.DS10.US3 decision D2: the manifest sits at the repository root.
  const root = "/home/dev/mirror";
  const kind = detectInstallKind({
    frontDoorPath: join(root, "ts/src/frontDoor/cli.ts"),
    exists: fs([join(root, ".git"), join(root, "package.json")]),
  });
  assert.deepEqual(kind, { kind: "clone", repository: root });
  assert.match(describeInstallKind(kind), /^clone \(/);
});

test("a global npm install is a package, named and versioned from its manifest", () => {
  const globalRoot = "/usr/local/lib/node_modules";
  const pkg = join(globalRoot, "mirror-mind");
  const kind = detectInstallKind({
    frontDoorPath: join(pkg, "ts/src/frontDoor/cli.ts"),
    npmRootGlobal: globalRoot,
    exists: fs([join(pkg, "package.json")]),
    readFile: () => JSON.stringify({ name: "mirror-mind", version: "1.2.3" }),
  });
  assert.deepEqual(kind, { kind: "package", root: pkg, name: "mirror-mind", version: "1.2.3" });
  assert.equal(describeInstallKind(kind), "package (mirror-mind@1.2.3)");
});

test("a checkout LINKED under the global root (npm link) is a clone, not a package", () => {
  // `npm link` puts a symlink named like the package under `npm root -g`, so a
  // front door reached through it has a path that LOOKS installed. Updating
  // that with `npm install -g` would replace the developer's link with a
  // registry copy. The detector resolves symlinks before it decides.
  const globalRoot = "/usr/local/lib/node_modules";
  const checkout = "/home/dev/mirror";
  const linked = join(globalRoot, "mirror-mind", "ts/src/frontDoor/cli.ts");
  const kind = detectInstallKind({
    frontDoorPath: linked,
    npmRootGlobal: globalRoot,
    exists: fs([join(checkout, ".git"), join(checkout, "package.json")]),
    realpath: (path) => (path === linked ? join(checkout, "ts/src/frontDoor/cli.ts") : path),
  });
  assert.deepEqual(kind, { kind: "clone", repository: checkout });
});

test("a PROJECT-LOCAL node_modules is not a package install", () => {
  // The trap: being under some `node_modules/` is not being under the GLOBAL
  // one. `npm install -g` would update a different tree from the one running,
  // and the user would watch an update succeed and change nothing.
  const local = "/home/dev/someapp/node_modules/mirror-mind";
  const kind = detectInstallKind({
    frontDoorPath: join(local, "ts/src/frontDoor/cli.ts"),
    npmRootGlobal: "/usr/local/lib/node_modules",
    exists: fs([join(local, "package.json")]),
    readFile: () => JSON.stringify({ name: "mirror-mind", version: "1.2.3" }),
  });
  assert.equal(kind.kind, "unknown");
  assert.match(kind.kind === "unknown" ? kind.reason : "", /global npm root/);
});

test("a path that merely SHARES A PREFIX with the global root is not inside it", () => {
  // `/usr/local/lib/node_modules-old/...` starts with the global root as a
  // string and is a different directory. Component-wise containment, not
  // `startsWith`.
  const kind = detectInstallKind({
    frontDoorPath: "/usr/local/lib/node_modules-old/mirror-mind/ts/src/frontDoor/cli.ts",
    npmRootGlobal: "/usr/local/lib/node_modules",
    exists: fs(["/usr/local/lib/node_modules-old/mirror-mind/package.json"]),
    readFile: () => JSON.stringify({ name: "mirror-mind", version: "1.2.3" }),
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

// --- CV22.DS10.US3 plateau 4: a package is known by its layout, without npm --
//
// `runtime status` and `version` read the install kind too, and they run in
// GUI-launched runtimes whose PATH may not reach npm, and in the package
// smoke, which keeps npm off the PATH on purpose. A subprocess there would
// answer `unknown` for an install that is plainly a package, and that is the
// line a person reads to decide between `npm install -g` and `git pull`.
// `npm root -g` stays the update lane's corroboration that `-g` addresses
// THIS prefix; the read routes do not probe it.

const GLOBAL_MANIFEST = JSON.stringify({
  name: "mirror-mind",
  version: "1.2.3",
  bin: { mirror: "bin/mirror.js", "mirror-hook": "bin/mirror-hook.js" },
});

test("a global prefix layout with the bin linked into the package is a package, with no npm probe", () => {
  const prefix = "/opt/homebrew";
  const pkg = join(prefix, "lib/node_modules/mirror-mind");
  const binLink = join(prefix, "bin/mirror");
  const kind = detectInstallKind({
    frontDoorPath: join(pkg, "ts/src/frontDoor/cli.ts"),
    // No `npmRootGlobal` at all: the probe was not made.
    exists: fs([join(pkg, "package.json"), binLink]),
    readFile: () => GLOBAL_MANIFEST,
    realpath: (path) => (path === binLink ? join(pkg, "bin/mirror.js") : path),
  });
  assert.deepEqual(kind, { kind: "package", root: pkg, name: "mirror-mind", version: "1.2.3" });
});

test("the layout alone is not enough: the prefix's bin must resolve into the package", () => {
  // A project that happens to live at `<x>/lib` has `<x>/lib/node_modules/…`
  // too. What makes a global install global is the bin npm linked beside it.
  const pkg = "/home/dev/lib/node_modules/mirror-mind";
  const kind = detectInstallKind({
    frontDoorPath: join(pkg, "ts/src/frontDoor/cli.ts"),
    exists: fs([join(pkg, "package.json")]),
    readFile: () => GLOBAL_MANIFEST,
  });
  assert.equal(kind.kind, "unknown");

  // And a bin that resolves ELSEWHERE (another install's) does not count.
  const elsewhere = detectInstallKind({
    frontDoorPath: join(pkg, "ts/src/frontDoor/cli.ts"),
    exists: fs([join(pkg, "package.json"), "/home/dev/bin/mirror"]),
    readFile: () => GLOBAL_MANIFEST,
    realpath: (path) =>
      path === "/home/dev/bin/mirror"
        ? "/usr/local/lib/node_modules/mirror-mind/bin/mirror.js"
        : path,
  });
  assert.equal(elsewhere.kind, "unknown");
});

test("when npm's global root IS known, containment in it is still required", () => {
  // The update lane's rule, unchanged: a package outside npm's own global
  // root would not be the one `npm install -g` replaces.
  const pkg = "/opt/homebrew/lib/node_modules/mirror-mind";
  const binLink = "/opt/homebrew/bin/mirror";
  const kind = detectInstallKind({
    frontDoorPath: join(pkg, "ts/src/frontDoor/cli.ts"),
    npmRootGlobal: "/usr/local/lib/node_modules",
    exists: fs([join(pkg, "package.json"), binLink]),
    readFile: () => GLOBAL_MANIFEST,
    realpath: (path) => (path === binLink ? join(pkg, "bin/mirror.js") : path),
  });
  assert.equal(kind.kind, "unknown");
  assert.match(kind.kind === "unknown" ? kind.reason : "", /global npm root/);
});

test("npm's global root is resolved through symlinks before containment is judged", () => {
  // Found by the update smoke on macOS, where /tmp is a symlink to
  // /private/tmp: the front door's path is resolved, `npm root -g` answered
  // the unresolved form, and the install under it read as not inside it.
  const resolvedRoot = "/private/tmp/prefix/lib/node_modules";
  const pkg = join(resolvedRoot, "mirror-mind");
  const kind = detectInstallKind({
    frontDoorPath: join(pkg, "ts/src/frontDoor/cli.ts"),
    npmRootGlobal: "/tmp/prefix/lib/node_modules",
    exists: fs([join(pkg, "package.json")]),
    readFile: () => GLOBAL_MANIFEST,
    realpath: (path) => path.replace(/^\/tmp\//, "/private/tmp/"),
  });
  assert.deepEqual(kind, { kind: "package", root: pkg, name: "mirror-mind", version: "1.2.3" });
});

test("an npm-linked checkout reached through the global bin is still a clone", () => {
  // `npm link`: `<prefix>/bin/mirror` resolves into the checkout, whose root
  // is not under a `lib/node_modules`, so the layout evidence does not apply
  // and the `.git` beside the manifest decides.
  const checkout = "/home/dev/mirror";
  const kind = detectInstallKind({
    frontDoorPath: "/opt/homebrew/lib/node_modules/mirror-mind/ts/src/frontDoor/cli.ts",
    exists: fs([
      join(checkout, ".git"),
      join(checkout, "package.json"),
      "/opt/homebrew/bin/mirror",
    ]),
    readFile: () => GLOBAL_MANIFEST,
    realpath: (path) =>
      path.startsWith("/opt/homebrew/lib/node_modules/mirror-mind/")
        ? path.replace("/opt/homebrew/lib/node_modules/mirror-mind", checkout)
        : path === "/opt/homebrew/bin/mirror"
          ? join(checkout, "bin/mirror.js")
          : path,
  });
  assert.deepEqual(kind, { kind: "clone", repository: checkout });
});

test("the install lines name the kind, and a package's root", () => {
  assert.deepEqual(renderInstallLines({ kind: "clone", repository: "/home/dev/mirror" }), [
    "Install: clone (/home/dev/mirror)",
  ]);
  assert.deepEqual(
    renderInstallLines({
      kind: "package",
      root: "/opt/homebrew/lib/node_modules/mirror-mind",
      name: "mirror-mind",
      version: "1.2.3",
    }),
    [
      "Install: package (mirror-mind@1.2.3)",
      "Install root: /opt/homebrew/lib/node_modules/mirror-mind",
    ],
  );
  assert.deepEqual(renderInstallLines({ kind: "unknown", reason: "not a git checkout" }), [
    "Install: unknown (not a git checkout)",
  ]);
});

test("a checkout without a root package.json is not this project's clone", () => {
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
