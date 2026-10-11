// CV22.DS10.TS2 — `ext <id>` and `ext <id> <subcommand>` after the bridge.
//
// This file replaces a PARITY CORPUS. Until DS10.TS2 it replayed 40 answers
// recorded from Python through the real compat-host seam, because the behavior
// was decided by code Mirror did not own. Deleting the host deleted the second
// engine, so there is nothing left to agree with and these are direct
// assertions on TypeScript's own surface.
//
// What the corpus proved, and where it went (the disposition the Navigator
// approved on 2026-09-21, recorded in the story package):
//
//   * path resolution (8 cases) ....... survives untouched, below
//   * declared runtime (4 cases) ...... survives untouched, below
//   * host-executed behavior (10) ..... MIGRATED to the declared path: argv
//                                       verbatim, exit code, both streams, and
//                                       the write landing in the dispatcher's
//                                       database are still pinned, now through
//                                       `mirror-cli-v1`
//   * Python-host semantics (8) ....... RETIRED. `int("7")`, a `None` return,
//                                       `ExtensionError` as a printed line, and
//                                       a manifest traceback were CPython's
//                                       rules. Nothing reproduces them, and
//                                       pretending otherwise would be fiction.
//   * live-registry listing (4) ....... RETIRED and replaced: the listing now
//                                       renders from the manifest
//   * host fallback (2) ............... INVERTED: refusal, not fallback
//
// The `tools` fixture is deliberately PARTIALLY MIGRATED — `legacy` declares no
// runtime while its siblings do — because that is the state every extension
// passes through, and the state most likely to be wrong.

import assert from "node:assert/strict";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { pythonUtcIsoformat } from "#extensions/bindings.ts";
import { type ExtWriteContext, runExtCommand } from "#extensions/catalogCommands.ts";
import {
  type ExtensionDispatch,
  installedExtensionDir,
  isExtensionDispatch,
  pythonPathJoin,
  readSubcommandListing,
  renderSubcommandListing,
  runExtensionSubcommand,
} from "#extensions/dispatch.ts";
import { runMigrations } from "#extensions/migrations.ts";

const FIXTURES = new URL("../fixtures/ext-dispatch", import.meta.url).pathname;
const EXTENSIONS = ["tools", "declared", "silent", "malformed"];

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
  for (const extensionId of EXTENSIONS) {
    cpSync(join(FIXTURES, extensionId), join(home, "extensions", extensionId), {
      recursive: true,
    });
  }
  const dbPath = join(home, "memory_test.db");
  const db = bootstrapDatabase(dbPath);
  for (const extensionId of ["tools", "declared"]) {
    runMigrations(db, extensionId, join(home, "extensions", extensionId, "migrations"), {
      nowIso: () => pythonUtcIsoformat(),
    });
  }
  return { root, home, dbPath, db };
}

function closeWorld(world: World): void {
  world.db.close();
  rmSync(world.root, { recursive: true, force: true });
}

function contextFor(world: World): ExtWriteContext {
  return { mirrorHome: world.home, db: world.db, deps: { nowIso: () => pythonUtcIsoformat() } };
}

interface Answer {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run `ext ...` end to end, decision and execution.
 *
 * Production inherits the child's streams and a test cannot read an inherited
 * stream, so the injected spawn delegates to the REAL `spawnSync` with piped
 * stdio and touches nothing else -- command, argv, cwd, env, and timeout all
 * come from production code. A separate test pins the inherit contract, which
 * is the one thing this substitution cannot grade.
 */
function run(world: World, argv: readonly string[]): Answer {
  const decision = runExtCommand(contextFor(world), argv);
  if (!isExtensionDispatch(decision)) {
    return { stdout: decision.stdout, stderr: decision.stderr, exitCode: decision.exitCode };
  }
  let captured: SpawnSyncReturns<string> | null = null;
  const exitCode = runExtensionSubcommand(decision as ExtensionDispatch, {
    databasePath: world.dbPath,
    spawn: ((command: string, args: string[], options: Record<string, unknown>) => {
      captured = spawnSync(command, args, {
        ...options,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf8",
      }) as SpawnSyncReturns<string>;
      return captured;
    }) as unknown as typeof spawnSync,
  });
  const result = captured as unknown as SpawnSyncReturns<string> | null;
  return { stdout: result?.stdout ?? "", stderr: result?.stderr ?? "", exitCode };
}

test("a declared command receives argv verbatim and owns its exit code", () => {
  const world = makeWorld();
  try {
    assert.deepEqual(run(world, ["tools", "echo", "one", "two"]), {
      stdout: "argv[2]: one two\n",
      stderr: "",
      exitCode: 0,
    });
    assert.equal(run(world, ["tools", "echo"]).stdout, "argv[0]: \n");
    // Flags, `--`, quotes and non-ASCII are the command's, not the dispatcher's.
    assert.equal(
      run(world, ["tools", "echo", "--flag", "--", "-x", 'café "q"']).stdout,
      'argv[4]: --flag -- -x café "q"\n',
    );
    // `--mirror-home <value>` is consumed from ANYWHERE in argv, so a command
    // can never receive it...
    assert.equal(
      run(world, ["tools", "echo", "tail", "--mirror-home", world.home]).stdout,
      "argv[1]: tail\n",
    );
    // ...but a valueless trailing one is not a pair, and survives.
    assert.equal(
      run(world, ["tools", "echo", "tail", "--mirror-home"]).stdout,
      "argv[2]: tail --mirror-home\n",
    );
    assert.equal(run(world, ["tools", "fail"]).exitCode, 3);
  } finally {
    closeWorld(world);
  }
});

test("both streams reach the caller, and a write lands in the dispatcher's database", () => {
  const world = makeWorld();
  try {
    const streams = run(world, ["tools", "streams"]);
    assert.equal(streams.stdout, "on stdout\n");
    assert.equal(streams.stderr, "on stderr\n");

    assert.equal(run(world, ["tools", "write", "first"]).stdout, "wrote: first\n");
    assert.equal(run(world, ["tools", "write", "second"]).stdout, "wrote: second\n");
    // The defect this seam could introduce is a command that prints the right
    // line while writing to a DIFFERENT database. No stream comparison would
    // see it; counting the rows the dispatcher resolved does.
    const rows = world.db
      .prepare("SELECT note FROM ext_tools_notes ORDER BY id")
      .all()
      .map((row) => String((row as { note: string }).note));
    assert.deepEqual(rows, ["first", "second"]);
  } finally {
    closeWorld(world);
  }
});

test("`mirror-cli-v1` is language-neutral, not a Node contract", () => {
  const world = makeWorld();
  try {
    const answer = run(world, ["tools", "shell", "a", "b"]);
    assert.equal(answer.exitCode, 0);
    assert.match(answer.stdout, /^shell saw 2 argument\(s\): a b\n/);
    // The context a declared command gets is in the ENVIRONMENT, so a shell
    // script reads it with no protocol library at all.
    assert.match(answer.stdout, /\next=tools prefix=ext_tools_\n$/);
  } finally {
    closeWorld(world);
  }
});

test("a documented subcommand with no runtime refuses, explicitly and without spawning", () => {
  const world = makeWorld();
  try {
    let spawned = false;
    const decision = runExtCommand(contextFor(world), ["tools", "legacy", "arg"]);
    assert.equal(isExtensionDispatch(decision), false, "a refusal is a decision, not a dispatch");
    const answer = decision as { stdout: string; stderr: string; exitCode: number };

    assert.equal(answer.exitCode, 1);
    assert.equal(answer.stdout, "", "nothing on stdout: the command did not run");
    // One line, naming the extension, the subcommand, and the fix.
    assert.match(answer.stderr, /^Mirror: extension\/tools declares no runtime for 'legacy'\./);
    assert.match(answer.stderr, /declare cli\.subcommands\[\]\.runtime \(mirror-cli-v1\)/);
    assert.match(answer.stderr, /pending-cutoffs\.md/);
    assert.equal(answer.stderr.trimEnd().includes("\n"), false, "exactly one line");
    assert.equal(spawned, false);
    spawned = false;
  } finally {
    closeWorld(world);
  }
});

test("a malformed declaration refuses rather than falling back", () => {
  const world = makeWorld();
  try {
    // `broken` declares `command: []`. Before TS2 an unusable declaration fell
    // through to the host; with no host, an unusable declaration is simply not
    // a declaration, and says so.
    const answer = run(world, ["declared", "broken"]);
    assert.equal(answer.exitCode, 1);
    assert.match(answer.stderr, /declares no runtime for 'broken'/);

    const legacy = run(world, ["declared", "legacy"]);
    assert.equal(legacy.exitCode, 1);
    assert.match(legacy.stderr, /declares no runtime for 'legacy'/);

    // Its declared siblings are untouched by either refusal.
    assert.match(run(world, ["declared", "greet", "x"]).stdout, /^greet\[1\]: x \| ext=declared/);
    assert.equal(run(world, ["declared", "fail"]).exitCode, 3);
  } finally {
    closeWorld(world);
  }
});

test("the listing renders from the manifest and flags what has not migrated", () => {
  const world = makeWorld();
  try {
    const listing = run(world, ["tools"]);
    assert.equal(listing.exitCode, 0);
    assert.equal(
      listing.stdout,
      [
        "=== subcommands of extension/tools ===",
        "  bare",
        "  echo — Print the argv it received",
        "  fail — Exit with code 3",
        "  legacy — Documented but never migrated, so it refuses  (no runtime declared)",
        "  shell — Any executable runtime, not only Node",
        "  streams — Write to stdout and to stderr",
        "  write — Insert a row in its own table",
        "",
      ].join("\n"),
    );
    // All three spellings are the same request, and `ext <id>` is one of them.
    for (const spelling of ["--help", "-h", "help"]) {
      assert.equal(run(world, ["tools", spelling]).stdout, listing.stdout);
    }
    // A manifest with no `cli:` block at all.
    assert.equal(
      run(world, ["silent"]).stdout,
      "=== subcommands of extension/silent ===\n  (none declared)\n",
    );
  } finally {
    closeWorld(world);
  }
});

test("an undocumented subcommand is a different failure from an unmigrated one", () => {
  const world = makeWorld();
  try {
    const unknown = run(world, ["tools", "nope"]);
    assert.equal(unknown.exitCode, 1);
    // "I have never heard of that" prints on stdout with the listing, the way
    // Python's did. "That exists but has not been migrated" prints one line on
    // stderr. Collapsing the two would send a user editing the wrong file.
    assert.match(unknown.stdout, /^unknown subcommand 'nope' for extension\/tools\n/);
    assert.match(unknown.stdout, /=== subcommands of extension\/tools ===/);
    assert.equal(unknown.stderr, "");
  } finally {
    closeWorld(world);
  }
});

test("the installed path is Python's, not `join`'s", () => {
  // `Path.__truediv__` never normalizes, and the result is PRINTED. `join()`
  // would silently repair every one of these.
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

test("an extension that is not installed is refused with the unnormalized path", () => {
  const world = makeWorld();
  try {
    const answer = run(world, ["ghost", "anything"]);
    assert.equal(answer.exitCode, 1);
    assert.equal(
      answer.stdout,
      `extension not installed: ${join(world.home, "extensions", "ghost")}\n`,
    );
  } finally {
    closeWorld(world);
  }
});

test("a declared command is spawned with the user's three streams and no shell", () => {
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
    assert.equal(call.command, "node", "the manifest's declared executable, not an interpreter");
    assert.deepEqual(call.args, ["commands/echo.mjs", "secret-account-42"]);
    // All three are the user's now. The retired bridge held stdin as its
    // request pipe, which is exactly what a declared command gets back.
    assert.equal(call.options.stdio, "inherit");
    assert.equal(call.options.shell, false, "extension argv is never re-parsed by a shell");
    assert.equal(call.options.cwd, dispatch.extensionRoot);
    const env = call.options.env as NodeJS.ProcessEnv;
    assert.equal(env.MIRROR_EXTENSION_ID, "tools");
    assert.equal(env.MIRROR_DATABASE_PATH, world.dbPath);
    assert.equal(env.MIRROR_TABLE_PREFIX, "ext_tools_");
  } finally {
    closeWorld(world);
  }
});

test("an id that cannot be legal is refused before any process starts", () => {
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
          command: ["node", "commands/echo.mjs"],
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
    assert.equal(spawned, false, "a refused id must never reach a process");
  } finally {
    closeWorld(world);
  }
});

test("a declared command that cannot start is reported, never a silent success", () => {
  const world = makeWorld();
  try {
    const reported: string[] = [];
    const exitCode = runExtensionSubcommand(
      {
        kind: "extension-subcommand",
        extensionId: "tools",
        subcommand: "echo",
        argv: [],
        mirrorHome: world.home,
        extensionRoot: join(world.home, "extensions", "tools"),
        command: ["definitely-not-a-real-binary-9f2c"],
      },
      {
        databasePath: world.dbPath,
        onError: (message) => reported.push(message),
      },
    );
    assert.equal(exitCode, 1);
    assert.match(reported.join("\n"), /declares a command for 'echo' that could not be started/);
  } finally {
    closeWorld(world);
  }
});

test("the manifest reader tolerates what the validator would reject", () => {
  const world = makeWorld();
  try {
    // `malformed` omits `summary`, a required field. The listing must still
    // answer: a manifest problem is never allowed to turn a read into a crash.
    const entries = readSubcommandListing(join(world.home, "extensions", "malformed"));
    assert.deepEqual(entries, []);
    assert.equal(
      renderSubcommandListing("malformed", entries),
      "=== subcommands of extension/malformed ===\n  (none declared)\n",
    );
    // A root that does not exist at all is the same answer, not a throw.
    assert.deepEqual(readSubcommandListing(join(world.home, "extensions", "ghost")), []);
  } finally {
    closeWorld(world);
  }
});
