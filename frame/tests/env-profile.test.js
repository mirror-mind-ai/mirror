"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { sessionEnv } = require("../main/env-profile.js");

test("forces UTF-8 exactly like mirror.cmd", () => {
  const e = sessionEnv({ PATH: "C:\\bin" }, "C:\\root");
  assert.strictEqual(e.PYTHONUTF8, "1");
  assert.strictEqual(e.PYTHONIOENCODING, "utf-8");
});

test("preserves the base environment and PATH", () => {
  const e = sessionEnv({ PATH: "C:\\bin", FOO: "bar" }, "C:\\root");
  assert.strictEqual(e.FOO, "bar");
  assert.ok(e.PATH.includes("C:\\bin"));
});

test("does not leak frame-only variables into the session", () => {
  const e = sessionEnv({ PATH: "x", ELECTRON_RUN_AS_NODE: "1" }, "C:\\root");
  assert.strictEqual(e.ELECTRON_RUN_AS_NODE, undefined);
});

test("base env is not mutated", () => {
  const base = { PATH: "x" };
  sessionEnv(base, "C:\\root");
  assert.deepStrictEqual(base, { PATH: "x" });
});
