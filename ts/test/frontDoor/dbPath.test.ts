import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  dbNameForEnv,
  homeNotConfiguredMessage,
  MirrorHomeNotConfiguredError,
  resolveDbPath,
  resolveMirrorHome,
} from "#frontDoor/dbPath.ts";
import type { FoundHome } from "#frontDoor/mirrorHomes.ts";
import { tempDir } from "#helpers/tempDir.ts";

const HOME = "/home/u";
// `homes` too: no test may read whatever lives under a real /home/u.
const noFs = { home: HOME, exists: () => false, warn: () => {}, homes: () => [] };

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

// --- CR185: the not-configured sentence says what to run, and which file it writes ---

const CONFIG = join(HOME, ".config", "mirror", "env");
const ROOT = join(HOME, ".mirror-minds");

/** The message `resolveMirrorHome` raises with nothing configured and these homes found. */
function notConfigured(homes: FoundHome[], env: Record<string, string> = {}): string {
  try {
    resolveMirrorHome(env, { ...noFs, homes: () => homes });
  } catch (error) {
    assert.ok(error instanceof MirrorHomeNotConfiguredError);
    return error.message;
  }
  assert.fail("expected MirrorHomeNotConfiguredError");
}

function found(name: string, nameable = true): FoundHome {
  return { name, path: join(ROOT, name), nameable };
}

test("with no home anywhere, the sentence says how to create one and which file init writes", () => {
  assert.equal(
    notConfigured([]),
    "Mirror home is not configured. " +
      `To create one, run: mirror init <your-name> (it writes MIRROR_USER=<your-name> to ${CONFIG}). ` +
      `If yours lives elsewhere, add MIRROR_HOME=<path> to ${CONFIG}.`,
  );
});

test("the file named is the one this install reads, XDG_CONFIG_HOME included", () => {
  const message = notConfigured([], { XDG_CONFIG_HOME: "/xdg" });
  assert.ok(message.includes(`to ${join("/xdg", "mirror", "env")}`), message);
  assert.ok(!message.includes(CONFIG), message);
});

test("with one home init can name, the sentence is the command that finishes the job", () => {
  // Leandro's case on PR #42: a home from his clone, a package with no config.
  assert.equal(
    notConfigured([found("leandro")]),
    "Mirror home is not configured. " +
      `To use the home at ${join(ROOT, "leandro")}, run: mirror init leandro ` +
      `(it writes MIRROR_USER=leandro to ${CONFIG}).`,
  );
});

test("with several homes, the sentence lists their names and takes one", () => {
  assert.equal(
    notConfigured([found("a-home"), found("b-home")]),
    "Mirror home is not configured. " +
      `To use one of the homes in ${ROOT} (a-home, b-home), run: mirror init <name> ` +
      `(it writes MIRROR_USER=<name> to ${CONFIG}).`,
  );
});

test("a home whose name init would refuse is offered MIRROR_HOME, its path as a repr", () => {
  const path = join(ROOT, "Old Home");
  assert.equal(
    notConfigured([found("Old Home", false)]),
    `Mirror home is not configured. To use the home at '${path}', add MIRROR_HOME='${path}' to ${CONFIG}.`,
  );
  // Beside a home init can name, both sentences: the command first.
  const both = notConfigured([found("Old Home", false), found("leandro")]);
  assert.ok(both.indexOf("run: mirror init leandro") < both.indexOf("add MIRROR_HOME="), both);
});

test("a directory name cannot break the line or carry an escape sequence into a terminal", () => {
  // The names come from the filesystem; the message reaches terminals and, through
  // `mirror mcp`'s stderr, a client's log. Only a name init accepts is printed bare.
  const message = notConfigured([found("evil\u001b[31m\nnext", false)]);
  assert.ok(!message.includes("\n"), message);
  assert.ok(!message.includes("\u001b"), message);
  assert.ok(message.includes("\\x1b[31m\\nnext"), message);
});

test("every variant is one line, and keeps the sentence its readers test for", () => {
  for (const homes of [[], [found("a")], [found("a"), found("b")], [found("Z z", false)]]) {
    const message = notConfigured(homes);
    assert.ok(!message.includes("\n"), message);
    assert.ok(message.startsWith("Mirror home is not configured. "), message);
    assert.ok(!message.includes("MEMORY_DIR"), message);
  }
});

test("the homes are read from the real homes root when no lister is injected", () => {
  const home = tempDir("dbpath-not-configured-");
  mkdirSync(join(home, ".mirror-minds", "leandro", "identity"), { recursive: true });
  writeFileSync(join(home, ".mirror-minds", "leandro", "identity", "soul.yaml"), "soul\n");
  const message = homeNotConfiguredMessage({}, { home });
  assert.ok(message.includes("run: mirror init leandro"), message);
  assert.ok(message.includes(join(home, ".config", "mirror", "env")), message);
});
