// CV22.DS7.TS4 plateau 4 — `ext <id>` and `ext <id> <subcommand>`.
//
// This is the only leaf in DS7 whose behavior is decided by code Mirror does
// not own, so the corpus replays Python's recorded answers through the REAL
// seam: the TypeScript dispatcher decides, and the decision is executed by the
// production `runExtensionSubcommand`, which spawns the compat host's `cli`
// mode exactly as the front door will.
//
// The only thing the test changes about that call is where the child's streams
// go: production inherits them, and a test cannot read an inherited stream. The
// injected spawn delegates to the real `spawnSync` with piped stdio and touches
// nothing else — the command, the request bytes, the cwd, the environment, and
// the timeout all come from production code. A separate test pins the inherit
// contract itself, because that is the part this substitution cannot grade.
//
// Every case also compares the rows in `ext_tools_notes` afterwards: a handler
// that prints the right line while writing to a DIFFERENT database is the
// defect this bridge could introduce, and no stream comparison would see it.

import assert from "node:assert/strict";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { pythonUtcIsoformat } from "#extensions/bindings.ts";
import { type ExtWriteContext, runExtCommand } from "#extensions/catalogCommands.ts";
import {
  buildSubcommandRequest,
  type ExtensionDispatch,
  installedExtensionDir,
  isExtensionDispatch,
  pythonPathJoin,
  readDeclaredCommands,
  runExtensionSubcommand,
} from "#extensions/dispatch.ts";

interface GoldenCase {
  label: string;
  argv: string[];
  stdout: string;
  /** Null for a traceback case: the interpreter's frames are not portable. */
  stderr: string | null;
  stderr_final_line?: string;
  exit_code: number;
  /** Where the generator put its own `--mirror-home <home>` pair. */
  home_flag: "prefix" | "suffix";
  notes: string[];
  divergence?: string;
}

const golden = JSON.parse(
  readFileSync(new URL("../fixtures/ext-dispatch.golden.json", import.meta.url), "utf8"),
) as { extensions: string[]; migrated: string[]; cases: GoldenCase[] };

const FIXTURES = new URL("../fixtures/ext-dispatch", import.meta.url).pathname;
const REPO_ROOT = dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname))));

interface World {
  root: string;
  home: string;
  dbPath: string;
  db: WritableDatabase;
}

function makeWorld(): World {
  const root = mkdtempSync(join(tmpdir(), "ext-dispatch-"));
  const home = join(root, "mirror");
  mkdirSync(join(home, "extensions"), { recursive: true });
  for (const extensionId of golden.extensions) {
    cpSync(join(FIXTURES, extensionId), join(home, "extensions", extensionId), {
      recursive: true,
      // `__pycache__` is generated when Python imports a fixture; copying it
      // would carry one run's bytecode into the next run's home.
      filter: (source) => !source.includes("__pycache__"),
    });
  }
  const dbPath = join(home, "memory_test.db");
  return { root, home, dbPath, db: bootstrapDatabase(dbPath) };
}

function closeWorld(world: World): void {
  world.db.close();
  rmSync(world.root, { recursive: true, force: true });
}

function contextFor(world: World): ExtWriteContext {
  return { mirrorHome: world.home, db: world.db, deps: { nowIso: () => pythonUtcIsoformat() } };
}

/**
 * The child's environment, built like the generator's: the recorded answers
 * came from a process with no ambient mirror configuration and `MEMORY_ENV=test`,
 * so the host resolves the same `memory_test.db` this test bootstrapped.
 */
function hostEnvironment(world: World): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("MIRROR_TS_")) continue;
    if (key === "MIRROR_HOME" || key === "MIRROR_USER" || key === "DB_PATH") continue;
    environment[key] = value;
  }
  environment.MIRROR_HOME = world.home;
  environment.MEMORY_ENV = "test";
  environment.PYTHONIOENCODING = "utf-8";
  environment.NO_COLOR = "1";
  return environment;
}

interface Answer {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function execute(world: World, dispatch: ExtensionDispatch): Answer {
  let captured: SpawnSyncReturns<string> | null = null;
  const errors: string[] = [];
  const exitCode = runExtensionSubcommand(dispatch, {
    databasePath: world.dbPath,
    hostCwd: REPO_ROOT,
    environment: hostEnvironment(world),
    onError: (message) => errors.push(message),
    // Production decides everything except where the streams land.
    spawn: ((command: string, args: string[], options: Record<string, unknown>) => {
      captured = spawnSync(command, args, {
        ...options,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf8",
      }) as SpawnSyncReturns<string>;
      return captured;
    }) as unknown as typeof spawnSync,
  });
  const child = captured as SpawnSyncReturns<string> | null;
  return {
    stdout: child?.stdout ?? "",
    stderr: (child?.stderr ?? "") + errors.map((line) => `${line}\n`).join(""),
    exitCode,
  };
}

function answer(world: World, argv: readonly string[]): Answer {
  const decision = runExtCommand(contextFor(world), argv);
  if (!isExtensionDispatch(decision)) {
    return { stdout: decision.stdout, stderr: decision.stderr, exitCode: decision.exitCode };
  }
  return execute(world, decision);
}

function notesOf(world: World): string[] {
  const exists = world.db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ext_tools_notes'")
    .get();
  if (!exists) return [];
  return world.db
    .prepare("SELECT note FROM ext_tools_notes ORDER BY id")
    .all()
    .map((row) => String(row.note));
}

function lastLine(text: string): string {
  const lines = text.trimEnd().split("\n");
  return lines[lines.length - 1] ?? "";
}

test("every recorded dispatch matches Python, bytes, exit code, and rows", (t) => {
  const world = makeWorld();
  try {
    // The dispatcher never creates extension tables; `migrate` does, and the
    // generator applied exactly these before recording.
    for (const extensionId of golden.migrated) {
      runExtCommand(contextFor(world), [extensionId, "migrate"]);
    }

    const probe = answer(world, ["tools", "--help", "--mirror-home", world.home]);
    if (probe.stderr.includes("could not spawn `uv`")) {
      t.skip("uv is unavailable; the legacy command bridge cannot be exercised");
      return;
    }

    for (const recorded of golden.cases) {
      // Rebuild the generator's command line, flag position included: the
      // dispatcher consumes `--mirror-home <value>` from anywhere in argv, so
      // a replay that relocates it is replaying a different command.
      const flag = ["--mirror-home", world.home];
      const recordedArgv = recorded.argv.map((token) => token.replace("<HOME>", world.home));
      const actual = answer(
        world,
        recorded.home_flag === "prefix" ? [...flag, ...recordedArgv] : [...recordedArgv, ...flag],
      );
      const stdout = actual.stdout.split(world.home).join("<HOME>");
      const stderr = actual.stderr.split(world.home).join("<HOME>");

      assert.equal(actual.exitCode, recorded.exit_code, `${recorded.label} (exit)`);
      assert.deepEqual(notesOf(world), recorded.notes, `${recorded.label} (rows)`);

      if (recorded.divergence === undefined) {
        assert.equal(stdout, recorded.stdout, recorded.label);
        assert.equal(stderr, recorded.stderr ?? "", `${recorded.label} (stderr)`);
        continue;
      }

      // `python_path_display` is a flagged case, not a loosened one: the bytes
      // still match exactly: the flag only records WHY the path looks odd.
      assert.equal(stdout, recorded.stdout, `${recorded.label} (stdout)`);
      if (recorded.divergence === "python_path_display") {
        assert.equal(stderr, recorded.stderr ?? "", `${recorded.label} (stderr)`);
        continue;
      }

      // `python_traceback`: which shape applies is decided by WHO refused. The
      // host still IS Python, so a failure it reaches reproduces Python's own
      // traceback down to its final line -- the only part portable enough to
      // record. A refusal TypeScript makes before spawning is one line at the
      // same exit code, on the same stream, with stdout untouched.
      assert.ok(stderr.length > 0, `${recorded.label} lost its failure report`);
      if (stderr.startsWith("Mirror TS front door:")) continue;
      assert.equal(
        lastLine(stderr),
        recorded.stderr_final_line,
        `${recorded.label} (traceback tail)`,
      );
    }
  } finally {
    closeWorld(world);
  }
});

test("the corpus grades the facts a reading of the code would not give", () => {
  const byLabel = new Map(golden.cases.map((recorded) => [recorded.label, recorded]));
  const at = (label: string): GoldenCase => {
    const recorded = byLabel.get(label);
    assert.ok(recorded, `the corpus lost its ${label} case`);
    return recorded as GoldenCase;
  };

  // `--mirror-home <value>` is consumed from ANYWHERE in argv, including the
  // extension's own tail, so a handler can never receive it.
  assert.equal(at("echo_loses_the_mirror_home_pair").stdout, "argv[1]: tail\n");
  // ...but a valueless trailing `--mirror-home` is not a pair, and survives.
  assert.equal(at("echo_keeps_a_valueless_mirror_home").stdout, "argv[2]: tail --mirror-home\n");
  // The handler's exit code is the command's exit code, and `int("7")` is 7.
  assert.equal(at("exit_code_is_preserved").exit_code, 3);
  assert.equal(at("string_exit_code_is_coerced").exit_code, 7);
  // A raised ExtensionError is a printed line; a bad MANIFEST is a traceback,
  // because `memory.cli.extensions` defines a DIFFERENT exception class of the
  // same name that the dispatcher's `except ExtensionError` does not catch.
  assert.equal(at("extension_error_is_a_printed_line").exit_code, 1);
  assert.equal(at("extension_error_is_a_printed_line").divergence, undefined);
  assert.equal(at("malformed_manifest_escapes").divergence, "python_traceback");
  // The listing renders the docstring's FIRST line over the registered
  // summary, and a handler with neither is just a name.
  assert.match(at("listing_bare_id").stdout, /\n {2}documented — First line of the docstring\.\n/);
  assert.match(at("listing_bare_id").stdout, /\n {2}bare\n/);
  assert.equal(at("listing_empty_registry").stdout.includes("(none registered)"), true);
});

test("the installed path is Python's, not `join`'s", () => {
  // `Path.__truediv__` never normalizes, and the result is PRINTED. Each of
  // these is a recorded case; `join()` would silently repair all three.
  assert.equal(
    installedExtensionDir("/home/m", "../../etc"),
    "/home/m/extensions/../../etc",
    "a traversal id keeps its dots",
  );
  assert.equal(
    installedExtensionDir("/home/m", "/etc"),
    "/etc",
    "an absolute id discards the extensions root entirely",
  );
  assert.equal(installedExtensionDir("/home/m", ""), "/home/m/extensions");
  assert.equal(installedExtensionDir("/home/m", "."), "/home/m/extensions");
  assert.equal(installedExtensionDir("/home/m", "ghost/"), "/home/m/extensions/ghost");
  assert.equal(pythonPathJoin("/", "x"), "/x", "a root home does not double its separator");
});

test("the host is spawned with the user's streams and a private request", () => {
  const world = makeWorld();
  try {
    const decision = runExtCommand(contextFor(world), ["tools", "echo", "secret-account-42"]);
    assert.ok(isExtensionDispatch(decision));
    const dispatch = decision as ExtensionDispatch;

    let seen: { command: string; args: string[]; options: Record<string, unknown> } | null = null;
    const exitCode = runExtensionSubcommand(dispatch, {
      databasePath: world.dbPath,
      spawn: ((command: string, args: string[], options: Record<string, unknown>) => {
        seen = { command, args, options };
        return { status: 5, stdout: "", stderr: "", signal: null, output: [], pid: 1 };
      }) as unknown as typeof spawnSync,
    });

    const call = seen as unknown as {
      command: string;
      args: string[];
      options: Record<string, unknown>;
    };
    assert.equal(exitCode, 5, "the child's exit code is the command's exit code");
    assert.equal(call.command, "uv");
    assert.deepEqual(call.args, ["run", "python", "-m", "memory.extensions.compat_host"]);
    // stdout and stderr are the USER'S: a command's output is its product, and
    // must stream and interleave as the handler produces it.
    assert.deepEqual(call.options.stdio, ["pipe", "inherit", "inherit"]);
    assert.equal(call.options.shell, false, "extension argv is never re-parsed by a shell");
    // The request travels on stdin, so extension arguments — account ids,
    // campaign names, folder paths — never reach the process table.
    assert.ok(!JSON.stringify(call.args).includes("secret-account-42"));
    const request = JSON.parse(String(call.options.input)) as Record<string, unknown>;
    assert.deepEqual(request, {
      ...buildSubcommandRequest(dispatch, world.dbPath),
      argv: ["secret-account-42"],
    });
    assert.equal(request.protocol, "mirror-cli-v1");
  } finally {
    closeWorld(world);
  }
});

test("an id the host would refuse is refused before any process starts", () => {
  const world = makeWorld();
  try {
    let spawned = false;
    for (const extensionId of ["/etc", "..", "Tools", ""]) {
      const exitCode = runExtensionSubcommand(
        {
          kind: "extension-subcommand",
          extensionId,
          subcommand: "ping",
          argv: [],
          mirrorHome: world.home,
          extensionRoot: installedExtensionDir(world.home, extensionId),
        },
        {
          databasePath: world.dbPath,
          onError: () => {},
          spawn: (() => {
            spawned = true;
            return { status: 0, stdout: "", stderr: "", signal: null, output: [], pid: 1 };
          }) as unknown as typeof spawnSync,
        },
      );
      assert.equal(exitCode, 1, `${extensionId} must be refused`);
    }
    assert.equal(spawned, false, "a refused id must never reach a Python process");
  } finally {
    closeWorld(world);
  }
});

test("a missing host is reported as a failure, never as a silent success", () => {
  const world = makeWorld();
  try {
    const decision = runExtCommand(contextFor(world), ["tools", "echo"]);
    assert.ok(isExtensionDispatch(decision));
    const reported: string[] = [];
    const exitCode = runExtensionSubcommand(decision as ExtensionDispatch, {
      databasePath: world.dbPath,
      hostCommand: ["definitely-not-a-real-binary-9f2c"],
      onError: (message) => reported.push(message),
    });
    assert.equal(exitCode, 1);
    assert.equal(reported.length, 1);
    assert.match(reported[0] as string, /could not spawn `uv`|failed to run/);
  } finally {
    closeWorld(world);
  }
});

test("a declared command is executed directly, with the user's three streams", () => {
  const world = makeWorld();
  try {
    const decision = runExtCommand(contextFor(world), [
      "declared",
      "greet",
      "--account",
      "secret-account-42",
    ]);
    assert.ok(isExtensionDispatch(decision));

    let seen: { command: string; args: string[]; options: Record<string, unknown> } | null = null;
    runExtensionSubcommand(decision as ExtensionDispatch, {
      databasePath: world.dbPath,
      spawn: ((command: string, args: string[], options: Record<string, unknown>) => {
        seen = { command, args, options };
        return { status: 0, stdout: "", stderr: "", signal: null, output: [], pid: 1 };
      }) as unknown as typeof spawnSync,
    });
    const call = seen as unknown as {
      command: string;
      args: string[];
      options: Record<string, unknown>;
    };

    assert.equal(call.command, "node", "the declared argv is executed, not the Python host");
    assert.deepEqual(call.args, ["commands/greet.mjs", "--account", "secret-account-42"]);
    assert.equal(call.options.cwd, join(world.home, "extensions", "declared"));
    // ALL THREE streams are the user's here. The legacy bridge spends stdin on
    // its request; a declared command does not have to.
    assert.equal(call.options.stdio, "inherit");
    assert.equal(call.options.input, undefined);
    assert.equal(call.options.shell, false);

    const environment = call.options.env as NodeJS.ProcessEnv;
    assert.equal(environment.MIRROR_HOME, world.home);
    assert.equal(environment.MIRROR_DATABASE_PATH, world.dbPath);
    assert.equal(environment.MIRROR_EXTENSION_ID, "declared");
    assert.equal(environment.MIRROR_EXTENSION_ROOT, join(world.home, "extensions", "declared"));
    assert.equal(environment.MIRROR_TABLE_PREFIX, "ext_declared_");
  } finally {
    closeWorld(world);
  }
});

test("a declaration TypeScript will not execute falls back per subcommand", () => {
  const world = makeWorld();
  const extensionRoot = join(world.home, "extensions", "declared");
  const manifest = join(extensionRoot, "skill.yaml");
  const original = readFileSync(manifest, "utf8");
  try {
    const refused: Record<string, string> = {
      // Keep a VALID command here: a foreign protocol must be refused on its
      // own, not because the replacement happened to drop the argv too. The
      // first version of this case did exactly that and let a mutant that
      // deleted the protocol check survive.
      "a foreign protocol":
        "protocol: mirror-context-v1\n        command: [node, commands/greet.mjs]",
      "an empty argv": "protocol: mirror-cli-v1\n        command: []",
      "an absolute path": "protocol: mirror-cli-v1\n        command: [node, /etc/passwd]",
      "a path escaping the root":
        "protocol: mirror-cli-v1\n        command: [node, ../tools/extension.py]",
      "a path that does not exist":
        "protocol: mirror-cli-v1\n        command: [node, commands/absent.mjs]",
    };
    for (const [why, replacement] of Object.entries(refused)) {
      writeFileSync(
        manifest,
        original.replace(
          "protocol: mirror-cli-v1\n        command: [node, commands/greet.mjs]",
          replacement,
        ),
      );
      const declared = readDeclaredCommands(extensionRoot).map((entry) => entry.name);
      assert.equal(declared.includes("greet"), false, `greet survived ${why}`);
      // The extension's OTHER declaration is untouched: the fallback is per
      // subcommand, so a mixed or partly broken manifest cannot cost an
      // extension the handlers it declared correctly.
      assert.equal(declared.includes("fail"), true, `fail was lost to ${why}`);
    }
  } finally {
    writeFileSync(manifest, original);
    closeWorld(world);
  }
});

test("the subcommand listing is never a declared command", () => {
  const world = makeWorld();
  const manifest = join(world.home, "extensions", "declared", "skill.yaml");
  const original = readFileSync(manifest, "utf8");
  try {
    // An extension that declares a subcommand named `--help` must not be able
    // to take over the listing: Python answers it from the live registry, and
    // asking a command what it does is the one moment nothing may execute.
    writeFileSync(
      manifest,
      original.replace(
        "    - name: greet",
        "    - name: --help\n      summary: hijack\n      runtime:\n" +
          "        protocol: mirror-cli-v1\n        command: [node, commands/fail.mjs]\n" +
          "    - name: greet",
      ),
    );
    const decision = runExtCommand(contextFor(world), ["declared"]);
    assert.ok(isExtensionDispatch(decision));
    let command: string | null = null;
    runExtensionSubcommand(decision as ExtensionDispatch, {
      databasePath: world.dbPath,
      spawn: ((executable: string) => {
        command = executable;
        return { status: 0, stdout: "", stderr: "", signal: null, output: [], pid: 1 };
      }) as unknown as typeof spawnSync,
    });
    assert.equal(command, "uv", "the listing went to a declared command");
  } finally {
    writeFileSync(manifest, original);
    closeWorld(world);
  }
});
