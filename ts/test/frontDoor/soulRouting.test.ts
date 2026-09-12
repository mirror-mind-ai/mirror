// CV22.DS7.US6 plateau 6 — the `soul` routing contract.
//
// Three properties, in rising order of consequence:
//   1. the family answers from TS by DEFAULT since the 2026-09-08 flip, and
//      `MIRROR_TS_SOUL=0` reverts it with no code change;
//   2. subcommands are allowlisted BY NAME, so a subcommand Python grows later
//      reaches Python instead of inheriting the route (RS009/CR055 — the
//      `conversations append` defect exited 0 and discarded the payload);
//   3. `harvest save` stays on Python until the embedding replay transport is
//      configured, because it is the one leaf that crosses the provider seam.

import assert from "node:assert/strict";
import test from "node:test";
import { routeMemoryCommand } from "#frontDoor/routing.ts";
import { SOUL_SUBCOMMANDS } from "#frontDoor/soulRoute.ts";

// The SHIPPED environment: no gate set at all. Every assertion below that uses
// `ON` would also pass with the gate forced on, which is exactly why the
// default-route test uses an empty environment instead.
const ON = {};

test("soul answers from TS with NO gate in the environment (the shipped default)", () => {
  for (const subcommand of SOUL_SUBCOMMANDS) {
    if (subcommand === "harvest") continue; // its `save` action is asserted separately
    const decision = routeMemoryCommand(["soul", subcommand], {});
    assert.equal(decision.engine, "ts", `${subcommand} must answer from TS by default`);
  }
});

test("MIRROR_TS_SOUL=1 is accepted but unnecessary after the flip", () => {
  for (const subcommand of SOUL_SUBCOMMANDS) {
    if (subcommand === "harvest") continue;
    assert.equal(routeMemoryCommand(["soul", subcommand], { MIRROR_TS_SOUL: "1" }).engine, "ts");
  }
});

test("an unported subcommand reaches Python BY NAME, never by inheritance", () => {
  // The regression this allowlist exists for: a subcommand added upstream must
  // not be answered by a route that has never implemented it.
  for (const unknown of ["publish", "rite-v2", "listen-all", ""]) {
    const decision = routeMemoryCommand(["soul", unknown], ON);
    assert.equal(decision.engine, "python", `soul ${unknown} must reach Python`);
    assert.match(decision.reason, /subcommand not ported to TS/);
  }
  assert.equal(routeMemoryCommand(["soul"], ON).engine, "python", "bare `soul`");
});

test("the allowlist and the route's own subcommand list agree", () => {
  // Two lists that must not drift: routing decides, the route dispatches.
  for (const subcommand of SOUL_SUBCOMMANDS) {
    assert.equal(routeMemoryCommand(["soul", subcommand], ON).engine, "ts", subcommand);
  }
});

test("harvest save is live like the rest of the family, and says so", () => {
  // CV22.DS8.US3: before this, `save` was the one Soul leaf held on Python --
  // it crosses the provider seam through the embedding, and the front door
  // supplied no provider at all, so a replay variable nobody sets was the only
  // way to reach the TypeScript path.
  for (const action of ["set", "show", "decline"]) {
    assert.equal(routeMemoryCommand(["soul", "harvest", action], ON).engine, "ts", action);
  }
  const save = routeMemoryCommand(["soul", "harvest", "save"], ON);
  assert.equal(save.engine, "ts");
  assert.match(save.reason, /DS8\.US3 soul harvest save live/);
  assert.equal(
    routeMemoryCommand(["soul", "harvest", "save"], {
      ...ON,
      MIRROR_TS_SOUL_EMBEDDING_REPLAY: "/tmp/embedding.json",
    }).engine,
    "ts",
    "a fixture still selects replay",
  );
  // The family switch is the revert: every other Soul leaf is deterministic,
  // so reverting all of them costs nothing and adds no third thing to remember.
  assert.equal(
    routeMemoryCommand(["soul", "harvest", "save"], { MIRROR_TS_SOUL: "0" }).engine,
    "python",
  );
});

test("harvest save is recognized behind the options argparse strips first", () => {
  // The action must be found PAST the options, or `save` would inherit the
  // generic soul route and skip its own transport decision entirely.
  const decision = routeMemoryCommand(
    ["soul", "harvest", "--session-id", "s1", "--journey", "j", "save"],
    { ...ON, MIRROR_TS_SOUL_EMBEDDING_REPLAY: "/tmp/embedding.json" },
  );
  assert.equal(decision.engine, "ts");
  assert.match(
    decision.reason,
    /replay transport/,
    "the save leaf's own decision, not the family's",
  );
});

test("MIRROR_TS_SOUL=0 keeps the whole family on Python", () => {
  for (const subcommand of SOUL_SUBCOMMANDS) {
    assert.equal(
      routeMemoryCommand(["soul", subcommand], { MIRROR_TS_SOUL: "0" }).engine,
      "python",
    );
  }
});
