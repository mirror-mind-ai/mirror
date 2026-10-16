// CV22.DS10.US2 plateau 3 — where is this Mirror installed?
//
// The answer decides whether the next step is `git merge --ff-only` or
// `npm install -g`, so a wrong answer is not a wrong label: it is an update
// applied to the wrong tree.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  describeInstallKind,
  detectInstallKind,
  renderInstallLines,
  thisFrontDoorPath,
} from "#runtime/installKind.ts";
import { runningTreeRoot } from "#runtime/treeRoot.ts";

/** One spelling for a path, whichever separator `node:path` chose for it. */
function key(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * A fixture path written the POSIX way, as THIS platform spells it: unchanged
 * on macOS and Linux, `C:\\home\\dev\\mirror` on Windows, where the detector's
 * `resolve` would otherwise add the drive to one side of the comparison only.
 */
function P(posixPath: string): string {
  return resolve(posixPath);
}

/** A filesystem that exists only as a set of paths. */
function fs(paths: readonly string[]) {
  const set = new Set(paths.map(key));
  return (path: string) => set.has(key(path));
}

/** A filesystem whose files have contents. */
function files(contents: Record<string, string>) {
  const byKey = new Map(Object.entries(contents).map(([path, text]) => [key(path), text]));
  return (path: string) => {
    const text = byKey.get(key(path));
    if (text === undefined) throw new Error(`no such file: ${path}`);
    return text;
  };
}

test("a git checkout carrying a root package.json is a clone", () => {
  // CV22.DS10.US3 decision D2: the manifest sits at the repository root.
  const root = P("/home/dev/mirror");
  const kind = detectInstallKind({
    frontDoorPath: join(root, "ts/src/frontDoor/cli.ts"),
    exists: fs([join(root, ".git"), join(root, "package.json")]),
  });
  assert.deepEqual(kind, { kind: "clone", repository: root });
  assert.match(describeInstallKind(kind), /^clone \(/);
});

test("a global npm install is a package, named and versioned from its manifest", () => {
  const globalRoot = P("/usr/local/lib/node_modules");
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
  const globalRoot = P("/usr/local/lib/node_modules");
  const checkout = P("/home/dev/mirror");
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
  const prefix = P("/opt/homebrew");
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
  const resolvedRoot = P("/private/tmp/prefix/lib/node_modules");
  const pkg = join(resolvedRoot, "mirror-mind");
  const unresolvedRoot = P("/tmp/prefix/lib/node_modules");
  const kind = detectInstallKind({
    frontDoorPath: join(pkg, "ts/src/frontDoor/cli.ts"),
    npmRootGlobal: unresolvedRoot,
    exists: fs([join(pkg, "package.json")]),
    readFile: () => GLOBAL_MANIFEST,
    realpath: (path) =>
      key(path).startsWith(key(unresolvedRoot))
        ? resolvedRoot + path.slice(unresolvedRoot.length)
        : path,
  });
  assert.deepEqual(kind, { kind: "package", root: pkg, name: "mirror-mind", version: "1.2.3" });
});

test("an npm-linked checkout reached through the global bin is still a clone", () => {
  // `npm link`: `<prefix>/bin/mirror` resolves into the checkout, whose root
  // is not under a `lib/node_modules`, so the layout evidence does not apply
  // and the `.git` beside the manifest decides.
  const checkout = P("/home/dev/mirror");
  const linked = P("/opt/homebrew/lib/node_modules/mirror-mind");
  const bin = P("/opt/homebrew/bin/mirror");
  const kind = detectInstallKind({
    frontDoorPath: join(linked, "ts/src/frontDoor/cli.ts"),
    exists: fs([join(checkout, ".git"), join(checkout, "package.json"), bin]),
    readFile: () => GLOBAL_MANIFEST,
    realpath: (path) =>
      key(path).startsWith(`${key(linked)}/`)
        ? checkout + path.slice(linked.length)
        : key(path) === key(bin)
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
  // with reality for the repository it is running in -- through the same
  // path the routes hand it. On Windows, `URL.pathname` spelled that path
  // `/C:/...`, which `resolve` read as `C:\C:\...`, and every install was
  // `unknown`: the updater refused, and after CR138 the git rows went blank.
  const kind = detectInstallKind({ frontDoorPath: thisFrontDoorPath() });
  assert.deepEqual(kind, { kind: "clone", repository: runningTreeRoot() });
});

// --- The Windows global layout: `<prefix>\node_modules\<name>` and a shim ---
//
// npm lays a global install out without `lib/` or `bin/` on Windows. The
// package sits at `<prefix>\node_modules\<name>` and the bin is
// `<prefix>\<bin>.cmd`: a file, not a symlink, that runs
// `%dp0%\node_modules\<name>\<bin path>`. Nothing resolves, so the evidence
// that the bin reaches INTO the package is the shim's own text.

const CMD_SHIM = [
  "@ECHO off",
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\mirror-mind\\bin\\mirror.js" %*',
].join("\r\n");

test("a Windows global prefix layout with a .cmd shim naming the package is a package", () => {
  const prefix = resolve("/Users/dev/AppData/Roaming/npm");
  const pkg = join(prefix, "node_modules", "mirror-mind");
  const shim = join(prefix, "mirror.cmd");
  const kind = detectInstallKind({
    frontDoorPath: join(pkg, "ts", "src", "frontDoor", "cli.ts"),
    exists: fs([join(pkg, "package.json"), shim]),
    readFile: files({ [join(pkg, "package.json")]: GLOBAL_MANIFEST, [shim]: CMD_SHIM }),
  });
  assert.deepEqual(kind, { kind: "package", root: pkg, name: "mirror-mind", version: "1.2.3" });
});

test("on Windows too, the layout alone is not enough: a shim must name the package", () => {
  // `<x>\node_modules\mirror-mind` with no `<x>\mirror.cmd` is a project's
  // dependency, not a global install.
  const prefix = resolve("/Users/dev/someapp");
  const pkg = join(prefix, "node_modules", "mirror-mind");
  const manifest = join(pkg, "package.json");
  const alone = detectInstallKind({
    frontDoorPath: join(pkg, "ts", "src", "frontDoor", "cli.ts"),
    exists: fs([manifest]),
    readFile: files({ [manifest]: GLOBAL_MANIFEST }),
  });
  assert.equal(alone.kind, "unknown");

  // And a shim beside it that runs ANOTHER package does not count.
  const shim = join(prefix, "mirror.cmd");
  const other = detectInstallKind({
    frontDoorPath: join(pkg, "ts", "src", "frontDoor", "cli.ts"),
    exists: fs([manifest, shim]),
    readFile: files({
      [manifest]: GLOBAL_MANIFEST,
      [shim]: CMD_SHIM.replace(/mirror-mind/g, "other-tool"),
    }),
  });
  assert.equal(other.kind, "unknown");
});

test("an npm-linked checkout under the Windows prefix is still a clone", () => {
  // `npm link` on Windows makes `<prefix>\node_modules\<name>` a junction into
  // the checkout. Resolved, the front door's manifest is the checkout's, whose
  // parent is not `node_modules`, and the `.git` beside it decides.
  const prefix = resolve("/Users/dev/AppData/Roaming/npm");
  const linked = join(prefix, "node_modules", "mirror-mind");
  const checkout = resolve("/VSCode/mirror");
  const shim = join(prefix, "mirror.cmd");
  const kind = detectInstallKind({
    frontDoorPath: join(linked, "ts", "src", "frontDoor", "cli.ts"),
    exists: fs([join(checkout, ".git"), join(checkout, "package.json"), shim]),
    readFile: files({ [join(checkout, "package.json")]: GLOBAL_MANIFEST, [shim]: CMD_SHIM }),
    realpath: (path) =>
      key(path).startsWith(key(linked)) ? checkout + path.slice(linked.length) : path,
  });
  assert.deepEqual(kind, { kind: "clone", repository: checkout });
});

test("a checkout under a non-ASCII path is a clone when its path comes from fileURLToPath", () => {
  // A URL's pathname is not a filesystem path: it percent-encodes every
  // reserved character. Reported on PR #42 by lgarciasbr for `Código` on
  // macOS; the reviewer added `space only`, which on Windows is every
  // `C:\\Users\\John Doe`. The real-checkout test above only catches this when
  // the repository itself lives under such a name; this one builds the
  // checkout under a name with both.
  const root = mkdtempSync(join(tmpdir(), "mirror Código ação-"));
  try {
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, "package.json"), '{"name":"mirror-mind","version":"0.0.0"}\n');
    const frontDoor = join(root, "ts", "src", "frontDoor", "cli.ts");
    mkdirSync(dirname(frontDoor), { recursive: true });
    writeFileSync(frontDoor, "");
    const url = pathToFileURL(frontDoor);

    // The path as the filesystem spells it reads as a clone...
    assert.deepEqual(detectInstallKind({ frontDoorPath: fileURLToPath(url) }), {
      kind: "clone",
      repository: realpathSync(root),
    });
    // ...and the URL's pathname is a different string, which is the whole bug.
    assert.match(url.pathname, /mirror%20C%C3%B3digo%20a%C3%A7%C3%A3o-/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
