// The lockfile's root names the package and the version package.json names.
//
// Release commits bump `version` in package.json by hand; package-lock.json was
// last regenerated when the repository became the package (US3 plateau 1) and
// kept saying `mirror-core 0.0.0` through v0.35.0. Any `npm install` in a clone
// then rewrote its root, the tree went dirty, and `runtime diagnose` reported
// `git_dirty: M package-lock.json` to a user who had changed nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const read = (file: string) => JSON.parse(readFileSync(join(REPO_ROOT, file), "utf8"));
const FIX = "run `npm install --package-lock-only --ignore-scripts` and commit package-lock.json";

test("package-lock.json's root names the package and version package.json names", () => {
  const pkg = read("package.json");
  const lock = read("package-lock.json");
  assert.equal(lock.name, pkg.name, `lockfile name: ${FIX}`);
  assert.equal(lock.version, pkg.version, `lockfile version: ${FIX}`);
  assert.equal(lock.packages?.[""]?.name, pkg.name, `lockfile packages[""].name: ${FIX}`);
  assert.equal(lock.packages?.[""]?.version, pkg.version, `lockfile packages[""].version: ${FIX}`);
});
