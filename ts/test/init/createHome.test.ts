// CV24.DS4 — create a home, for a host's first-run assistant.
//
// See the decision "A host creates a home beside its target and renames it into
// place, writing nothing outside it". One call copies the templates, bootstraps
// the database and seeds it, in a staging directory renamed into place only
// once the home is complete. It writes nothing outside the target, never
// `~/.config/mirror/env`, and refuses anything already at the target.

import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ensureConversation } from "#conversation/hostCalls.ts";
import { readJourneyTree } from "#conversation/hostReads.ts";
import { openDatabaseReadOnly } from "#db/database.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { tempDir } from "#helpers/tempDir.ts";
import { CreateHomeRejectedError, createHome } from "#init/createHome.ts";
import { templatesIdentityRoot } from "#init/init.ts";

function yamlFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => join(entry.parentPath, entry.name));
}

function identityRows(dbPath: string): string[] {
  const db = openDatabaseReadOnly(dbPath);
  try {
    return (
      db.prepare("SELECT layer, key, content, version FROM identity ORDER BY layer, key").all() as {
        layer: string;
        key: string;
        content: string;
        version: string;
      }[]
    ).map((row) => JSON.stringify([row.layer, row.key, row.content, row.version]));
  } finally {
    db.close();
  }
}

function rejection(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof CreateHomeRejectedError) return error.reason;
    throw error;
  }
  throw new Error("expected a rejection");
}

/** Run `fn` with HOME and the Mirror variables pointed at scratch, then restore them. */
function withEnvironment<T>(overrides: Record<string, string>, fn: () => T): T {
  const keys = ["HOME", "MIRROR_HOME", "MIRROR_USER", "DB_PATH"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("a created home is complete, current, and usable by the other calls", () => {
  const parent = tempDir("mirror-create-home-");
  const homePath = join(parent, "ana");
  const created = createHome({ homePath, userName: "ana" });

  assert.deepEqual(
    { ...created, seeded: undefined },
    {
      homePath,
      dbPath: join(homePath, "memory.db"),
      identityRoot: join(homePath, "identity"),
      seeded: undefined,
    },
  );
  assert.ok(created.seeded.created >= 20, `seeded ${created.seeded.created}`);
  assert.equal(created.seeded.updated, 0);
  for (const file of yamlFiles(created.identityRoot)) {
    assert.ok(!readFileSync(file, "utf8").includes("{{user_name}}"), file);
  }
  assert.equal(inspectMigrationState(created.dbPath).state, "current");
  assert.ok(readJourneyTree(created.dbPath).roots.length >= 0);
  assert.ok(
    ensureConversation(created.dbPath, {
      sessionId: "s-1",
      journeyId: "j",
      title: "t",
      interface: "test",
    }).conversationId,
  );
  assert.deepEqual(readdirSync(parent), ["ana"], "a staging directory was left beside the home");
  assert.ok(!existsSync(join(homePath, "backups")), "a snapshot was taken");
});

test("it seeds exactly what `mirror init` plus `mirror seed` seed", () => {
  const library = createHome({
    homePath: join(tempDir("mirror-create-home-lib-"), "ana"),
    userName: "ana",
  });

  const scratchHome = tempDir("mirror-create-home-cli-");
  const cliHome = join(scratchHome, ".mirror-minds", "ana");
  const env = {
    HOME: scratchHome,
    MIRROR_HOME: cliHome,
    MIRROR_USER: "ana",
    MEMORY_ENV: "production",
  };
  const init = spawnFrontDoor(["init", "ana"], env);
  assert.equal(init.status, 0, init.stderr);
  const seed = spawnFrontDoor(["seed"], env);
  assert.equal(seed.status, 0, seed.stderr);

  assert.deepEqual(identityRows(library.dbPath), identityRows(join(cliHome, "memory.db")));
});

test("a failed seed leaves no home and no staging directory", () => {
  const brokenTemplates = join(tempDir("mirror-create-home-templates-"), "identity");
  cpSync(templatesIdentityRoot(), brokenTemplates, { recursive: true });
  writeFileSync(join(brokenTemplates, "self", "soul.yaml"), "");
  const parent = tempDir("mirror-create-home-broken-");

  assert.equal(
    rejection(() =>
      createHome(
        { homePath: join(parent, "ana"), userName: "ana" },
        { templatesRoot: brokenTemplates },
      ),
    ),
    "seed_failed",
  );
  assert.deepEqual(readdirSync(parent), []);
});

test("missing templates are refused, and leave nothing", () => {
  const parent = tempDir("mirror-create-home-notemplates-");
  assert.equal(
    rejection(() =>
      createHome(
        { homePath: join(parent, "ana"), userName: "ana" },
        { templatesRoot: join(parent, "absent") },
      ),
    ),
    "templates_unavailable",
  );
  assert.deepEqual(readdirSync(parent), []);
});

test("it writes nothing outside the home, and ignores MIRROR_HOME", () => {
  const scratchHome = tempDir("mirror-create-home-userhome-");
  const canary = tempDir("mirror-create-home-canary-");
  const parent = tempDir("mirror-create-home-target-");
  withEnvironment(
    {
      HOME: scratchHome,
      MIRROR_HOME: canary,
      MIRROR_USER: "canary",
      DB_PATH: join(canary, "memory.db"),
    },
    () => createHome({ homePath: join(parent, "ana"), userName: "ana" }),
  );
  assert.deepEqual(readdirSync(scratchHome), [], "something was written under HOME");
  assert.deepEqual(readdirSync(canary), [], "the canary home was written");
  assert.deepEqual(readdirSync(parent), ["ana"]);
});

test("every refusal leaves what was there untouched", () => {
  const parent = tempDir("mirror-create-home-refusals-");
  const occupied = join(parent, "occupied");
  mkdirSync(occupied);
  writeFileSync(join(occupied, "keep.txt"), "mine");
  const empty = join(parent, "empty");
  mkdirSync(empty);

  assert.equal(
    rejection(() => createHome({ homePath: occupied, userName: "ana" })),
    "home_exists",
  );
  assert.equal(
    rejection(() => createHome({ homePath: empty, userName: "ana" })),
    "home_exists",
  );
  assert.equal(readFileSync(join(occupied, "keep.txt"), "utf8"), "mine");
  assert.deepEqual(readdirSync(empty), []);

  for (const userName of ["", "-help", "../escaped", "Ana Vale", 3]) {
    assert.equal(
      rejection(() => createHome({ homePath: join(parent, "x"), userName } as never)),
      "invalid_user_name",
      String(userName),
    );
  }
  for (const homePath of ["relative/home", join(parent, "no-such-parent", "ana"), "", 7]) {
    assert.equal(
      rejection(() => createHome({ homePath, userName: "ana" } as never)),
      "invalid_home_path",
      String(homePath),
    );
  }
  assert.deepEqual(readdirSync(parent).sort(), ["empty", "occupied"]);
});
