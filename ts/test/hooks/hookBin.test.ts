// The `mirror-hook` bin (CV22.DS10.US3 plateau 3, decisions D5 and D15).
//
// The plugin's wrappers run wherever Claude Code copies them, so they cannot
// reach `ts/src/hooks/main.ts` by a relative path; they find `mirror-hook` on
// the PATH instead. And every wrapper that ships in the tarball -- in-tree
// ones included, under `npm root -g` -- sits below `node_modules`, where Node
// refuses to strip types, so the entry each one runs is the same loader shim
// the `mirror` bin already is.
//
// What these cases pin: the two bins share one shim; the hook entry reads
// configuration and silences warnings itself, so no wrapper needs a flag; and
// a hook run through the bin behaves exactly as one run through `main.ts`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";

import { openDatabaseReadOnly } from "#db/database.ts";
import { REQUIRED_FILES } from "#guards/packContents.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "mirror-hook-bin-"));
  roots.push(root);
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A clean environment: no Mirror variable from the developer's shell leaks in. */
function cleanEnv(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  return { ...env, ...overrides };
}

/**
 * The shipped subset, as an install has it: `bin/`, `ts/src`, the manifest,
 * and NO `.env`. Inside the checkout the tree's `.env` legitimately outranks
 * the user's config file (D3), so a test that wants to see the file read has
 * to run the entry from a tree that has no `.env` -- which is every install.
 */
function packageCopy(root: string): string {
  const pkg = join(root, "pkg");
  mkdirSync(join(pkg, "ts"), { recursive: true });
  cpSync(join(REPO_ROOT, "bin"), join(pkg, "bin"), { recursive: true });
  cpSync(join(REPO_ROOT, "ts/src"), join(pkg, "ts/src"), { recursive: true });
  cpSync(join(REPO_ROOT, "package.json"), join(pkg, "package.json"));
  symlinkSync(join(REPO_ROOT, "node_modules"), join(pkg, "node_modules"));
  return pkg;
}

describe("the two bins", () => {
  test("mirror and mirror-hook are declared, and both ship", () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      bin: Record<string, string>;
    };
    assert.deepEqual(manifest.bin, {
      mirror: "bin/mirror.js",
      "mirror-hook": "bin/mirror-hook.js",
    });
    assert.ok(REQUIRED_FILES.includes("bin/mirror-hook.js"), "the pack guard demands it");
    assert.ok(REQUIRED_FILES.includes("bin/loader.js"), "and the shim they share");
  });

  test("neither bin carries its own copy of the shim", () => {
    // One loader, two five-line entries. A second copy of `registerHooks` is
    // the kind of duplicate that drifts when the Node API moves.
    for (const bin of ["bin/mirror.js", "bin/mirror-hook.js"]) {
      const body = readFileSync(join(REPO_ROOT, bin), "utf8");
      assert.doesNotMatch(body, /registerHooks|stripTypeScriptTypes/, bin);
      assert.match(body, /from "\.\/loader\.js"/, bin);
    }
    assert.match(readFileSync(join(REPO_ROOT, "bin/loader.js"), "utf8"), /registerHooks/);
  });
});

describe("mirror-hook runs a hook the way main.ts does", () => {
  test("a hook reaches the home the user's config file names, with no flag and no env", () => {
    // D3 for the hook entry: the wrappers used to pass --env-file-if-exists
    // with the checkout's .env; an installed package has none, so the entry
    // reads `~/.config/mirror/env` itself. The entry is run through the bin as
    // the plugin's wrappers run it, from a cwd that is not the tree.
    const root = scratch();
    const pkg = packageCopy(root);
    const home = join(root, "home");
    const mirrorHome = join(root, "mirror-home");
    mkdirSync(join(home, ".config", "mirror"), { recursive: true });
    writeFileSync(join(home, ".config", "mirror", "env"), `MIRROR_HOME=${mirrorHome}\n`);

    const result = spawnSync(process.execPath, [join(pkg, "bin/mirror-hook.js"), "nonsense:hook"], {
      cwd: root,
      env: cleanEnv({ HOME: home }),
      input: "",
      encoding: "utf8",
      timeout: 30_000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "", "no ExperimentalWarning, no flag needed");
    assert.match(readFileSync(join(mirrorHome, "hooks.log"), "utf8"), /hooks: unknown hook name/);
  });

  test("the environment outranks the config file, as it does for the front door", () => {
    const root = scratch();
    const pkg = packageCopy(root);
    const home = join(root, "home");
    const fromFile = join(root, "from-file");
    const fromEnv = join(root, "from-env");
    mkdirSync(join(home, ".config", "mirror"), { recursive: true });
    writeFileSync(join(home, ".config", "mirror", "env"), `MIRROR_HOME=${fromFile}\n`);

    spawnSync(process.execPath, [join(pkg, "bin/mirror-hook.js"), "nonsense:hook"], {
      cwd: root,
      env: cleanEnv({ HOME: home, MIRROR_HOME: fromEnv }),
      input: "",
      encoding: "utf8",
      timeout: 30_000,
    });

    assert.ok(existsSync(join(fromEnv, "hooks.log")));
    assert.ok(!existsSync(join(fromFile, "hooks.log")));
  });

  test("main.ts is importable without running: the entry guard holds", () => {
    // `hooks/runtime.ts` imports the front door for `main(argv)`; the hook
    // entry must be importable the same way, or a test that imports it would
    // dispatch a hook named by the test runner's argv.
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(join(REPO_ROOT, "ts/src/hooks/main.ts"))}); console.log("imported")`,
      ],
      { cwd: scratch(), env: cleanEnv({}), encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.stdout.trim(), "imported", result.stderr);
  });
});

/**
 * The plugin as Claude Code has it: its hooks directory copied somewhere that
 * is not the Mirror tree. Returns the copy's hooks directory.
 */
function pluginCopy(root: string): string {
  const hooks = join(root, "claude-cache", "plugins", "mirror-mind", "hooks");
  cpSync(join(REPO_ROOT, "plugins/mirror-mind/hooks"), hooks, { recursive: true });
  return hooks;
}

/**
 * The global bin directories the wrappers and the launcher search after the
 * PATH. A developer machine with `npm link` in place holds `mirror` there,
 * and no scratch PATH or HOME hides an absolute path -- so the "nothing
 * anywhere" cases can only be proven where nothing is there, and say so.
 */
function globalBinHolds(name: string): boolean {
  const home = process.env.HOME ?? "";
  return [`${home}/.nvm/current/bin`, "/opt/homebrew/bin", "/usr/local/bin"].some((dir) =>
    existsSync(join(dir, name)),
  );
}

/** A scratch bin directory holding `mirror-hook` the way npm's global bin does: a symlink. */
function scratchBin(root: string, pkg: string): string {
  const bin = join(root, "global-bin");
  mkdirSync(bin);
  symlinkSync(join(pkg, "bin/mirror-hook.js"), join(bin, "mirror-hook"));
  symlinkSync(process.execPath, join(bin, "node"));
  return bin;
}

describe("the plugin's wrappers, copied out of the tree (the TS5 hook window)", () => {
  test("find mirror-hook on the PATH and run the hook against the configured home", () => {
    const root = scratch();
    const pkg = packageCopy(root);
    const hooks = pluginCopy(root);
    const bin = scratchBin(root, pkg);
    const home = join(root, "home");
    const mirrorHome = join(root, "mirror-home");
    mkdirSync(join(home, ".config", "mirror"), { recursive: true });
    writeFileSync(join(home, ".config", "mirror", "env"), `MIRROR_HOME=${mirrorHome}\n`);

    const result = spawnSync("bash", [join(hooks, "log-user-prompt.sh")], {
      cwd: root,
      env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, MEMORY_ENV: "production" },
      input: JSON.stringify({ session_id: "plugin-copy", prompt: "Hello from the cache" }),
      encoding: "utf8",
      timeout: 60_000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const db = openDatabaseReadOnly(join(mirrorHome, "memory.db"));
    try {
      const rows = db.prepare("SELECT role, content FROM messages").all();
      assert.deepEqual(rows, [{ role: "user", content: "Hello from the cache" }]);
    } finally {
      db.close();
    }
    assert.ok(!existsSync(join(mirrorHome, "hooks.log")), "nothing failed");
  });

  test("MIRROR_BIN names the bin directory and outranks the PATH", () => {
    const root = scratch();
    const pkg = packageCopy(root);
    const hooks = pluginCopy(root);
    const bin = scratchBin(root, pkg);
    const home = join(root, "home");
    const mirrorHome = join(root, "mirror-home");
    mkdirSync(home);

    const result = spawnSync("bash", [join(hooks, "session-start.sh")], {
      cwd: root,
      env: {
        HOME: home,
        PATH: "/usr/bin:/bin",
        MIRROR_BIN: bin,
        MIRROR_HOME: mirrorHome,
        MEMORY_ENV: "production",
      },
      input: "",
      encoding: "utf8",
      timeout: 60_000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(mirrorHome, "memory.db")), "the hook ran through MIRROR_BIN");
  });

  test("with no mirror-hook anywhere: exit 0, and one line in the home the config file names", {
    skip: globalBinHolds("mirror-hook") && "a global mirror-hook is installed on this machine",
  }, () => {
    // The product posture the plugin smoke asserts in package mode: the turn
    // is not failed, and the evidence lands where `runtime diagnose` reads it
    // (`hook_failures_recorded`), not on a stderr no runtime shows.
    const root = scratch();
    const hooks = pluginCopy(root);
    const home = join(root, "home");
    const mirrorHome = join(root, "mirror-home");
    mkdirSync(join(home, ".config", "mirror"), { recursive: true });
    writeFileSync(join(home, ".config", "mirror", "env"), `MIRROR_HOME=${mirrorHome}\n`);

    const result = spawnSync("bash", [join(hooks, "mirror-inject.sh")], {
      cwd: root,
      env: { HOME: home, PATH: "/usr/bin:/bin" },
      input: "{}",
      encoding: "utf8",
      timeout: 30_000,
    });

    assert.equal(result.status, 0, "a hook never fails the user's turn");
    assert.equal(result.stdout, "", "and injects nothing it does not have");
    const log = readFileSync(join(mirrorHome, "hooks.log"), "utf8");
    assert.match(log, /claude:inject: mirror-hook not found on PATH; hook skipped/);
    assert.match(log, /npm install -g mirror-mind|MIRROR_BIN/);
  });
});

describe("the MCP launcher, copied out of the tree", () => {
  test("starts the server through the mirror bin it finds", () => {
    const root = scratch();
    const pkg = packageCopy(root);
    const bin = scratchBin(root, pkg);
    symlinkSync(join(pkg, "bin/mirror.js"), join(bin, "mirror"));
    const launcher = join(root, "claude-cache", "plugins", "mirror-mind", "mcp", "launch.sh");
    mkdirSync(join(launcher, ".."), { recursive: true });
    cpSync(join(REPO_ROOT, "plugins/mirror-mind/mcp/launch.sh"), launcher);
    const mirrorHome = join(root, "mirror-home");
    mkdirSync(mirrorHome);

    const result = spawnSync("bash", [launcher], {
      cwd: root,
      env: {
        HOME: join(root, "home"),
        PATH: `${bin}:/usr/bin:/bin`,
        MIRROR_HOME: mirrorHome,
        MEMORY_ENV: "production",
      },
      input: `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "t", version: "0" },
        },
      })}\n`,
      encoding: "utf8",
      timeout: 60_000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "", "stderr is the client's log and stays empty");
    const reply = JSON.parse(result.stdout.split("\n")[0] ?? "{}") as {
      result?: { serverInfo?: { name?: string } };
    };
    assert.equal(reply.result?.serverInfo?.name, "mirror-mind");
  });

  test("with no mirror anywhere: says so on stderr and exits 1", {
    skip: globalBinHolds("mirror") && "a global mirror is installed on this machine",
  }, () => {
    const root = scratch();
    const launcher = join(root, "launch.sh");
    cpSync(join(REPO_ROOT, "plugins/mirror-mind/mcp/launch.sh"), launcher);
    const result = spawnSync("bash", [launcher], {
      cwd: root,
      env: { HOME: join(root, "home"), PATH: "/usr/bin:/bin" },
      input: "",
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /`mirror` not found on PATH; the MCP server cannot start/);
  });
});
