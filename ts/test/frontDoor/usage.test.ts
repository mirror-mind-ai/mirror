// CV22.DS10.TS5 plateau 2, decision D2 -- the answers Python used to own.
//
// Until TS5 every name the front door did not recognize fell through to Python:
// `Unknown command` and its usage block at the top level, argparse naming the
// program `__main__.py` inside a family. These tests pin the TypeScript-owned
// answers that replace them, the amendment for `-h`/`--help`, and the property
// that makes the top-level answer trustworthy: every command it lists is one
// the front door actually answers.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { routeMemoryCommand } from "#frontDoor/routing.ts";
import {
  answerUsage,
  FRONT_DOOR_COMMANDS,
  PROGRAM,
  renderUnknownSubcommand,
  USAGE,
} from "#frontDoor/usage.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";

test("the usage block lists the 31 commands the front door answers, and every one routes", () => {
  assert.equal(FRONT_DOOR_COMMANDS.length, 31);
  for (const [name] of FRONT_DOOR_COMMANDS) {
    const decision = routeMemoryCommand([name], {});
    const unknownTopLevel = decision.engine === "usage" && decision.request.scope === "top-level";
    assert.equal(unknownTopLevel, false, `${name} is listed but routes to the unknown answer`);
    assert.ok(USAGE.includes(`  ${name} `), name);
  }
  assert.ok(USAGE.startsWith(`Usage: ${PROGRAM} <command> [args]\n`));
  assert.doesNotMatch(USAGE, /python|__main__/);
});

test("an unknown top-level name is answered, by scope, and never kept as a command name", () => {
  const decision = routeMemoryCommand(["frobnicate", "--mirror-home", "/h"], {});
  assert.equal(decision.engine, "usage");
  assert.equal(decision.command, null);
  assert.deepEqual(decision.engine === "usage" && decision.request, {
    scope: "top-level",
    given: "frobnicate",
  });
  assert.deepEqual(routeMemoryCommand([], {}).engine === "usage" && routeMemoryCommand([], {}), {
    command: null,
    engine: "usage",
    reason: "no command",
    request: { scope: "top-level", given: null },
  });
});

test("top level: _dispatch's shape on stdout with exit 1, and help with exit 0", () => {
  assert.deepEqual(answerUsage({ scope: "top-level", given: "frobnicate" }), {
    stream: "stdout",
    exitCode: 1,
    text: `Unknown command: frobnicate\n\n${USAGE}`,
  });
  assert.deepEqual(answerUsage({ scope: "top-level", given: null }), {
    stream: "stdout",
    exitCode: 1,
    text: USAGE,
  });
  for (const help of ["-h", "--help"]) {
    assert.deepEqual(answerUsage({ scope: "top-level", given: help }), {
      stream: "stdout",
      exitCode: 0,
      text: USAGE,
    });
  }
});

test("a family: argparse's shape on stderr with exit 2, the family as the program", () => {
  const request = {
    scope: "family",
    program: "week",
    choices: ["view", "plan", "save"],
    given: "frobnicate",
  } as const;
  assert.deepEqual(answerUsage(request), {
    stream: "stderr",
    exitCode: 2,
    text:
      "usage: week [-h] {view,plan,save} ...\n" +
      "week: error: argument command: invalid choice: 'frobnicate' (choose from view, plan, save)\n",
  });
  assert.equal(
    answerUsage({ ...request, given: "" }).text,
    "usage: week [-h] {view,plan,save} ...\n" +
      "week: error: the following arguments are required: command\n",
  );
  assert.deepEqual(answerUsage({ ...request, given: "--help" }), {
    stream: "stdout",
    exitCode: 0,
    text: "usage: week [-h] {view,plan,save} ...\n",
  });
});

test("the shared renderer gives runtime the exact bytes US2 pinned", () => {
  assert.equal(
    renderUnknownSubcommand("runtime", ["status", "version"], "pull"),
    "usage: runtime [-h] {status,version} ...\n" +
      "runtime: error: argument command: invalid choice: 'pull' (choose from status, version)\n",
  );
});

/** One unknown shape per family, with the program and the given name D2 answers with. */
const FAMILY_UNKNOWNS: ReadonlyArray<[argv: string[], program: string, given: string]> = [
  [["identity", "frobnicate"], "identity", "frobnicate"],
  [["identity"], "identity", ""],
  [["extensions", "frobnicate"], "extensions", "frobnicate"],
  [["inspect", "frobnicate"], "inspect", "frobnicate"],
  [["inspect"], "inspect", ""],
  [["list", "frobnicate"], "list", "frobnicate"],
  [["descriptor", "frobnicate"], "descriptor", "frobnicate"],
  [["descriptor"], "descriptor", ""],
  [["tasks", "frobnicate"], "tasks", "frobnicate"],
  // A leading option the oracle's parent parser does not declare is not a
  // listing any more -- the path `tasks --x add` used to print the list by.
  [["tasks", "--due", "2026-01-01", "add", "x"], "tasks", "--due"],
  [["week", "frobnicate"], "week", "frobnicate"],
  [["consolidate", "frobnicate"], "consolidate", "frobnicate"],
  [["consolidate"], "consolidate", ""],
  [["shadow", "frobnicate"], "shadow", "frobnicate"],
  [["mirror", "frobnicate"], "mirror", "frobnicate"],
  [["mirror"], "mirror", ""],
  [["mode", "--mirror-home", "/h"], "mode", ""],
  [["mode", "frobnicate"], "mode", "frobnicate"],
  [["conversation-logger", "frobnicate"], "conversation-logger", "frobnicate"],
  [["conversation-logger", "--mirror-home", "/h"], "conversation-logger", ""],
  [["soul", "frobnicate"], "soul", "frobnicate"],
  [["explore"], "explore", ""],
  [["explore", "story", "frobnicate"], "explore story", "frobnicate"],
  [["build", "frobnicate"], "build", "frobnicate"],
  [["build"], "build", ""],
  // The retired groups' OTHER verbs: not a build subcommand at all, which is
  // what the oracle has answered since TS4 deleted the groups.
  [["build", "change-request", "frobnicate"], "build", "change-request"],
  [["runtime", "frobnicate"], "runtime", "frobnicate"],
];

test("every family answers an unknown or missing subcommand itself, before dispatch", () => {
  for (const [argv, program, given] of FAMILY_UNKNOWNS) {
    const decision = routeMemoryCommand(argv, {});
    assert.equal(decision.engine, "usage", argv.join(" "));
    if (decision.engine !== "usage" || decision.request.scope !== "family") continue;
    assert.equal(decision.request.program, program, argv.join(" "));
    assert.equal(decision.request.given, given, argv.join(" "));
    assert.ok(decision.request.choices.length > 0, argv.join(" "));
    assert.ok(!decision.request.choices.includes(given), argv.join(" "));
  }
});

test("help after a family is the family's usage, not an error", () => {
  for (const family of ["build", "soul", "week", "tasks", "runtime", "identity"]) {
    for (const help of ["-h", "--help"]) {
      const decision = routeMemoryCommand([family, help], {});
      assert.equal(decision.engine, "usage", `${family} ${help}`);
      if (decision.engine !== "usage") continue;
      assert.equal(answerUsage(decision.request).exitCode, 0, `${family} ${help}`);
    }
  }
});

test("through the CLI: the three shapes, their streams, and their exit codes", () => {
  const unknown = spawnFrontDoor(["frobnicate"]);
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stdout, `Unknown command: frobnicate\n\n${USAGE}`);
  assert.equal(unknown.stderr, "");

  const family = spawnFrontDoor(["week", "frobnicate"]);
  assert.equal(family.status, 2);
  assert.equal(family.stdout, "");
  assert.match(family.stderr, /^usage: week \[-h\] \{view,plan,save\} \.\.\.\n/);
  assert.doesNotMatch(family.stderr, /__main__/);

  const help = spawnFrontDoor(["build", "--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^usage: build \[-h\] \{load,inspect-method,/);
  assert.equal(help.stderr, "");
});

test("`mcp` is answered by the TypeScript server through the front door (F9)", () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-mcp-route-"));
  try {
    const dbPath = join(dir, "memory.db");
    bootstrapDatabase(dbPath).close();
    assert.equal(routeMemoryCommand(["mcp"], {}).engine, "ts");
    const initialize = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`;
    const result = spawnFrontDoor(["mcp"], { DB_PATH: dbPath }, initialize);
    assert.equal(result.status, 0, result.stderr);
    const response = JSON.parse(result.stdout.trim().split("\n")[0] ?? "{}");
    assert.equal(response.id, 1);
    assert.ok(response.result?.serverInfo, result.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
