import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  dbNameForEnv,
  MirrorHomeNotConfiguredError,
  resolveDbPath,
  resolveMirrorHome,
} from "../../src/frontDoor/dbPath.ts";

const HOME = "/home/u";
const noFs = { home: HOME, exists: () => false, warn: () => {} };

test("dbNameForEnv maps the three known environments and templates the rest", () => {
  assert.equal(dbNameForEnv("production"), "memory.db");
  assert.equal(dbNameForEnv("development"), "memory_dev.db");
  assert.equal(dbNameForEnv("test"), "memory_test.db");
  assert.equal(dbNameForEnv("staging"), "memory_staging.db");
});

test("--db-path flag wins over everything and is used as a full file path", () => {
  const path = resolveDbPath(["--db-path", "/x/copy.db"], {
    MEMORY_ENV: "development",
    DB_PATH: "/env/db.db",
    MIRROR_HOME: "/mh",
  });
  assert.equal(path, "/x/copy.db");
});

test("--mirror-home flag beats DB_PATH env and joins the env-specific name", () => {
  const path = resolveDbPath(["--mirror-home", "/mirror/u"], {
    MEMORY_ENV: "development",
    DB_PATH: "/env/db.db",
  });
  assert.equal(path, join("/mirror/u", "memory_dev.db"));
});

test("DB_PATH env beats MIRROR_HOME env, matching Python precedence", () => {
  const path = resolveDbPath([], { DB_PATH: "/env/db.db", MIRROR_HOME: "/mh" }, noFs);
  assert.equal(path, "/env/db.db");
});

test("MEMORY_PROD_DIR applies only in production", () => {
  const prod = resolveDbPath([], { MEMORY_PROD_DIR: "/prod" }, noFs);
  assert.equal(prod, join("/prod", "memory.db"));
  const dev = resolveDbPath(
    [],
    { MEMORY_ENV: "development", MEMORY_PROD_DIR: "/prod", MEMORY_DIR: "/mem" },
    noFs,
  );
  assert.equal(dev, join("/mem", "memory_dev.db"));
});

test("MEMORY_DIR joins the env-specific database name", () => {
  const path = resolveDbPath([], { MEMORY_ENV: "test", MEMORY_DIR: "/mem" }, noFs);
  assert.equal(path, join("/mem", "memory_test.db"));
});

test("MIRROR_HOME env resolves the home and joins the env name", () => {
  const path = resolveDbPath([], { MEMORY_ENV: "development", MIRROR_HOME: "/mh/u" }, noFs);
  assert.equal(path, join("/mh/u", "memory_dev.db"));
});

test("MIRROR_USER derives <home>/.mirror-minds/<user>", () => {
  const path = resolveDbPath([], { MIRROR_USER: "vini" }, { ...noFs, exists: () => true });
  assert.equal(path, join(HOME, ".mirror-minds", "vini", "memory.db"));
});

test("MIRROR_USER falls back to the legacy ~/.mirror home when only it exists", () => {
  const legacy = join(HOME, ".mirror", "vini");
  const warnings: string[] = [];
  const home = resolveMirrorHome(
    { MIRROR_USER: "vini" },
    { home: HOME, exists: (p) => p === legacy, warn: (m) => warnings.push(m) },
  );
  assert.equal(home, legacy);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /legacy mirror home/);
});

test("MIRROR_HOME + MIRROR_USER conflict raises, like Python", () => {
  assert.throws(
    () => resolveMirrorHome({ MIRROR_HOME: "/mh/other", MIRROR_USER: "vini" }, noFs),
    MirrorHomeNotConfiguredError,
  );
});

test("MIRROR_HOME + MIRROR_USER agree when the home basename equals the user", () => {
  const home = resolveMirrorHome({ MIRROR_HOME: "/mh/vini", MIRROR_USER: "vini" }, noFs);
  assert.equal(home, "/mh/vini");
});

test("nothing configured fails loudly instead of defaulting to the homes root", () => {
  assert.throws(() => resolveDbPath([], {}, noFs), MirrorHomeNotConfiguredError);
});
