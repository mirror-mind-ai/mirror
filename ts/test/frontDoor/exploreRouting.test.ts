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

test("story promote answers from TS now that Builder load is ported (US8 plateau 7)", () => {
  const route = routeMemoryCommand(["explore", "story", "promote", "a-journey"]);
  assert.equal(route.engine, "ts");
  assert.match(route.reason, /story promote/);
});

test("story promote follows the COMPOSED Builder reverts, not just the Explorer gate", () => {
  // Its tail is a Builder session start, so the leaf answers to the same three
  // variables `build load` does. A promote that kept calling the provider after
  // `MIRROR_TS_SEARCH=0` would make one family mean two things.
  for (const variable of [
    "MIRROR_TS_BUILD",
    "MIRROR_TS_SEARCH",
    "MIRROR_TS_CONVERSATION_LLM_TAIL",
  ]) {
    const route = routeMemoryCommand(["explore", "story", "promote", "a-journey"], {
      [variable]: "0",
    });
    assert.equal(route.engine, "python", `${variable}=0 must revert promote`);
    assert.match(route.reason, new RegExp(`${variable}=0`));
  }
  // And the Explorer family's own gate still reverts it, before any of that.
  const gated = routeMemoryCommand(["explore", "story", "promote", "a-journey"], {
    MIRROR_TS_EXPLORE: "0",
  });
  assert.equal(gated.engine, "python");
  assert.match(gated.reason, /MIRROR_TS_EXPLORE=0/);
});

test("half a replay fixture refuses promote by name instead of spending", () => {
  // The decision is taken BEFORE promote's first write, because promote is not
  // idempotent: once the story is promoted, a second run finds none.
  const route = routeMemoryCommand(["explore", "story", "promote", "a-journey"], {
    MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/half.json",
  });
  assert.equal(route.engine, "ts", "the TS runtime must refuse before promote mutates");
  assert.match(route.reason, /incomplete replay fixture/);
  assert.match(route.reason, /MIRROR_TS_BUILD_EMBEDDING_REPLAY/);
});

// CV22.DS10.TS5 (D2): an unknown or missing subcommand is answered by the
// family itself -- by name, never inherited -- where argparse used to answer.
function usageOf(argv: string[]): { program: string; given: string } | null {
  const route = routeMemoryCommand(argv);
  return route.engine === "usage" && route.request.scope === "family"
    ? { program: route.request.program, given: route.request.given }
    : null;
}

test("an unknown explore subcommand is answered by the family, not inherited", () => {
  assert.deepEqual(usageOf(["explore", "summarize", "a-journey"]), {
    program: "explore",
    given: "summarize",
  });
});

test("an unknown story action is answered by `explore story`, not inherited", () => {
  assert.deepEqual(usageOf(["explore", "story", "publish", "a-journey"]), {
    program: "explore story",
    given: "publish",
  });
});

test("a bare `explore` with no subcommand is told one is required", () => {
  assert.deepEqual(usageOf(["explore"]), { program: "explore", given: "" });
});

test("a bare `explore story` with no action is told one is required", () => {
  assert.deepEqual(usageOf(["explore", "story"]), { program: "explore story", given: "" });
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
  // `promote` is now in BOTH lists. Held on Python by name since US7, it joined
  // at US8 plateau 7 with the leaf its tail depends on.
  assert.ok((EXPLORE_STORY_ACTIONS as readonly string[]).includes("promote"));
  for (const action of EXPLORE_STORY_ACTIONS) {
    assert.equal(
      routeMemoryCommand(["explore", "story", action, "a-journey"]).engine,
      "ts",
      `${action} is in the route's table but unreachable through routing`,
    );
  }
});
