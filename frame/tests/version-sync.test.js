"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// The Frame is shipped as a private Mirror component, so release preparation
// must bump both versions together. This guard makes the documented invariant
// executable and prevents a newer core from shipping with a stale Frame label.
test("Frame version follows the Mirror package version", () => {
  const framePackage = require("../package.json");
  const pyproject = fs.readFileSync(path.join(__dirname, "..", "..", "pyproject.toml"), "utf8");
  const match = /^version\s*=\s*"([^"]+)"/m.exec(pyproject);
  assert.ok(match, "project version not found in pyproject.toml");
  assert.strictEqual(framePackage.version, match[1]);
});
