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

const BACKFILL: RetiredSurface = {
  surface: "conversations --metadata-backfill-preview",
  anchor: "conversation-metadata-backfill",
  matches: () => true,
};

test("a branch keyed on the retired token is reported, with the reason it answers", () => {
  // The shape TS4 left behind: the family answers its own listing for any
  // flag, except the retired one, which it still routes somewhere by name.
  const route = (argv: readonly string[]): RouteDecision =>
    argv.includes("--metadata-backfill-preview")
      ? { command: "conversations", engine: "ts", reason: "backfill preview, by name" }
      : { command: "conversations", engine: "ts", reason: "conversations listing" };

  assert.deepEqual(shadowedRetiredRoutes(route, [BACKFILL]), [
    { surface: "conversations --metadata-backfill-preview", reason: "backfill preview, by name" },
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
