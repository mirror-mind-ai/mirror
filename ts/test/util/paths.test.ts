import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { test } from "node:test";
import { expandHome, normalizeProjectPath } from "../../src/util/paths.ts";

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
