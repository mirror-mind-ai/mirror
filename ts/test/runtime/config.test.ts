// CV22.DS10.US3 plateau 1, decision D3 — configuration is read by the core.
//
// Until this story every invocation carried `--env-file=.env` (the skills, the
// extension, the hook wrappers, the MCP launcher), which only a checkout can
// satisfy: an installed package has no `.env`, and a `bin` shim sets no flag.
// So the program reads its own configuration, from two places, in one order:
// the real environment wins; then the tree's `.env` (a clone's); then the OS
// user's `${XDG_CONFIG_HOME:-~/.config}/mirror/env`, the directory US2 already
// chose for the package channel. Nothing is overridden: a variable set in the
// shell survives both files, and one set by the clone's `.env` survives the
// user file.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { configFilePath, loadConfiguration, writeConfigValue } from "#runtime/config.ts";
import { stageMirrorPackage } from "../support/mirrorTree.ts";

const roots: string[] = [];
function tmp(prefix = "mirror-config-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function envFile(dir: string, name: string, body: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, body, "utf8");
  return path;
}

describe("configFilePath", () => {
  test("is ~/.config/mirror/env by default", () => {
    assert.equal(configFilePath({}, "/home/u"), "/home/u/.config/mirror/env");
  });

  test("honors XDG_CONFIG_HOME, the same way the update channel does", () => {
    assert.equal(configFilePath({ XDG_CONFIG_HOME: "/xdg" }, "/home/u"), "/xdg/mirror/env");
  });

  test("ignores an empty XDG_CONFIG_HOME", () => {
    assert.equal(configFilePath({ XDG_CONFIG_HOME: "" }, "/home/u"), "/home/u/.config/mirror/env");
  });
});

describe("loadConfiguration", () => {
  test("the environment wins over the clone's .env, which wins over the user file", () => {
    const root = stageMirrorPackage(tmp());
    const home = tmp("mirror-config-home-");
    envFile(root, ".env", "A=clone\nB=clone\nC=clone\n");
    envFile(join(home, ".config", "mirror"), "env", "A=user\nB=user\nD=user\n");
    const env: Record<string, string | undefined> = { A: "shell" };

    const report = loadConfiguration({
      entryPath: join(root, "ts", "src", "frontDoor", "cli.ts"),
      env,
      home,
    });

    assert.equal(env.A, "shell", "set in the shell: untouched by both files");
    assert.equal(env.B, "clone", "the clone's .env is read before the user file");
    assert.equal(env.C, "clone");
    assert.equal(env.D, "user", "the user file fills what nothing else set");
    assert.deepEqual(
      report.sources.map((s) => s.kind),
      ["environment", "tree_env", "user_config"],
    );
  });

  test("an installed package has no .env: only the user file is read", () => {
    // The tarball excludes `.env*`, so the tree's file is simply absent there.
    const root = stageMirrorPackage(tmp());
    const home = tmp("mirror-config-home-");
    envFile(join(home, ".config", "mirror"), "env", "MIRROR_USER=pkg\n");
    const env: Record<string, string | undefined> = {};

    const report = loadConfiguration({
      entryPath: join(root, "ts", "src", "frontDoor", "cli.ts"),
      env,
      home,
    });

    assert.equal(env.MIRROR_USER, "pkg");
    assert.deepEqual(
      report.sources.map((s) => s.kind),
      ["environment", "user_config"],
    );
  });

  test("with neither file, the environment is the only source and nothing throws", () => {
    const root = stageMirrorPackage(tmp());
    const env: Record<string, string | undefined> = { X: "1" };
    const report = loadConfiguration({
      entryPath: join(root, "ts", "src", "frontDoor", "cli.ts"),
      env,
      home: tmp("mirror-config-home-"),
    });
    assert.deepEqual(env, { X: "1" });
    assert.deepEqual(
      report.sources.map((s) => s.kind),
      ["environment"],
    );
  });

  test("the tree's .env is located from the entry file, never from the cwd", () => {
    // The whole reason for the module: a skill run from /tmp, or an installed
    // package, must find the SAME configuration the checkout's own commands do.
    const root = stageMirrorPackage(tmp());
    envFile(root, ".env", "FROM_TREE=yes\n");
    const elsewhere = tmp("mirror-config-cwd-");
    envFile(elsewhere, ".env", "FROM_CWD=yes\n");
    const env: Record<string, string | undefined> = {};

    loadConfiguration({
      entryPath: join(root, "ts", "src", "frontDoor", "cli.ts"),
      env,
      home: tmp("mirror-config-home-"),
      cwd: elsewhere,
    });

    assert.equal(env.FROM_TREE, "yes");
    assert.equal(env.FROM_CWD, undefined);
  });

  test("an entry outside any Mirror tree reads only the user file", () => {
    const home = tmp("mirror-config-home-");
    envFile(join(home, ".config", "mirror"), "env", "ONLY=user\n");
    const env: Record<string, string | undefined> = {};
    const report = loadConfiguration({ entryPath: join(tmp(), "loose.ts"), env, home });
    assert.equal(env.ONLY, "user");
    assert.deepEqual(
      report.sources.map((s) => s.kind),
      ["environment", "user_config"],
    );
  });

  test("the report names each file it read, for status and diagnose to print", () => {
    const root = stageMirrorPackage(tmp());
    const home = tmp("mirror-config-home-");
    const treeEnv = envFile(root, ".env", "A=1\n");
    const userEnv = envFile(join(home, ".config", "mirror"), "env", "B=2\n");
    const report = loadConfiguration({
      entryPath: join(root, "ts", "src", "frontDoor", "cli.ts"),
      env: {},
      home,
    });
    assert.deepEqual(report.sources, [
      { kind: "environment" },
      { kind: "tree_env", path: treeEnv },
      { kind: "user_config", path: userEnv },
    ]);
  });
});

describe("writeConfigValue", () => {
  test("creates the file 0600 in a 0700 directory and writes KEY=value", () => {
    const home = tmp("mirror-config-home-");
    const path = writeConfigValue("MIRROR_USER", "alice", { env: {}, home });
    assert.equal(path, join(home, ".config", "mirror", "env"));
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(statSync(join(home, ".config", "mirror")).mode & 0o777, 0o700);
    assert.equal(readFileSync(path, "utf8"), "MIRROR_USER=alice\n");
  });

  test("appends to an existing file and replaces an existing key in place", () => {
    const home = tmp("mirror-config-home-");
    const dir = join(home, ".config", "mirror");
    envFile(dir, "env", "OPENROUTER_API_KEY=sk-x\nMIRROR_USER=old\n");
    writeConfigValue("MIRROR_USER", "new", { env: {}, home });
    writeConfigValue("MIRROR_HOME", "/h", { env: {}, home });
    assert.equal(
      readFileSync(join(dir, "env"), "utf8"),
      "OPENROUTER_API_KEY=sk-x\nMIRROR_USER=new\nMIRROR_HOME=/h\n",
    );
  });

  test("refuses a value that would break the file's one-line-per-key grammar", () => {
    const home = tmp("mirror-config-home-");
    assert.throws(() => writeConfigValue("MIRROR_USER", "a\nb", { env: {}, home }), /newline/);
    assert.throws(() => writeConfigValue("bad key", "x", { env: {}, home }), /key/);
  });
});
