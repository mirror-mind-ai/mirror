// CV22.DS7.US8 plateau 8 — Builder production argv validation.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBuilderArgv } from "#frontDoor/buildRoute.ts";

function rejected(argv: string[]): string {
  const result = parseBuilderArgv(argv);
  assert.ok(!("argv" in result), `accepted: ${argv.join(" ")}`);
  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^Mirror TS build:/);
  return result.stderr;
}

function accepted(argv: string[]): readonly string[] {
  const result = parseBuilderArgv(argv);
  assert.ok(
    "argv" in result,
    `refused: ${argv.join(" ")}: ${"stderr" in result ? result.stderr : ""}`,
  );
  return result.argv;
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
    assert.deepEqual(accepted(argv), argv, "a canonical invocation parses to itself");
  }
});

test("argparse's accepted spellings are accepted: --option=value and unambiguous prefixes", () => {
  // Python is the contract for what is accepted, not only for what is refused.
  assert.deepEqual(accepted(["adopt", "--method=ariad"]), ["adopt", "--method", "ariad"]);
  assert.deepEqual(accepted(["check-implementation", "--meth=ariad", "--jour=demo"]), [
    "check-implementation",
    "--method",
    "ariad",
    "--journey",
    "demo",
  ]);
  assert.deepEqual(accepted(["plan-item", "--method", "ariad", "--pre", "--obj=ship it"]), [
    "plan-item",
    "--method",
    "ariad",
    "--preauthorize-approval",
    "--objective",
    "ship it",
  ]);
  // `action="append"` options keep every occurrence, in order, in either form.
  assert.deepEqual(
    accepted(["validate-item", "--method", "ariad", "--check=one", "--check", "two"]),
    ["validate-item", "--method", "ariad", "--check", "one", "--check", "two"],
  );
  // Only the `=` form can carry a value that looks like an option, as in argparse.
  assert.deepEqual(accepted(["load", "demo", "--session-id=--weird"]), [
    "load",
    "demo",
    "--session-id",
    "--weird",
  ]);
  // Positionals come first in the canonical form wherever they were typed.
  assert.deepEqual(accepted(["inspect-method", "--journey=demo", "ariad"]), [
    "inspect-method",
    "ariad",
    "--journey",
    "demo",
  ]);
});

test("argparse's own prefix and flag refusals are reproduced at exit 2", () => {
  assert.match(
    rejected(["validate-item", "--method", "ariad", "--nav", "x"]),
    /ambiguous option --nav could match --navigator-route, --navigator-accepted/,
  );
  assert.match(
    rejected(["plan-item", "--method", "ariad", "--preauthorize-approval=yes"]),
    /--preauthorize-approval takes no value/,
  );
  // A prefix of nothing is unrecognized, not ambiguous.
  assert.match(rejected(["adopt", "--method", "ariad", "--zzz=1"]), /unrecognized argument --zzz/);
  // The subcommand itself is never abbreviated: argparse subparsers do not allow it.
  rejected(["adop", "--method", "ariad"]);
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

  accepted(["adopt", "--method", "bogus"]);
  accepted([
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
  ]);
});
