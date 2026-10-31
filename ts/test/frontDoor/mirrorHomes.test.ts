// CR185 — the homes root, and what counts as a home in it.
//
// The not-configured error names the homes it finds, and `init <name>` adopts
// an existing one instead of refusing it. Both read the same rule from
// `#frontDoor/mirrorHomes.ts`, so the command the error prints is the command
// `init` honours.

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { findMirrorHomes, homesRoot, isMirrorHome, userHomePath } from "#frontDoor/mirrorHomes.ts";
import { tempDir } from "#helpers/tempDir.ts";

/** A directory holding a non-empty `identity/`, the shape `init` leaves. */
function identityHome(path: string): string {
  mkdirSync(join(path, "identity", "self"), { recursive: true });
  writeFileSync(join(path, "identity", "self", "soul.yaml"), "soul\n");
  return path;
}

/** A directory holding only a database: a home whose identity lives in it. */
function databaseHome(path: string, name = "memory.db"): string {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, name), "");
  return path;
}

test("the homes root is `<home>/.mirror-minds`, and a user's home is the user's directory in it", () => {
  assert.equal(homesRoot("/home/u"), join("/home/u", ".mirror-minds"));
  assert.equal(userHomePath("leandro", "/home/u"), join("/home/u", ".mirror-minds", "leandro"));
});

test("a home holds a non-empty identity/ or a database, and nothing else makes one", () => {
  const root = tempDir("mirror-homes-rule-");
  assert.equal(isMirrorHome(identityHome(join(root, "identity"))), true);
  assert.equal(isMirrorHome(databaseHome(join(root, "production"))), true);
  // Every name `dbNameForEnv` gives: a development or a staging database counts.
  assert.equal(isMirrorHome(databaseHome(join(root, "development"), "memory_dev.db")), true);
  assert.equal(isMirrorHome(databaseHome(join(root, "staging"), "memory_staging.db")), true);

  // What an unresolved Pi session leaves under the root: a log, no home.
  mkdirSync(join(root, "log-only"));
  writeFileSync(join(root, "log-only", "mirror-logger.log"), "line\n");
  assert.equal(isMirrorHome(join(root, "log-only")), false);
  // An empty identity/ is a home `init` has not filled yet, and may still fill.
  mkdirSync(join(root, "empty-identity", "identity"), { recursive: true });
  assert.equal(isMirrorHome(join(root, "empty-identity")), false);
  // A database-shaped directory is not a database.
  mkdirSync(join(root, "dir-named-db", "memory.db"), { recursive: true });
  assert.equal(isMirrorHome(join(root, "dir-named-db")), false);

  writeFileSync(join(root, "a-file"), "");
  assert.equal(isMirrorHome(join(root, "a-file")), false);
  assert.equal(isMirrorHome(join(root, "missing")), false);
});

test("a home reached through a symlink is a home", () => {
  // People link a home into a synced folder; the directory entry is a link.
  const root = tempDir("mirror-homes-link-");
  const target = identityHome(join(root, "synced", "leandro"));
  mkdirSync(join(root, "home", ".mirror-minds"), { recursive: true });
  symlinkSync(target, join(root, "home", ".mirror-minds", "leandro"));
  assert.equal(isMirrorHome(join(root, "home", ".mirror-minds", "leandro")), true);
  assert.deepEqual(findMirrorHomes(join(root, "home")), [
    {
      name: "leandro",
      path: join(root, "home", ".mirror-minds", "leandro"),
      nameable: true,
    },
  ]);
});

test("findMirrorHomes lists the homes in code-point order, says which names init accepts, and skips the rest", () => {
  const home = tempDir("mirror-homes-find-");
  const root = join(home, ".mirror-minds");
  identityHome(join(root, "b-home"));
  databaseHome(join(root, "a-home"));
  identityHome(join(root, "Old Home"));
  identityHome(join(root, ".hidden"));
  mkdirSync(join(root, "log-only"));
  writeFileSync(join(root, "log-only", "mirror-logger.log"), "");
  writeFileSync(join(root, ".DS_Store"), "");

  assert.deepEqual(findMirrorHomes(home), [
    // CR141's grammar is init's: a name with a capital or a space is a home
    // `init` cannot name, so the error offers MIRROR_HOME for it instead.
    { name: "Old Home", path: join(root, "Old Home"), nameable: false },
    { name: "a-home", path: join(root, "a-home"), nameable: true },
    { name: "b-home", path: join(root, "b-home"), nameable: true },
  ]);
});

test("a root that is missing, a file, or unreadable has no homes, and says so without throwing", () => {
  assert.deepEqual(findMirrorHomes(tempDir("mirror-homes-missing-")), []);

  const fileRoot = tempDir("mirror-homes-file-");
  writeFileSync(join(fileRoot, ".mirror-minds"), "");
  assert.deepEqual(findMirrorHomes(fileRoot), []);

  const lockedHome = tempDir("mirror-homes-locked-");
  const locked = join(lockedHome, ".mirror-minds");
  identityHome(join(locked, "leandro"));
  chmodSync(locked, 0o000);
  try {
    // Root reads through any mode, so the case only proves something unprivileged.
    if (process.getuid?.() !== 0) assert.deepEqual(findMirrorHomes(lockedHome), []);
  } finally {
    chmodSync(locked, 0o700);
  }
});
