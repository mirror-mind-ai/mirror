"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// The Frame is shipped as a private Mirror component, so release preparation
// must bump both versions together. This guard makes the documented invariant
// executable and prevents a newer core from shipping with a stale Frame label.
//
// The Mirror version lives in ts/package.json since CV22.DS10.TS5 (decision
// D1), which deleted pyproject.toml; this is the one Frame reader re-pointed
// there (D11). Root detection in main/root-resolve.js still looks for
// pyproject.toml and is CV22.DS10.US3's, with the Frame's other Python ties.
test("Frame version follows the Mirror package version", () => {
  const framePackage = require("../package.json");
  const mirror = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "ts", "package.json"), "utf8"),
  );
  assert.ok(mirror.version, "version not found in ts/package.json");
  assert.strictEqual(framePackage.version, mirror.version);
});
