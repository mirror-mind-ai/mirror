import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type EvalReport,
  type EvalResult,
  evalBlockedBy,
  evalPassed,
  evalScore,
} from "#evals/harness/types.ts";

function report(threshold: number, results: EvalResult[]): EvalReport {
  return { evalName: "sample", threshold, results };
}

function result(probeId: string, passed: boolean, blocking = false): EvalResult {
  return { probeId, passed, notes: "", blocking };
}

test("score is the fraction of probes that passed", () => {
  const r = report(0.8, [result("a", true), result("b", true), result("c", false)]);
  assert.equal(evalScore(r), 2 / 3);
});

test("score is zero when there are no results", () => {
  assert.equal(evalScore(report(0.8, [])), 0);
});

test("a report at or above threshold passes", () => {
  assert.equal(evalPassed(report(0.8, [result("a", true), result("b", true)])), true);
  const fourOfFive = [
    result("a", true),
    result("b", true),
    result("c", true),
    result("d", true),
    result("e", false),
  ];
  assert.equal(evalScore(report(0.8, fourOfFive)), 0.8);
  assert.equal(evalPassed(report(0.8, fourOfFive)), true);
});

test("a report below threshold does not pass", () => {
  assert.equal(evalPassed(report(0.8, [result("a", true), result("b", false)])), false);
});

// D-017: the finding this story exists to fix. Before blocking probes, a
// six-probe module could not fall below 0.80 on one failure, so an obeyed
// injection probe reported PASS.
test("a failed blocking probe fails the module at 5/6, above threshold", () => {
  const r = report(0.8, [
    result("p1", true),
    result("p2", true),
    result("p3", true),
    result("p4", true),
    result("p5", true),
    result("injection-resisted", false, true),
  ]);
  assert.equal(evalScore(r) >= r.threshold, true, "score clears threshold");
  assert.equal(evalPassed(r), false, "module still fails");
  assert.deepEqual(evalBlockedBy(r), ["injection-resisted"]);
});

test("a passing blocking probe does not fail the module", () => {
  const r = report(0.8, [result("a", true), result("injection-resisted", true, true)]);
  assert.equal(evalPassed(r), true);
  assert.deepEqual(evalBlockedBy(r), []);
});

test("blockedBy names every failed blocking probe, in probe order", () => {
  const r = report(0, [
    result("first-injection", false, true),
    result("quality", false),
    result("second-injection", false, true),
  ]);
  assert.deepEqual(evalBlockedBy(r), ["first-injection", "second-injection"]);
});

test("a non-blocking failure below threshold is not reported as blocked", () => {
  const r = report(0.9, [result("a", true), result("b", false)]);
  assert.equal(evalPassed(r), false);
  assert.deepEqual(evalBlockedBy(r), [], "failed, but not blocked");
});
