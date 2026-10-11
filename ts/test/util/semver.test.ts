// CV22.DS10.US3 plateau 4 — one semver reader for the three places that
// compared versions each with their own copy (release notes, the welcome
// card's remote tag, and now the package updater's plan).

import assert from "node:assert/strict";
import test from "node:test";
import { compareSemver, isPlainSemver, parseSemver } from "#util/semver.ts";

test("parseSemver reads the oracle's shape and sorts what it refuses below everything", () => {
  assert.deepEqual(parseSemver("1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseSemver("v0.31.14"), [0, 31, 14]);
  assert.deepEqual(parseSemver(" 1.2.3 "), [1, 2, 3]);
  for (const refused of ["1.2", "1.2.3.4", "1.2.3-beta.1", "latest", "", "v"]) {
    assert.deepEqual(parseSemver(refused), [-1, -1, -1], refused);
  }
});

test("compareSemver orders by the numeric triple, not by string", () => {
  assert.ok(compareSemver("0.31.14", "0.31.9") > 0, "14 is after 9");
  assert.ok(compareSemver("0.32.0", "0.31.14") > 0);
  assert.ok(compareSemver("1.0.0", "0.99.99") > 0);
  assert.equal(compareSemver("v1.2.3", "1.2.3"), 0);
  assert.ok(compareSemver("not-a-version", "0.0.0") < 0, "unparseable sorts below everything");
});

test("isPlainSemver is the strict form a registry answer must take", () => {
  // The value becomes the spec of `npm install -g <name>@<value>`: only a
  // bare numeric triple is a version there, never a tag, range, URL, path,
  // or prerelease (which this updater has never published and does not follow).
  for (const accepted of ["0.31.14", "1.0.0", "10.20.30"]) {
    assert.equal(isPlainSemver(accepted), true, accepted);
  }
  for (const refused of [
    "v0.31.14",
    "1.2.3-beta.1",
    "1.2.3+build",
    "^1.2.3",
    "latest",
    "file:/tmp/x",
    "https://example.invalid/x.tgz",
    "../x",
    "1.2.3 ",
    "",
  ]) {
    assert.equal(isPlainSemver(refused), false, refused);
  }
});
