// CV22.DS7.US7 plateau 5 — the `explore` routing table.
//
// `explore` is the first family with a NESTED subparser, so the allowlist is
// two levels deep. The tests that matter here are the refusals: a subcommand or
// a `story` action Python grows later must reach Python rather than inherit
// this route because the family was claimed wholesale. That is the
// `conversations append` defect (RS009/CR055) — it exited 0 and discarded the
// caller's data.
//
// Flipped 2026-09-09: the family answers from TS with NO gate in the
// environment, so the tests below assert the shipped default rather than a
// configuration. `MIRROR_TS_EXPLORE=0` is the revert control.

import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPLORE_STORY_ACTIONS, EXPLORE_SUBCOMMANDS } from "#frontDoor/exploreRoute.ts";
import { routeMemoryCommand } from "#frontDoor/routing.ts";

const ON = { MIRROR_TS_EXPLORE: "1" };

test("the shipped default routes every allowlisted leaf to TS with no gate set", () => {
  for (const subcommand of EXPLORE_SUBCOMMANDS) {
    // `story` needs an action to clear the second level; the others are terminal.
    const argv =
      subcommand === "story"
        ? ["explore", "story", "show", "a-journey"]
        : ["explore", subcommand, "a-journey"];
    assert.equal(routeMemoryCommand(argv).engine, "ts", `${subcommand} did not reach TS`);
  }
  for (const action of EXPLORE_STORY_ACTIONS) {
    const route = routeMemoryCommand(["explore", "story", action, "a-journey"]);
    assert.equal(route.engine, "ts", `story ${action} did not reach TS`);
  }
});

test("MIRROR_TS_EXPLORE=1 is accepted but unnecessary after the flip", () => {
  assert.equal(routeMemoryCommand(["explore", "load", "a-journey"], ON).engine, "ts");
  assert.equal(routeMemoryCommand(["explore", "deactivate"], ON).engine, "ts");
  for (const action of EXPLORE_STORY_ACTIONS) {
    assert.equal(routeMemoryCommand(["explore", "story", action, "a-journey"], ON).engine, "ts");
  }
});

test("MIRROR_TS_EXPLORE=0 keeps the whole family on Python", () => {
  const route = routeMemoryCommand(["explore", "load", "a-journey"], {
    MIRROR_TS_EXPLORE: "0",
  });
  assert.equal(route.engine, "python");
  assert.match(route.reason, /MIRROR_TS_EXPLORE=0/);
});

test("story promote is refused BY NAME after the flip — its tail is Builder load (US8)", () => {
  // The dangerous direction, now that the gate is on by default: a leaf missing
  // from the allowlist would otherwise be claimed along with the family.
  const route = routeMemoryCommand(["explore", "story", "promote", "a-journey"]);
  assert.equal(route.engine, "python");
  assert.match(route.reason, /explore story action not ported to TS: promote/);
});

test("an unknown explore subcommand is refused by name, not inherited", () => {
  const route = routeMemoryCommand(["explore", "summarize", "a-journey"]);
  assert.equal(route.engine, "python");
  assert.match(route.reason, /explore subcommand not ported to TS: summarize/);
});

test("an unknown story action is refused by name, not inherited", () => {
  const route = routeMemoryCommand(["explore", "story", "publish", "a-journey"]);
  assert.equal(route.engine, "python");
  assert.match(route.reason, /explore story action not ported to TS: publish/);
});

test("a bare `explore` with no subcommand reaches Python", () => {
  const route = routeMemoryCommand(["explore"]);
  assert.equal(route.engine, "python");
  assert.match(route.reason, /explore subcommand not ported to TS: \(none\)/);
});

test("a bare `explore story` with no action reaches Python", () => {
  const route = routeMemoryCommand(["explore", "story"]);
  assert.equal(route.engine, "python");
  assert.match(route.reason, /explore story action not ported to TS: \(none\)/);
});

test("the story action is read past the options argparse strips first", () => {
  // `--mirror-home` and friends precede the action in real invocations; a
  // positional read that ignored them would see the flag as the action and
  // refuse every gated call.
  const route = routeMemoryCommand([
    "explore",
    "story",
    "--mirror-home",
    "/tmp/home",
    "thicken",
    "a-journey",
  ]);
  assert.equal(route.engine, "ts");
});

test("the allowlist and the route's own dispatch table agree", () => {
  // Two lists, one contract. If a leaf is added to the route and not to the
  // allowlist it is unreachable; the reverse is the dangerous direction — the
  // route would be asked for an argv shape it does not implement.
  assert.deepEqual([...EXPLORE_SUBCOMMANDS].sort(), ["deactivate", "load", "story"]);
  assert.ok(
    !(EXPLORE_STORY_ACTIONS as readonly string[]).includes("promote"),
    "promote must not be in the route's action list while Builder load is unported",
  );
});
