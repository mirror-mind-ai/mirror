// CV22.DS7.US8 plateau 8 — the Builder family enters the front door with its
// gate deliberately OFF. The flip is plateau 9; these tests prove the route is
// complete before changing the shipped default.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  routeMemoryCommand,
  TS_BUILD_SUBCOMMANDS,
  TS_BUILD_WORKBENCH_ACTIONS,
} from "#frontDoor/routing.ts";

const ON = { MIRROR_TS_BUILD: "1" };

test("the plateau-8 default keeps every Builder leaf on Python", () => {
  for (const subcommand of TS_BUILD_SUBCOMMANDS) {
    const argv = subcommand === "load" ? ["build", "load", "demo"] : ["build", subcommand];
    assert.equal(routeMemoryCommand(argv).engine, "python", subcommand);
  }
});

test("MIRROR_TS_BUILD=1 exposes every one of the 27 ported leaves", () => {
  assert.equal(TS_BUILD_SUBCOMMANDS.size, 27);
  for (const subcommand of TS_BUILD_SUBCOMMANDS) {
    const argv = subcommand === "load" ? ["build", "load", "demo"] : ["build", subcommand];
    assert.equal(routeMemoryCommand(argv, ON).engine, "ts", subcommand);
  }
});

test("unknown and bare Builder subcommands are refused by name", () => {
  for (const argv of [["build"], ["build", "publish"]]) {
    const decision = routeMemoryCommand(argv, ON);
    assert.equal(decision.engine, "python");
    assert.match(decision.reason, /build subcommand not ported to TS/);
  }
});

test("all twenty legacy Workbench leaves remain on Python with the DS10 reason", () => {
  assert.equal(TS_BUILD_WORKBENCH_ACTIONS["refinement-story"].size, 7);
  assert.equal(TS_BUILD_WORKBENCH_ACTIONS["change-request"].size, 13);
  for (const [group, actions] of Object.entries(TS_BUILD_WORKBENCH_ACTIONS)) {
    for (const action of actions) {
      const decision = routeMemoryCommand(["build", group, action], ON);
      assert.equal(decision.engine, "python", `${group} ${action}`);
      assert.match(decision.reason, /retires unported in DS10/);
    }
  }
});

test("build load follows the search and conversation-tail reverts too", () => {
  for (const variable of [
    "MIRROR_TS_BUILD",
    "MIRROR_TS_SEARCH",
    "MIRROR_TS_CONVERSATION_LLM_TAIL",
  ]) {
    const decision = routeMemoryCommand(["build", "load", "demo"], {
      MIRROR_TS_BUILD: "1",
      [variable]: "0",
    });
    assert.equal(decision.engine, "python", variable);
    assert.match(decision.reason, new RegExp(`${variable}=0`));
  }
});

test("half-configured build replay refuses load instead of going live", () => {
  const decision = routeMemoryCommand(["build", "load", "demo"], {
    MIRROR_TS_BUILD: "1",
    MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/llm.json",
  });
  assert.equal(decision.engine, "ts", "the TS runtime owns the safe refusal");
  assert.match(decision.reason, /incomplete replay fixture/);
  assert.match(decision.reason, /MIRROR_TS_BUILD_EMBEDDING_REPLAY/);
});
