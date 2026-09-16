// CV22.DS7.US8 plateau 8 — Builder production argv validation.

import assert from "node:assert/strict";
import { test } from "node:test";
import { validateBuilderArgv } from "#frontDoor/buildRoute.ts";

function rejected(argv: string[]): void {
  const result = validateBuilderArgv(argv);
  assert.ok(result, argv.join(" "));
  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Mirror TS build:/);
}

test("accepts representative argv from every command shape", () => {
  for (const argv of [
    ["load", "demo", "--session-id", "s"],
    ["inspect-method", "ariad", "--journey", "demo"],
    ["adopt", "--method", "ariad"],
    [
      "pull-item",
      "--method",
      "ariad",
      "--item-code",
      "CV1.US1",
      "--item-title",
      "Story",
      "--item-level",
      "user_story",
      "--why-now",
      "now",
    ],
    [
      "plan-item",
      "--method",
      "ariad",
      "--preauthorize-approval",
      "--stop-after",
      "navigator_validation",
    ],
    [
      "validate-item",
      "--method",
      "ariad",
      "--check",
      "one",
      "--check",
      "two",
      "--checks-status",
      "passed",
      "--e2e-decision",
      "required",
      "--navigator-accepted",
    ],
    ["review-item", "--method", "ariad", "--debt", "one", "--decision", "defer"],
    ["coherence-item", "--method", "ariad", "--local-difference", "one"],
    ["plan-delivery-story", "--method", "ariad", "--objective", "ship", "--child", "CV1.US1"],
    ["review-delivery-story", "--method", "ariad", "--decision", "no_action", "--summary", "clean"],
    ["set-flow-unit", "--method", "ariad", "--unit", "delivery_story"],
    ["release-intent", "--method", "ariad", "--intent", "planned"],
    ["continue-lifecycle", "--method", "ariad", "--local-difference", "one"],
  ]) {
    assert.equal(validateBuilderArgv(argv), null, argv.join(" "));
  }
});

test("refuses a bare command, unknown options, extra positionals, and missing values", () => {
  for (const argv of [
    [],
    ["publish"],
    ["load"],
    ["load", "demo", "extra"],
    ["adopt", "--method"],
    ["adopt", "--method", "ariad", "--surprise", "x"],
  ])
    rejected(argv);
});

test("refuses each argparse-required option class", () => {
  for (const argv of [
    ["adopt"],
    [
      "pull-item",
      "--method",
      "ariad",
      "--item-title",
      "x",
      "--item-level",
      "user_story",
      "--why-now",
      "x",
    ],
    [
      "pull-item",
      "--method",
      "ariad",
      "--item-code",
      "x",
      "--item-level",
      "user_story",
      "--why-now",
      "x",
    ],
    ["pull-item", "--method", "ariad", "--item-code", "x", "--item-title", "x", "--why-now", "x"],
    [
      "pull-item",
      "--method",
      "ariad",
      "--item-code",
      "x",
      "--item-title",
      "x",
      "--item-level",
      "user_story",
    ],
    ["plan-delivery-story", "--method", "ariad"],
    ["validate-delivery-story", "--method", "ariad"],
    ["review-delivery-story", "--method", "ariad", "--summary", "x"],
    ["review-delivery-story", "--method", "ariad", "--decision", "no_action"],
    ["set-cadence", "--method", "ariad"],
  ])
    rejected(argv);
});

test("refuses each argparse choices class but leaves domain choices to commands", () => {
  for (const argv of [
    ["plan-item", "--method", "ariad", "--stop-after", "done"],
    ["validate-item", "--method", "ariad", "--checks-status", "green"],
    ["validate-item", "--method", "ariad", "--e2e-decision", "maybe"],
    ["review-item", "--method", "ariad", "--decision", "later"],
    ["set-flow-unit", "--method", "ariad", "--unit", "epic"],
    ["release-intent", "--method", "ariad", "--intent", "maybe"],
    ["review-delivery-story", "--method", "ariad", "--decision", "pending", "--summary", "x"],
  ])
    rejected(argv);

  assert.equal(validateBuilderArgv(["adopt", "--method", "bogus"]), null);
  assert.equal(
    validateBuilderArgv([
      "pull-item",
      "--method",
      "ariad",
      "--item-code",
      "x",
      "--item-title",
      "x",
      "--item-level",
      "bogus",
      "--why-now",
      "x",
    ]),
    null,
  );
});
