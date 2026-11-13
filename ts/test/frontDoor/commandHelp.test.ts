// CR215: `-h` or `--help` anywhere after a command answers its usage and runs nothing.
//
// Before, only the word in the subcommand's place was read as help. In a copy of a real
// home, `tasks delete <id> --help` deleted the task, `conversation-logger discard-current
// --help` discarded the conversation, `identity set ... --help` wrote identity, and
// `journal --help` reached OpenRouter to journal the word `--help`.
//
// Routing-level tests walk every family's every subcommand, read from the same allowlists
// routing answers by. CLI-level tests run the front door against a scratch home, one command
// per kind of harm, and compare the home byte for byte before and after.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapDatabaseIfMissing } from "#db/bootstrap.ts";
import { openDatabaseReadOnly } from "#db/database.ts";
import { buildUsageSynopsis } from "#frontDoor/buildArgSpecs.ts";
import { COMMAND_SYNOPSES } from "#frontDoor/commandHelp.ts";
import { helpFamilies, routeMemoryCommand } from "#frontDoor/routing.ts";
import { answerUsage, FRONT_DOOR_COMMANDS, familyUsageLine, USAGE } from "#frontDoor/usage.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { tempDir } from "#helpers/tempDir.ts";

/** The answer the front door prints for argv, when routing answers it as usage; else null. */
function usageFor(argv: readonly string[]): ReturnType<typeof answerUsage> | null {
  const decision = routeMemoryCommand(argv);
  return decision.engine === "usage" ? answerUsage(decision.request) : null;
}

/** Shapes a help flag must not intercept: the user's text on the hook path, and own help. */
const KEEPS_ITS_ARGV: readonly (readonly string[])[] = [
  ["mirror", "doorman", "--prompt", "--help", "--session-id", "S"],
  ["mirror", "doorman", "--session-id", "S", "--prompt", "-h"],
  ["conversation-logger", "log-user", "S", "--help"],
  ["conversation-logger", "log-assistant", "S", "-h"],
  ["conversation-logger", "--session-id", "S", "user-prompt", "--help"],
  ["conversation-logger", "stop", "--help"],
  ["conversation-logger", "session-start", "--fast", "--help"],
  ["conversation-logger", "session-end", "--help"],
  ["conversation-logger", "session-end-pi", "S", "--help"],
  ["conversation-logger", "session-maintenance", "--help"],
  ["welcome", "--status-line", "--session-id", "--help"],
  ["conversations", "append", "--help"],
  ["conversations", "imported", "--help"],
  ["conversations", "skill-turns", "-h"],
  ["ext", "--help"],
  ["ext", "some-extension", "--help"],
];

describe("routing answers a help flag after a command", () => {
  test("every subcommand of every family answers usage, stdout, exit 0", () => {
    // The hook path's subcommands and the commands with their own help, by name.
    const keeps = new Set([
      "mirror doorman",
      ...[
        "log-user",
        "log-assistant",
        "user-prompt",
        "stop",
        "session-start",
        "session-end",
        "session-end-pi",
        "session-maintenance",
      ].map((subcommand) => `conversation-logger ${subcommand}`),
    ]);
    let answered = 0;
    for (const [family, choices] of helpFamilies()) {
      for (const subcommand of choices) {
        if (keeps.has(`${family} ${subcommand}`)) continue;
        // The two retired runtime names keep their retired answer (runtimeSubcommandHelp).
        if (family === "runtime" && subcommand.startsWith("release-")) continue;
        for (const flag of ["--help", "-h"]) {
          const answer = usageFor([family, subcommand, flag]);
          assert.ok(answer, `${family} ${subcommand} ${flag} is answered as usage`);
          assert.equal(answer.stream, "stdout", `${family} ${subcommand}`);
          assert.equal(answer.exitCode, 0, `${family} ${subcommand}`);
          assert.match(answer.text, /^usage: /, `${family} ${subcommand}`);
          answered += 1;
        }
      }
    }
    assert.ok(answered > 200, `walked every subcommand, answered ${answered}`);
  });

  test("every front-door command answers help, except `ext`, which hands it to the extension", () => {
    for (const [name] of FRONT_DOOR_COMMANDS) {
      const answer = usageFor([name, "--help"]);
      if (name === "ext") {
        assert.equal(answer, null);
        continue;
      }
      assert.ok(answer, `${name} --help`);
      assert.equal(answer.exitCode, 0, name);
      assert.equal(answer.stream, "stdout", name);
    }
  });

  test("a help flag anywhere after the command wins, among options and arguments", () => {
    const expected = `usage: ${COMMAND_SYNOPSES.get("tasks delete")}\n`;
    for (const argv of [
      ["tasks", "delete", "522e6eab", "--help"],
      ["tasks", "delete", "--help", "522e6eab"],
      ["tasks", "delete", "522e6eab", "--mirror-home", "/x", "-h"],
    ]) {
      assert.equal(usageFor(argv)?.text, expected, argv.join(" "));
    }
    // Help wins over an option's value for a command a person types (the plan's decision).
    assert.equal(
      usageFor(["identity", "set", "persona", "x", "--content", "--help"])?.text,
      `usage: ${COMMAND_SYNOPSES.get("identity set")}\n`,
    );
  });

  test("a subcommand that changes data answers its own line; one that only reads, the family's", () => {
    assert.equal(
      usageFor(["tasks", "add", "--help"])?.text,
      "usage: tasks add <title> [--journey ID] [--due DATE] [--stage STAGE] [--mirror-home PATH]\n",
    );
    assert.equal(
      usageFor(["tasks", "list", "--help"])?.text,
      familyUsageLine("tasks", [
        "list",
        "add",
        "done",
        "doing",
        "block",
        "import",
        "delete",
        "sync",
        "sync-config",
      ]),
    );
    // Family-less commands answer their one line.
    assert.equal(
      usageFor(["seed", "--help"])?.text,
      "usage: seed [--force] [--env ENV] [--mirror-home PATH]\n",
    );
  });

  test("an unknown subcommand with a help flag answers the family's line, exit 0", () => {
    const answer = usageFor(["tasks", "bogus", "--help"]);
    assert.equal(answer?.exitCode, 0);
    assert.match(answer?.text ?? "", /^usage: tasks \[-h\] \{list,/);
  });

  test("explore story's actions answer by action, inside the nested family", () => {
    assert.equal(
      usageFor(["explore", "story", "handoff", "mirror", "--help"])?.text,
      `usage: ${COMMAND_SYNOPSES.get("explore story handoff")}\n`,
    );
    assert.match(
      usageFor(["explore", "story", "show", "--help"])?.text ?? "",
      /^usage: explore story \[-h\] \{promote,show,/,
    );
  });

  test("build's lines are generated from the specs its parser enforces", () => {
    assert.equal(
      usageFor(["build", "show", "--journey", "mirror", "--help"])?.text,
      "usage: build show --method METHOD [--journey JOURNEY] [--session-id SESSION_ID] [--mirror-home PATH]\n",
    );
    assert.equal(
      usageFor(["build", "load", "-h"])?.text,
      "usage: build load <journey> [--session-id SESSION_ID] [--mirror-home PATH] [--ignore-production-role]\n",
    );
    assert.match(
      buildUsageSynopsis("review-item") ?? "",
      /--decision \{pending,no_action,defer,pay_now\}/,
    );
  });

  test("the hook path and the commands with their own help keep their argv", () => {
    for (const argv of KEEPS_ITS_ARGV) {
      const decision = routeMemoryCommand(argv);
      assert.equal(decision.engine, "ts", `${argv.join(" ")} reaches its route`);
    }
  });

  test("the top level is unchanged: `mirror --help` is the usage block, exit 0", () => {
    assert.deepEqual(usageFor(["--help"]), { stream: "stdout", exitCode: 0, text: USAGE });
    assert.deepEqual(usageFor(["-h"]), { stream: "stdout", exitCode: 0, text: USAGE });
  });

  test("a help answer names no argument the caller passed, in its log reason", () => {
    const decision = routeMemoryCommand(["tasks", "add", "my private title", "--help"]);
    assert.equal(decision.engine, "usage");
    assert.equal(decision.reason, "help: tasks add");
    assert.doesNotMatch(JSON.stringify(decision), /private/);
  });
});

// --- every option a usage line names is one its route reads -----------------------------

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

/** Where each command's options are read, by its first word. */
const ROUTE_SOURCES: Readonly<Record<string, readonly string[]>> = {
  init: ["frontDoor/initRoute.ts"],
  seed: ["frontDoor/cli.ts", "frontDoor/seedPaths.ts"],
  backup: ["frontDoor/dbSafetyToolsRoute.ts"],
  "repair-encoding": ["frontDoor/dbSafetyToolsRoute.ts"],
  journal: ["frontDoor/contentTailRoute.ts"],
  consult: ["consult/args.ts"],
  recall: ["frontDoor/cli.ts"],
  memories: ["frontDoor/render/memories.ts", "frontDoor/searchRoute.ts"],
  journeys: [],
  "detect-persona": [],
  welcome: ["frontDoor/runtimeRoute.ts"],
  mcp: [],
  journey: ["frontDoor/cli.ts"],
  conversations: ["frontDoor/cli.ts"],
  identity: ["frontDoor/cli.ts"],
  extensions: ["extensions/catalogCommands.ts", "frontDoor/extensionCatalogRoute.ts"],
  mirror: ["frontDoor/mirrorModeRoute.ts"],
  mode: ["frontDoor/mirrorModeRoute.ts"],
  "conversation-logger": ["conversation/loggerCli.ts"],
  explore: ["frontDoor/exploreRoute.ts"],
  soul: ["frontDoor/soulRoute.ts"],
  tasks: ["frontDoor/cli.ts"],
  week: ["frontDoor/cli.ts"],
  descriptor: ["frontDoor/contentTailRoute.ts"],
  consolidate: ["frontDoor/cli.ts"],
  shadow: ["frontDoor/cli.ts"],
  runtime: ["frontDoor/runtimeRoute.ts"],
};

/** Every database command resolves its home through the shared resolver. */
const SHARED_SOURCES = ["frontDoor/dbPath.ts"];

test("every option a usage line names is read by its command's route", () => {
  for (const [program, synopsis] of COMMAND_SYNOPSES) {
    const first = program.split(" ")[0] ?? "";
    const files = ROUTE_SOURCES[first];
    assert.ok(files, `${program}: name the files that read its options`);
    const source = [...files, ...SHARED_SOURCES]
      .map((file) => readFileSync(join(SRC, file), "utf8"))
      .join("\n");
    for (const option of synopsis.match(/--[a-z][a-z-]*/g) ?? []) {
      assert.ok(source.includes(`"${option}"`), `${program}: ${option} is not read by its route`);
    }
  }
});

// --- the front door itself: a help flag runs nothing ------------------------------------

/** Every file under the scratch dirs with its bytes, except the logs the front door appends. */
function snapshot(roots: readonly string[]): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (root: string, dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(root, path);
      else if (!entry.name.endsWith(".log")) {
        const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
        files.set(`${root}:${relative(root, path)}`, digest);
      }
    }
  };
  for (const root of roots) walk(root, root);
  return files;
}

describe("the front door: a help flag runs nothing", () => {
  const dir = tempDir("mirror-command-help-");
  const home = join(dir, "home");
  const osHome = join(dir, "os-home");
  const config = join(dir, "config");
  for (const path of [home, osHome, config]) mkdirSync(path, { recursive: true });
  const dbPath = join(home, "memory.db");
  bootstrapDatabaseIfMissing(dbPath);

  // A home that names nothing outside the scratch dirs, and providers that fail loudly
  // (a missing replay fixture, no key) rather than reach the network, if a command ran.
  const env: Record<string, string> = {
    MIRROR_HOME: home,
    MIRROR_USER: "",
    DB_PATH: dbPath,
    HOME: osHome,
    XDG_CONFIG_HOME: config,
    OPENROUTER_API_KEY: "",
    MIRROR_TS_JOURNAL_LLM_REPLAY: join(dir, "absent.json"),
    MIRROR_TS_JOURNAL_EMBEDDING_REPLAY: join(dir, "absent.json"),
    MIRROR_WELCOME_REMOTE_UPDATE_CHECK: "off",
    MIRROR_SESSION_ID: "",
    CLAUDE_CODE_SESSION_ID: "",
    CODEX_SESSION_ID: "",
  };

  const added = spawnFrontDoor(["tasks", "add", "probe"], env);
  assert.equal(added.status, 0, added.stderr);
  const taskId = /`(\w+)`/.exec(added.stdout)?.[1] ?? "";

  function taskCount(): number {
    const db = openDatabaseReadOnly(dbPath);
    try {
      return Number(db.prepare("SELECT COUNT(*) AS n FROM tasks").get()?.n);
    } finally {
      db.close();
    }
  }

  const cases: readonly (readonly string[])[] = [
    // Destroys.
    ["tasks", "delete", taskId, "--help"],
    ["conversation-logger", "discard-current", "--help"],
    // Writes.
    ["identity", "set", "persona", "probe", "--content", "x", "--help"],
    ["journey", "update", "mirror", "new text", "--help"],
    ["mode", "activate", "builder", "--help"],
    ["seed", "--help"],
    ["init", "probe", "--help"],
    ["mirror", "log", "--help"],
    ["conversation-logger", "mute", "-h"],
    // Spends: the journal's providers are a missing fixture, so a run would fail loudly.
    ["journal", "--help"],
    ["journal", "a private entry", "--journey", "mirror", "-h"],
  ];

  for (const argv of cases) {
    test(`${argv.join(" ")}: usage on stdout, exit 0, the home unchanged`, () => {
      const before = snapshot([home, osHome, config]);
      const result = spawnFrontDoor([...argv], env);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^usage: /);
      assert.equal(result.stderr, "");
      assert.deepEqual(snapshot([home, osHome, config]), before);
    });
  }

  test("the task is still there", () => {
    assert.ok(taskId, "the probe task was created");
    assert.equal(taskCount(), 1);
  });

  test("`--help` works on a machine with no user configured", () => {
    const bare = { ...env, MIRROR_HOME: "", DB_PATH: "", MIRROR_USER: "" };
    const result = spawnFrontDoor(["tasks", "add", "--help"], bare);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^usage: tasks add <title>/);
  });

  test("`mirror log` refuses a summary shaped like an option, and writes nothing (CR109)", () => {
    const before = snapshot([home]);
    const result = spawnFrontDoor(["mirror", "log", "--summary", "--session-id", "S"], env);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /'--summary' looks like an option, not a response summary/);
    // Refused before the database opens: not even the pre-write backup is taken.
    assert.deepEqual(snapshot([home]), before);
  });
});
