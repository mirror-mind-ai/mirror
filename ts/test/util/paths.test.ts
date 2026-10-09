import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { test } from "node:test";
import { commandOnPath, expandHome, normalizeProjectPath } from "#util/paths.ts";

test("expandHome expands a leading ~ to the home directory", () => {
  assert.equal(expandHome("~/projects"), join(homedir(), "projects"));
  assert.equal(expandHome("~"), homedir());
  assert.equal(expandHome("/abs/path"), "/abs/path");
  assert.equal(expandHome("rel/path"), "rel/path");
});

test("expandHome passes a ~user path through unchanged instead of mangling it", () => {
  assert.equal(expandHome("~alice/x"), "~alice/x");
});

test("normalizeProjectPath returns an absolute path for a relative input", () => {
  const result = normalizeProjectPath(".");
  assert.ok(isAbsolute(result));
  assert.equal(result, realpathSync(resolve(".")));
});

test("normalizeProjectPath resolves symlinks, matching Python Path.resolve", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-paths-"));
  try {
    const real = join(dir, "real-project");
    const link = join(dir, "link-project");
    mkdirSync(real);
    symlinkSync(real, link);
    assert.equal(normalizeProjectPath(link), realpathSync(real));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("normalizeProjectPath falls back to the absolute path when it does not exist", () => {
  const missing = join(tmpdir(), "mirror-core-does-not-exist-xyz", "sub");
  assert.equal(normalizeProjectPath(missing), resolve(missing));
});

// --- CV22.DS10.US3 plateau 4 ---------------------------------------------------

test("commandOnPath answers what a shell's `command -v` would, for the PATH given", () => {
  const executable = new Set(["/opt/bin/mirror", "/usr/bin/git"]);
  const can = (path: string) => executable.has(path);
  assert.equal(commandOnPath("mirror", { PATH: "/usr/bin:/opt/bin" }, can), "/opt/bin/mirror");
  assert.equal(commandOnPath("git", { PATH: "/usr/bin:/opt/bin" }, can), "/usr/bin/git");
  // First hit wins, as it does for the shell.
  const twice = new Set(["/a/mirror", "/b/mirror"]);
  assert.equal(
    commandOnPath("mirror", { PATH: "/b:/a" }, (p) => twice.has(p)),
    "/b/mirror",
  );
  assert.equal(commandOnPath("mirror", { PATH: "/usr/bin" }, can), null);
  assert.equal(commandOnPath("mirror", {}, can), null);
  // Empty segments (`PATH=:/opt/bin`) are skipped, not read as the cwd.
  assert.equal(commandOnPath("mirror", { PATH: ":/opt/bin:" }, can), "/opt/bin/mirror");
});
