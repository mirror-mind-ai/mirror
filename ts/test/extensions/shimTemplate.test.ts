// CV22.DS10.TS2 — the reference `mirror-cli-v1` shim for Python handlers.
//
// `docs/product/extensions/template/cli.py.template` is the migration path this
// story offers an extension that was written against the in-process Extension
// API. It is NOT core code -- it runs as the extension, in an interpreter the
// extension chose -- but the core ships it, so the core proves it.
//
// Two of the three tests here exist because of Plan review findings. The shim
// re-implements a privilege boundary (S-1) and a connection contract (D-1) that
// the core used to own, and a shim that quietly drops either one hands every
// migrated extension write access to the whole database, or an intermittent
// `database is locked` under ordinary concurrent use.
//
// WHY THIS FILE IS SEPARATE FROM THE OTHER EXTENSION SUITES: it needs a Python
// interpreter by nature. The dispatch and catalog suites are interpreter-free
// and verified so; this one skips when `python3` is absent rather than
// weakening that claim by living beside them.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { pythonUtcIsoformat } from "#extensions/bindings.ts";
import { type ExtWriteContext, runExtCommand } from "#extensions/catalogCommands.ts";
import {
  type ExtensionDispatch,
  isExtensionDispatch,
  runExtensionSubcommand,
} from "#extensions/dispatch.ts";

const TEMPLATE = new URL(
  "../../../docs/product/extensions/template/cli.py.template",
  import.meta.url,
).pathname;

const hasPython = spawnSync("python3", ["--version"], { encoding: "utf8" }).status === 0;

interface World {
  root: string;
  home: string;
  dbPath: string;
  extensionRoot: string;
  db: ReturnType<typeof bootstrapDatabase>;
}

/**
 * An extension migrated the way the template tells an author to migrate it:
 * `cli.py` copied in verbatim, `extension.py` left exactly as it was, and a
 * `runtime` added per subcommand.
 */
function makeWorld(): World {
  const root = mkdtempSync(join(tmpdir(), "ext-shim-"));
  const home = join(root, "mirror");
  const extensionRoot = join(home, "extensions", "legacy");
  mkdirSync(extensionRoot, { recursive: true });

  copyFileSync(TEMPLATE, join(extensionRoot, "cli.py"));
  writeFileSync(
    join(extensionRoot, "skill.yaml"),
    [
      "id: legacy",
      "name: Legacy",
      "category: extension",
      "kind: command-skill",
      "summary: fixture",
      "table_prefix: ext_legacy_",
      "entrypoint:",
      "  module: extension",
      "  function: register",
      "runtimes:",
      "  pi:",
      "    command_name: ext-legacy",
      "    skill_file: SKILL.md",
      "cli:",
      "  subcommands:",
      "    - name: note",
      "      summary: Write a row in its own table",
      "      runtime:",
      "        protocol: mirror-cli-v1",
      "        command: [python3, cli.py, note]",
      "    - name: trespass",
      "      summary: Try to write outside its own tables",
      "      runtime:",
      "        protocol: mirror-cli-v1",
      "        command: [python3, cli.py, trespass]",
      "    - name: pragmas",
      "      summary: Report the connection settings it received",
      "      runtime:",
      "        protocol: mirror-cli-v1",
      "        command: [python3, cli.py, pragmas]",
      "",
    ].join("\n"),
  );
  // An UNCHANGED legacy extension body: this is the whole point of the shim.
  writeFileSync(
    join(extensionRoot, "extension.py"),
    [
      "def register(api):",
      "    api.register_cli('note', _note, summary='Write a row')",
      "    api.register_cli('trespass', _trespass, summary='Write elsewhere')",
      "    api.register_cli('pragmas', _pragmas, summary='Report settings')",
      "",
      "def _note(api, args):",
      "    api.execute(\"INSERT INTO ext_legacy_notes (note) VALUES (?)\", (' '.join(args),))",
      "    api.commit()",
      "    print('wrote: ' + ' '.join(args))",
      "    return 0",
      "",
      "def _trespass(api, args):",
      "    api.execute(\"UPDATE memories SET content = 'owned'\")",
      "    api.commit()",
      "    print('the guard did not hold')",
      "    return 0",
      "",
      "def _pragmas(api, args):",
      "    busy = api.read('PRAGMA busy_timeout').fetchone()[0]",
      "    fk = api.read('PRAGMA foreign_keys').fetchone()[0]",
      "    print('busy_timeout=%s foreign_keys=%s' % (busy, fk))",
      "    return 0",
      "",
    ].join("\n"),
  );

  const dbPath = join(home, "memory_test.db");
  const db = bootstrapDatabase(dbPath);
  db.exec("CREATE TABLE ext_legacy_notes (id INTEGER PRIMARY KEY, note TEXT NOT NULL)");
  return { root, home, dbPath, extensionRoot, db };
}

function closeWorld(world: World): void {
  world.db.close();
  rmSync(world.root, { recursive: true, force: true });
}

function contextFor(world: World): ExtWriteContext {
  return { mirrorHome: world.home, db: world.db, deps: { nowIso: () => pythonUtcIsoformat() } };
}

/** Dispatch through the real front-door seam, capturing the child's streams. */
function run(world: World, argv: readonly string[]) {
  const decision = runExtCommand(contextFor(world), argv);
  assert.ok(isExtensionDispatch(decision), `expected a dispatch for ${argv.join(" ")}`);
  let captured: ReturnType<typeof spawnSync> | null = null;
  const exitCode = runExtensionSubcommand(decision as ExtensionDispatch, {
    databasePath: world.dbPath,
    spawn: ((command: string, args: string[], options: Record<string, unknown>) => {
      captured = spawnSync(command, args, {
        ...options,
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf8",
      });
      return captured;
    }) as unknown as typeof spawnSync,
  });
  const result = captured as unknown as { stdout: string; stderr: string } | null;
  return { stdout: result?.stdout ?? "", stderr: result?.stderr ?? "", exitCode };
}

test("an unchanged legacy handler answers through the shim", { skip: !hasPython }, () => {
  const world = makeWorld();
  try {
    const answer = run(world, ["legacy", "note", "hello", "there"]);
    assert.equal(answer.exitCode, 0, answer.stderr);
    assert.equal(answer.stdout, "wrote: hello there\n");
    // It reached the database the DISPATCHER resolved, not one of its own.
    const rows = world.db
      .prepare("SELECT note FROM ext_legacy_notes ORDER BY id")
      .all()
      .map((row) => String((row as { note: string }).note));
    assert.deepEqual(rows, ["hello there"]);
  } finally {
    closeWorld(world);
  }
});

test("the shim refuses a write outside the extension's own tables (S-1)", {
  skip: !hasPython,
}, () => {
  const world = makeWorld();
  try {
    world.db.exec(
      "INSERT INTO memories (id, memory_type, title, content, created_at) " +
        "VALUES ('m1', 'fact', 'title', 'original', 't')",
    );

    const answer = run(world, ["legacy", "trespass"]);
    assert.equal(answer.exitCode, 1, "the handler must not succeed");
    assert.doesNotMatch(answer.stdout, /the guard did not hold/);
    assert.match(answer.stderr, /write to 'memories' rejected/);
    assert.match(answer.stderr, /outside the required prefix 'ext_legacy_\*'/);

    // The assertion that matters: the row is untouched. A migration that
    // dropped the guard would leave 'owned' here, and nothing else in the
    // system would notice.
    const content = world.db.prepare("SELECT content FROM memories WHERE id = 'm1'").get() as {
      content: string;
    };
    assert.equal(content.content, "original");
  } finally {
    closeWorld(world);
  }
});

test("the shim inherits the core's connection discipline (D-1)", { skip: !hasPython }, () => {
  const world = makeWorld();
  try {
    const answer = run(world, ["legacy", "pragmas"]);
    assert.equal(answer.exitCode, 0, answer.stderr);
    // A bare `sqlite3.connect` would report `busy_timeout=5000 foreign_keys=0`:
    // lock contention failing fast instead of waiting, and foreign keys not
    // enforced at all.
    assert.equal(answer.stdout, "busy_timeout=30000 foreign_keys=1\n");
  } finally {
    closeWorld(world);
  }
});
