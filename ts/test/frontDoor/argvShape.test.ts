// CV22.DS10.TS5 plateau 2, inventory finding F5 -- options before the
// subcommand.
//
// Seven families accept options BEFORE their subcommand in the oracle -- `week`'s
// own usage line documents it -- and routing read `argv[1]` as the subcommand.
// For five families that sent a valid invocation to Python, where it was
// answered; with the fallback gone it would have become a usage error. For two
// families already on TypeScript it was worse: `tasks --mirror-home H add "x"`
// printed the task list and wrote nothing, and `journey --mirror-home H update
// <slug> <content>` rendered a status read. The CLI tests at the bottom are
// those two writes, red before the fix.
//
// The byte-for-byte proof that every flag-first form answers as the oracle did
// was run pairwise against Python while it still existed; it is recorded in the
// story's test guide. These tests pin the shape, and that the writes land.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { canonicalArgv } from "#frontDoor/argvShape.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "#helpers/identitySchema.ts";
import { createTasksTable } from "#helpers/tasksSchema.ts";

test("a family's leading options move after its subcommand, in their original order", () => {
  assert.deepEqual(canonicalArgv(["week", "--mirror-home", "/h", "save"]), [
    "week",
    "save",
    "--mirror-home",
    "/h",
  ]);
  assert.deepEqual(
    canonicalArgv(["tasks", "--journey", "cv22", "--all", "--mirror-home", "/h", "add", "Title"]),
    ["tasks", "add", "Title", "--journey", "cv22", "--all", "--mirror-home", "/h"],
  );
  assert.deepEqual(canonicalArgv(["journey", "--mirror-home", "/h", "update", "slug", "content"]), [
    "journey",
    "update",
    "slug",
    "content",
    "--mirror-home",
    "/h",
  ]);
  assert.deepEqual(canonicalArgv(["list", "--verbose", "--runtime", "pi", "personas"]), [
    "list",
    "personas",
    "--verbose",
    "--runtime",
    "pi",
  ]);
  assert.deepEqual(canonicalArgv(["inspect", "--extensions-root", "/x", "extension", "demo"]), [
    "inspect",
    "extension",
    "demo",
    "--extensions-root",
    "/x",
  ]);
  assert.deepEqual(canonicalArgv(["descriptor", "--db-path", "/d.db", "list"]), [
    "descriptor",
    "list",
    "--db-path",
    "/d.db",
  ]);
  assert.deepEqual(
    canonicalArgv(["extensions", "--target-root", "/t", "--runtime", "claude", "sync"]),
    ["extensions", "sync", "--target-root", "/t", "--runtime", "claude"],
  );
});

test("options alone mean the family's default subcommand, where the oracle has one", () => {
  assert.deepEqual(canonicalArgv(["week", "--mirror-home", "/h"]), [
    "week",
    "view",
    "--mirror-home",
    "/h",
  ]);
  assert.deepEqual(canonicalArgv(["extensions", "--mirror-home", "/h"]), [
    "extensions",
    "list",
    "--mirror-home",
    "/h",
  ]);
  assert.deepEqual(canonicalArgv(["list", "--verbose"]), ["list", "all", "--verbose"]);
  assert.deepEqual(canonicalArgv(["tasks", "--all"]), ["tasks", "list", "--all"]);
  // No default in the oracle: the argv is left for the family's own answer.
  assert.deepEqual(canonicalArgv(["descriptor", "--mirror-home", "/h"]), [
    "descriptor",
    "--mirror-home",
    "/h",
  ]);
  assert.deepEqual(canonicalArgv(["inspect", "--mirror-home", "/h"]), [
    "inspect",
    "--mirror-home",
    "/h",
  ]);
});

test("a value that happens to name a subcommand is still the option's value", () => {
  // argparse reads `--journey list` as the journey called "list".
  assert.deepEqual(canonicalArgv(["tasks", "--journey", "list"]), [
    "tasks",
    "list",
    "--journey",
    "list",
  ]);
});

test("anything the family does not take before its subcommand is left untouched", () => {
  const untouched: string[][] = [
    // Families whose oracle rejects leading options keep their own answer.
    ["build", "--mirror-home", "/h", "load", "x"],
    ["identity", "--mirror-home", "/h", "list"],
    ["runtime", "--mirror-home", "/h", "status"],
    ["consolidate", "--mirror-home", "/h", "list"],
    // A leading option this family does not declare.
    ["week", "--limit", "5", "view"],
    ["tasks", "--due", "2026-01-01", "add", "x"],
    // Help is the family's to answer.
    ["week", "--help"],
    ["tasks", "-h"],
    // A value option with no value.
    ["week", "--mirror-home"],
    // Already canonical.
    ["week", "view", "--mirror-home", "/h"],
    ["tasks"],
    [],
  ];
  for (const argv of untouched) assert.deepEqual(canonicalArgv(argv), argv, argv.join(" "));
});

function workspace(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-argvshape-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  createTasksTable(db);
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function scalar(dbPath: string, sql: string): unknown {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return Object.values(db.prepare(sql).get() ?? {})[0];
  } finally {
    db.close();
  }
}

test("`tasks <options> add` creates the task instead of printing the list", () => {
  const ws = workspace();
  try {
    const result = spawnFrontDoor(["tasks", "--db-path", ws.dbPath, "add", "Flag first"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /✅ Task created: `\w+` - Flag first/);
    assert.equal(scalar(ws.dbPath, "SELECT count(*) FROM tasks WHERE title = 'Flag first'"), 1);
  } finally {
    ws.cleanup();
  }
});

test("`journey <options> update` writes the journey path instead of rendering a status read", () => {
  const ws = workspace();
  try {
    const result = spawnFrontDoor([
      "journey",
      "--db-path",
      ws.dbPath,
      "update",
      "demo",
      "Flag first content",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Journey path 'demo' updated\./);
    assert.equal(
      scalar(
        ws.dbPath,
        "SELECT content FROM identity WHERE layer = 'journey_path' AND key = 'demo'",
      ),
      "Flag first content",
    );
  } finally {
    ws.cleanup();
  }
});

test("a flag-first read answers exactly as its subcommand-first form does", () => {
  const ws = workspace();
  try {
    const pairs: [string[], string[]][] = [
      [
        ["week", "--db-path", ws.dbPath],
        ["week", "view", "--db-path", ws.dbPath],
      ],
      [
        ["descriptor", "--db-path", ws.dbPath, "list"],
        ["descriptor", "list", "--db-path", ws.dbPath],
      ],
      [
        ["list", "--db-path", ws.dbPath, "journeys"],
        ["list", "journeys", "--db-path", ws.dbPath],
      ],
      [
        ["inspect", "--db-path", ws.dbPath, "persona", "nobody"],
        ["inspect", "persona", "nobody", "--db-path", ws.dbPath],
      ],
    ];
    for (const [flagFirst, subFirst] of pairs) {
      const a = spawnFrontDoor(flagFirst);
      const b = spawnFrontDoor(subFirst);
      assert.deepEqual(
        { status: a.status, stdout: a.stdout, stderr: a.stderr },
        { status: b.status, stdout: b.stdout, stderr: b.stderr },
        flagFirst.join(" "),
      );
    }
  } finally {
    ws.cleanup();
  }
});
