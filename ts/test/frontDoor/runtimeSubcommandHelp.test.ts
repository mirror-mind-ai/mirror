// Issue #58: `mirror runtime <subcommand> --help` printed nothing and ran the subcommand --
// `update --help` performed an update. Help is answered before any subcommand runs, one usage
// line on stdout, exit 0, and `mirror --version` is a version, not an unknown command.
//
// CR215 moved the answer out of the runtime route into routing, where it covers every family:
// these tests read it there, through the same answer the front door prints.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMAND_SYNOPSES } from "#frontDoor/commandHelp.ts";
import { routeMemoryCommand } from "#frontDoor/routing.ts";
import { RUNTIME_SUBCOMMANDS } from "#frontDoor/runtimeRoute.ts";
import { answerUsage, type UsageAnswer } from "#frontDoor/usage.ts";

function helpAnswer(argv: readonly string[]): UsageAnswer {
  const decision = routeMemoryCommand(argv);
  assert.equal(decision.engine, "usage", `${argv.join(" ")} is answered by usage`);
  if (decision.engine !== "usage") throw new Error("unreachable");
  return answerUsage(decision.request);
}

const UPDATE_USAGE =
  "usage: runtime update [--check] [--dry-run] [--no-fetch] [--skip-migrations] [--repair-updater] [--mirror-home PATH] [--channel stable|main]\n";

test("runtime update --help answers its usage and runs nothing", () => {
  for (const flag of ["--help", "-h"]) {
    assert.deepEqual(helpAnswer(["runtime", "update", flag]), {
      stream: "stdout",
      exitCode: 0,
      text: UPDATE_USAGE,
    });
  }
  // Help anywhere after the subcommand, among other arguments, still wins.
  assert.equal(helpAnswer(["runtime", "update", "--check", "--help"]).text, UPDATE_USAGE);
});

test("every runtime subcommand the route dispatches has a usage line, and it is the one --help prints", () => {
  for (const subcommand of RUNTIME_SUBCOMMANDS) {
    const synopsis = COMMAND_SYNOPSES.get(`runtime ${subcommand}`);
    if (synopsis === undefined) {
      // The two retired names answer from the retired-surface table, never from here.
      assert.ok(
        ["release-doctor", "release-promote"].includes(subcommand),
        `${subcommand} has no usage line`,
      );
      assert.equal(routeMemoryCommand(["runtime", subcommand, "--help"]).engine, "retired");
      continue;
    }
    assert.match(synopsis, new RegExp(`^runtime ${subcommand}\\b`));
    const answer = helpAnswer(["runtime", subcommand, "--help"]);
    assert.equal(answer.exitCode, 0, `${subcommand} --help exit`);
    assert.equal(answer.text, `usage: ${synopsis}\n`);
  }
});

test("mirror --version is a version, not an unknown command", () => {
  for (const flag of ["--version", "-V"]) {
    const decision = routeMemoryCommand([flag]);
    assert.equal(decision.engine, "ts");
    assert.equal(decision.command, flag);
  }
});
