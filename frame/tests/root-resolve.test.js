"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { resolveMirrorRoot } = require("../main/root-resolve.js");

test("env MIRROR_FRAME_ROOT wins when it contains pyproject.toml", () => {
  const root = resolveMirrorRoot({
    env: { MIRROR_FRAME_ROOT: "C:\\custom\\mirror" },
    exists: (p) => p === path.join("C:\\custom\\mirror", "pyproject.toml"),
    startDir: "C:\\anywhere",
    localAppData: "C:\\Users\\x\\AppData\\Local",
  });
  assert.strictEqual(root, "C:\\custom\\mirror");
});

test("packaged install resolves {app}\\app relative to the exe, in a spaced custom path", () => {
  // Regressão do cenário 9: instalação em pasta com espaço fora do LOCALAPPDATA.
  const appBase = "C:\\Users\\WDAGUtilityAccount\\Desktop\\Mirror Space Test";
  const exeDir = path.join(appBase, "frame"); // {app}\frame\MirrorFrame.exe
  const clone = path.join(appBase, "app");
  const root = resolveMirrorRoot({
    env: {},
    exeDir,
    exists: (p) => p === path.join(clone, "pyproject.toml"),
    startDir: path.join(exeDir, "resources", "app", "main"),
    localAppData: "C:\\Users\\WDAGUtilityAccount\\AppData\\Local", // sem MirrorMind aqui
  });
  assert.strictEqual(root, clone);
});

test("exe-relative resolution wins over the default LOCALAPPDATA layout", () => {
  const appBase = "D:\\Apps\\Mirror";
  const exeDir = path.join(appBase, "frame");
  const clone = path.join(appBase, "app");
  const localAppDataClone = path.join("C:\\LAD", "Programs", "MirrorMind", "app");
  const root = resolveMirrorRoot({
    env: {},
    exeDir,
    // ambos existem: a instalação atual (relativa ao exe) deve vencer
    exists: (p) => p === path.join(clone, "pyproject.toml") || p === path.join(localAppDataClone, "pyproject.toml"),
    startDir: "C:\\anywhere",
    localAppData: "C:\\LAD",
  });
  assert.strictEqual(root, clone);
});

test("installer layout is used when present", () => {
  const app = path.join("C:\\Users\\x\\AppData\\Local", "Programs", "MirrorMind", "app");
  const root = resolveMirrorRoot({
    env: {},
    exists: (p) => p === path.join(app, "pyproject.toml"),
    startDir: "C:\\anywhere",
    localAppData: "C:\\Users\\x\\AppData\\Local",
  });
  assert.strictEqual(root, app);
});

test("dev mode walks up from startDir to find pyproject.toml", () => {
  const repo = "C:\\VSCode\\mirror-exe";
  const root = resolveMirrorRoot({
    env: {},
    exists: (p) => p === path.join(repo, "pyproject.toml"),
    startDir: path.join(repo, "frame", "main"),
    localAppData: "C:\\nope",
  });
  assert.strictEqual(root, repo);
});

test("returns null when nothing is found", () => {
  const root = resolveMirrorRoot({
    env: {}, exists: () => false, startDir: "C:\\a\\b", localAppData: "C:\\nope",
  });
  assert.strictEqual(root, null);
});

test("env root without pyproject.toml is rejected (falls through)", () => {
  const root = resolveMirrorRoot({
    env: { MIRROR_FRAME_ROOT: "C:\\bogus" },
    exists: () => false, startDir: "C:\\a", localAppData: "C:\\nope",
  });
  assert.strictEqual(root, null);
});
