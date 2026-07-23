import assert from "node:assert/strict";
import { test } from "node:test";
import { MirrorHomeNotConfiguredError, resolveSeedPaths } from "../../src/frontDoor/seedPaths.ts";

const io = { home: "/Users/probe", exists: () => false };

test("--db-path wins over everything (TS-only convenience, not a Python seed flag)", () => {
  const result = resolveSeedPaths(
    ["--db-path", "/explicit/db.sqlite", "--mirror-home", "/somewhere", "--env", "test"],
    { MIRROR_HOME: "/mirror" },
    io,
  );
  assert.equal(result.dbPath, "/explicit/db.sqlite");
  assert.equal(result.identityRoot, "/somewhere/identity");
});

test("--mirror-home ALWAYS resolves the db to memory.db, ignoring --env (verified oracle behavior)", () => {
  const withTest = resolveSeedPaths(["--mirror-home", "/home1", "--env", "test"], {}, io);
  assert.equal(withTest.dbPath, "/home1/memory.db");
  const withProd = resolveSeedPaths(["--mirror-home", "/home1", "--env", "production"], {}, io);
  assert.equal(withProd.dbPath, "/home1/memory.db");
  assert.equal(withTest.identityRoot, "/home1/identity");
  assert.equal(withTest.mirrorHome, "/home1");
});

test("identity root/mirror home resolve independently of --env, MEMORY_DIR, and DB_PATH", () => {
  const result = resolveSeedPaths(
    ["--env", "test"],
    { MIRROR_HOME: "/mirror", MEMORY_DIR: "/redirected", DB_PATH: "/should/not/win/here" },
    io,
  );
  assert.equal(result.identityRoot, "/mirror/identity");
  assert.equal(result.mirrorHome, "/mirror");
  // --env differs from ambient (unset -> "production"): MEMORY_DIR wins with
  // the env-appropriate filename (db_path_for_env branch).
  assert.equal(result.dbPath, "/redirected/memory_test.db");
});

test("a mismatched --env without --mirror-home follows MEMORY_PROD_DIR (prod only) > MEMORY_DIR > mirror home, env-named", () => {
  const viaMemoryDir = resolveSeedPaths(
    ["--env", "test"],
    { MIRROR_HOME: "/mirror", MEMORY_DIR: "/dir" },
    io,
  );
  assert.equal(viaMemoryDir.dbPath, "/dir/memory_test.db");

  const viaMirrorHome = resolveSeedPaths(["--env", "test"], { MIRROR_HOME: "/mirror" }, io);
  assert.equal(viaMirrorHome.dbPath, "/mirror/memory_test.db");

  // MEMORY_PROD_DIR only applies when the FLAG's env is "production".
  const prodDirIgnoredForTest = resolveSeedPaths(
    ["--env", "test"],
    { MIRROR_HOME: "/mirror", MEMORY_PROD_DIR: "/prod-only" },
    io,
  );
  assert.equal(prodDirIgnoredForTest.dbPath, "/mirror/memory_test.db");

  const prodDirUsedForProd = resolveSeedPaths(
    ["--env", "production"],
    { MIRROR_HOME: "/mirror", MEMORY_ENV: "test", MEMORY_PROD_DIR: "/prod-only" },
    io,
  );
  assert.equal(prodDirUsedForProd.dbPath, "/prod-only/memory.db");
});

test("--env matching the ambient MEMORY_ENV (or omitted) uses the full generic chain (DB_PATH included)", () => {
  const matching = resolveSeedPaths(
    ["--env", "production"],
    { MIRROR_HOME: "/mirror", MEMORY_ENV: "production", DB_PATH: "/explicit/from/env.db" },
    io,
  );
  assert.equal(matching.dbPath, "/explicit/from/env.db");

  const omitted = resolveSeedPaths(
    [],
    { MIRROR_HOME: "/mirror", DB_PATH: "/explicit/from/env.db" },
    io,
  );
  assert.equal(omitted.dbPath, "/explicit/from/env.db");
  assert.equal(omitted.env, "production");
});

test("resolveSeedPaths throws MirrorHomeNotConfiguredError when nothing resolves", () => {
  assert.throws(() => resolveSeedPaths([], {}, io), MirrorHomeNotConfiguredError);
});
