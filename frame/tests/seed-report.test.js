"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { parseSeedReport, classifySeed } = require("../main/seed-report.js");

const cls = (out) => classifySeed(parseSeedReport(out)).status;

test("clean seed → ok", () => {
  assert.strictEqual(cls("Result: 20 created, 0 updated, 0 skipped\n"), "ok");
});

test("exactly the known warning → ok-warning, surfaced", () => {
  const out = "Result: 19 created, 0 updated, 0 skipped\nErrors: 1\n  - ego/constraints: empty content\n";
  const c = classifySeed(parseSeedReport(out));
  assert.strictEqual(c.status, "ok-warning");
  assert.strictEqual(c.warning, "ego/constraints: empty content");
});

test("an UNKNOWN warning → fail (never a silent partial success)", () => {
  const out = "Result: 19 created, 0 updated, 0 skipped\nErrors: 1\n  - user/identity: parse error\n";
  const c = classifySeed(parseSeedReport(out));
  assert.strictEqual(c.status, "fail");
  assert.match(c.reason, /não reconhecido/);
});

test("more than one error (even if one is the known warning) → fail", () => {
  const out = "Result: 18 created, 0 updated, 0 skipped\nErrors: 2\n  - ego/constraints: empty content\n  - persona/coach: bad yaml\n";
  assert.strictEqual(cls(out), "fail");
});

test("error count without matching listed lines → fail", () => {
  const out = "Result: 19 created, 0 updated, 0 skipped\nErrors: 3\n";
  assert.strictEqual(cls(out), "fail");
});

test("idempotent rebind — all skipped, clean → ok (created+updated+skipped > 0)", () => {
  assert.strictEqual(cls("Result: 0 created, 0 updated, 19 skipped\n"), "ok");
});

test("idempotent rebind — all skipped with the known warning → ok-warning", () => {
  const out = "Result: 0 created, 0 updated, 19 skipped\nErrors: 1\n  - ego/constraints: empty content\n";
  const c = classifySeed(parseSeedReport(out));
  assert.strictEqual(c.status, "ok-warning");
  assert.strictEqual(c.warning, "ego/constraints: empty content");
});

test("completely zero totals → fail (inconsistent report)", () => {
  assert.strictEqual(cls("Result: 0 created, 0 updated, 0 skipped\n"), "fail");
});

test("crash with no Result summary → fail", () => {
  assert.strictEqual(classifySeed(parseSeedReport("Traceback ...")).status, "fail");
  assert.strictEqual(classifySeed(parseSeedReport("")).status, "fail");
  assert.strictEqual(classifySeed(null).status, "fail");
});

test("does not rely on an absolute identity count alone — 19 vs 20 both ok when clean", () => {
  assert.strictEqual(cls("Result: 19 created, 0 updated, 0 skipped\n"), "ok");
  assert.strictEqual(cls("Result: 20 created, 0 updated, 0 skipped\n"), "ok");
});
