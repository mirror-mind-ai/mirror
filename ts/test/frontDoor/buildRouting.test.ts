// CV22.DS7.US8 — the Builder family through the front door. Flipped at plateau
// 9 (2026-09-16): TypeScript answers all 27 ported leaves, and the twenty legacy
// Workbench leaves were retired by CV22.DS10.TS4. The family's revert,
// `MIRROR_TS_BUILD=0`, left with the Python engine at CV22.DS10.TS5.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  routeMemoryCommand,
  TS_BUILD_SUBCOMMANDS,
  TS_BUILD_WORKBENCH_ACTIONS,
} from "#frontDoor/routing.ts";

const ON = {};

test("the shipped default routes every one of the 27 ported leaves to TS", () => {
  assert.equal(TS_BUILD_SUBCOMMANDS.size, 27);
  for (const subcommand of TS_BUILD_SUBCOMMANDS) {
    const argv = subcommand === "load" ? ["build", "load", "demo"] : ["build", subcommand];
    assert.equal(routeMemoryCommand(argv, ON).engine, "ts", subcommand);
  }
});

test("unknown and bare Builder subcommands are answered by the family, by name", () => {
  // CV22.DS10.TS5 (D2): the front door's own usage answer, where Python's
  // argparse used to answer.
  for (const [argv, given] of [
    [["build"], ""],
    [["build", "publish"], "publish"],
  ] as const) {
    const decision = routeMemoryCommand(argv, ON);
    assert.equal(decision.engine, "usage");
    assert.deepEqual(
      decision.engine === "usage" &&
        decision.request.scope === "family" && {
          program: decision.request.program,
          given: decision.request.given,
        },
      { program: "build", given },
    );
  }
});

test("all twenty legacy Workbench leaves are retired, not routed", () => {
  // CV22.DS10.TS4 flipped these from `python` to `retired`: US8 refused them by
  // name to an engine that still answered them; TS4 deleted the engine behind
  // them, so the front door now says removed and names the cutoff.
  assert.equal(TS_BUILD_WORKBENCH_ACTIONS["refinement-story"].size, 7);
  assert.equal(TS_BUILD_WORKBENCH_ACTIONS["change-request"].size, 13);
  for (const [group, actions] of Object.entries(TS_BUILD_WORKBENCH_ACTIONS)) {
    for (const action of actions) {
      const decision = routeMemoryCommand(["build", group, action], ON);
      assert.equal(decision.engine, "retired", `${group} ${action}`);
      assert.equal(
        decision.engine === "retired" && decision.anchor,
        "the-sqlite-refinement-workbench",
      );
    }
  }
});

test("half-configured build replay refuses load instead of going live", () => {
  const decision = routeMemoryCommand(["build", "load", "demo"], {
    MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/llm.json",
  });
  assert.equal(decision.engine, "ts", "the TS runtime owns the safe refusal");
  assert.match(decision.reason, /incomplete replay fixture/);
  assert.match(decision.reason, /MIRROR_TS_BUILD_EMBEDDING_REPLAY/);
});
