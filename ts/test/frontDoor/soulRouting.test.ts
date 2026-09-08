// CV22.DS7.US6 plateau 6 — the `soul` routing contract.
//
// Three properties, in rising order of consequence:
//   1. the gate is OFF by default, so this build ships no behavior change;
//   2. subcommands are allowlisted BY NAME, so a subcommand Python grows later
//      reaches Python instead of inheriting the route (RS009/CR055 — the
//      `conversations append` defect exited 0 and discarded the payload);
//   3. `harvest save` stays on Python until the embedding replay transport is
//      configured, because it is the one leaf that crosses the provider seam.

import assert from "node:assert/strict";
import test from "node:test";
import { routeMemoryCommand } from "#frontDoor/routing.ts";
import { SOUL_SUBCOMMANDS } from "#frontDoor/soulRoute.ts";

const ON = { MIRROR_TS_SOUL: "1" };

test("soul is not routed to TS without the gate", () => {
  for (const subcommand of SOUL_SUBCOMMANDS) {
    const decision = routeMemoryCommand(["soul", subcommand], {});
    assert.equal(decision.engine, "python", `${subcommand} must stay on Python by default`);
    assert.match(decision.reason, /MIRROR_TS_SOUL/);
  }
});

test("every ported subcommand routes to TS with the gate on", () => {
  for (const subcommand of SOUL_SUBCOMMANDS) {
    if (subcommand === "harvest") continue; // its `save` action is asserted separately
    assert.equal(routeMemoryCommand(["soul", subcommand], ON).engine, "ts", subcommand);
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

test("harvest save needs the embedding replay transport; the other actions do not", () => {
  for (const action of ["set", "show", "decline"]) {
    assert.equal(routeMemoryCommand(["soul", "harvest", action], ON).engine, "ts", action);
  }
  const save = routeMemoryCommand(["soul", "harvest", "save"], ON);
  assert.equal(save.engine, "python");
  assert.match(save.reason, /embedding replay transport until DS8/);
  assert.equal(
    routeMemoryCommand(["soul", "harvest", "save"], {
      ...ON,
      MIRROR_TS_SOUL_EMBEDDING_REPLAY: "1",
    }).engine,
    "ts",
  );
});

test("harvest save is recognized behind the options argparse strips first", () => {
  const decision = routeMemoryCommand(
    ["soul", "harvest", "--session-id", "s1", "--journey", "j", "save"],
    ON,
  );
  assert.equal(decision.engine, "python", "the action must be found past the options");
  assert.match(decision.reason, /embedding replay transport/);
});

test("MIRROR_TS_SOUL=0 keeps the whole family on Python", () => {
  for (const subcommand of SOUL_SUBCOMMANDS) {
    assert.equal(
      routeMemoryCommand(["soul", subcommand], { MIRROR_TS_SOUL: "0" }).engine,
      "python",
    );
  }
});
