// CV22.DS10.TS5, inventory F2 -- no family branch may still answer a shape
// that a retired entry already answers.
//
// The first test is the story's claim about the real router. The other two
// prove the check can fail: a guard nobody has seen fire is a belief, not a
// guard, and this one exists precisely because two dead branches passed every
// test for as long as they lived.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RETIRED_SURFACES,
  type RetiredSurface,
  type RouteDecision,
  routeByFamily,
} from "#frontDoor/routing.ts";
import { shadowedRetiredRoutes } from "#guards/retiredRouteShadows.ts";

test("no family branch still claims a shape the retired table answers", () => {
  assert.deepEqual(
    shadowedRetiredRoutes((argv) => routeByFamily(argv, {})),
    [],
  );
});

/**
 * A retired entry, taken FROM the table rather than spelled out here: the
 * retired-surface sweep forbids the retired names outside the files that answer
 * them, and a test that hard-codes one is residue by that rule (it was, for one
 * commit, and CI said so).
 */
function retiredEntry(anchor: string): RetiredSurface {
  const entry = RETIRED_SURFACES.find((candidate) => candidate.anchor === anchor);
  assert.ok(entry, anchor);
  return entry;
}

test("a branch keyed on the retired token is reported, with the reason it answers", () => {
  // The shape TS4 left behind: the family answers its own listing for any
  // flag, except the retired one, which it still routes somewhere by name.
  const retired = retiredEntry("conversation-metadata-backfill");
  const retiredFlag = retired.surface.split(" ").at(-1) ?? "";
  const route = (argv: readonly string[]): RouteDecision =>
    argv.includes(retiredFlag)
      ? { command: "conversations", engine: "ts", reason: "the retired flag, by name" }
      : { command: "conversations", engine: "ts", reason: "conversations listing" };

  assert.deepEqual(shadowedRetiredRoutes(route, [retired]), [
    { surface: retired.surface, reason: "the retired flag, by name" },
  ]);
});

test("a generic answer that echoes the name it was given is not a claim", () => {
  const route = (argv: readonly string[]): RouteDecision => ({
    command: "runtime",
    engine: "ts",
    reason: `unknown runtime subcommand: ${argv[1]}`,
  });
  const releaseDoctor = RETIRED_SURFACES.find(
    (entry) => entry.surface === "runtime release-doctor",
  );
  assert.ok(releaseDoctor);
  assert.deepEqual(shadowedRetiredRoutes(route, [releaseDoctor]), []);
});
