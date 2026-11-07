// Issue #58: `mirror runtime <subcommand> --help` printed nothing and ran the subcommand --
// `update --help` performed an update. Help is answered before any subcommand runs, one usage
// line on stdout, exit 0, and `mirror --version` is a version, not an unknown command.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { routeMemoryCommand } from "#frontDoor/routing.ts";
import {
  RUNTIME_SUBCOMMAND_USAGE,
  RUNTIME_SUBCOMMANDS,
  renderRuntimeSubcommandUsage,
  runRuntimeReadRoute,
} from "#frontDoor/runtimeRoute.ts";

async function run(
  argv: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runRuntimeReadRoute(argv, {
    // An environment that names no install, no home and no network: if a subcommand ran, it
    // would have to fail loudly here rather than answer.
    env: { PATH: process.env.PATH ?? "", MIRROR_WELCOME_REMOTE_UPDATE_CHECK: "off" },
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

test("runtime update --help answers its usage and runs nothing", async () => {
  for (const flag of ["--help", "-h"]) {
    const result = await run(["runtime", "update", flag]);
    assert.equal(result.code, 0);
    assert.equal(
      result.stdout,
      "usage: runtime update [--check] [--dry-run] [--no-fetch] [--skip-migrations] [--repair-updater] [--mirror-home PATH] [--channel stable|main]\n",
    );
    assert.equal(result.stderr, "");
  }
  // Help anywhere after the subcommand, among other arguments, still wins.
  const late = await run(["runtime", "update", "--check", "--help"]);
  assert.equal(late.code, 0);
  assert.match(late.stdout, /^usage: runtime update /);
});

test("every runtime subcommand the route dispatches has a usage line, and it is the one --help prints", async () => {
  for (const subcommand of RUNTIME_SUBCOMMANDS) {
    const usage = RUNTIME_SUBCOMMAND_USAGE.get(subcommand);
    if (usage === undefined) {
      // The two retired names answer from the retired-surface table, never from here.
      assert.ok(
        ["release-doctor", "release-promote"].includes(subcommand),
        `${subcommand} has no usage line`,
      );
      continue;
    }
    assert.match(usage, new RegExp(`^runtime ${subcommand}\\b`));
    const result = await run(["runtime", subcommand, "--help"]);
    assert.equal(result.code, 0, `${subcommand} --help exit`);
    assert.equal(result.stdout, renderRuntimeSubcommandUsage(subcommand));
  }
});

test("the usage lines name only options the subcommand reads", () => {
  // Each option in a usage line appears in runtimeRoute.ts as something read (`optionValue` or
  // `includes`); a line that promised a flag nobody reads would be the bug in reverse.
  const source = readRouteSource();
  for (const [subcommand, usage] of RUNTIME_SUBCOMMAND_USAGE) {
    for (const option of usage.match(/--[a-z-]+/g) ?? []) {
      assert.ok(
        source.includes(`"${option}"`),
        `${subcommand}: ${option} is not read by the route`,
      );
    }
  }
});

test("mirror --version is a version, not an unknown command", () => {
  for (const flag of ["--version", "-V"]) {
    const decision = routeMemoryCommand([flag]);
    assert.equal(decision.engine, "ts");
    assert.equal(decision.command, flag);
  }
});

function readRouteSource(): string {
  return readFileSync(new URL("../../src/frontDoor/runtimeRoute.ts", import.meta.url), "utf8");
}
