// CV22.DS7.TS3 plateau 3a — `runtime status`, graded against the Python
// oracle over the same fixture mirror homes the golden was generated from.
//
// The fixture recipe is rebuilt here rather than committed: the homes are a
// handful of files and one SQLite ledger each, and rebuilding them means a
// drift in either core's recipe fails loudly instead of grading a stale
// artifact. `meta.checksums` cross-checks that both cores normalise SQL to the
// same hash, which is what makes the extension health rows comparable at all.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { checksum } from "#extensions/migrations.ts";
import {
  buildRuntimeStatus,
  detectNodeVersion,
  detectPythonVersion,
  renderRuntimeStatus,
  statusVerdict,
} from "#runtime/status.ts";

const GOLDEN_PATH = new URL("../goldens/runtime-status.golden.json", import.meta.url);

interface Scenario {
  report: Record<string, unknown>;
  status: string;
  render: string;
}

interface Golden {
  meta: {
    fixture_version: string;
    python_migration_ids: string[];
    ts_authored_migration_id: string;
    checksums: { canonical: string; reformatted: string; bom: string };
  };
  scenarios: Record<string, Scenario>;
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
const PYTHON_IDS = golden.meta.python_migration_ids;
const TS_AUTHORED_ID = golden.meta.ts_authored_migration_id;

const MIGRATION_SQL =
  "CREATE TABLE IF NOT EXISTS ext_demo_widget_notes (id INTEGER PRIMARY KEY);\n";
const MIGRATION_SQL_REFORMATTED =
  "-- a comment the checksum ignores\nCREATE TABLE IF NOT EXISTS ext_demo_widget_notes\n" +
  "  (\n    id INTEGER PRIMARY KEY\n  ) ;\n";
const MIGRATION_SQL_BOM = `\ufeff${MIGRATION_SQL}`;

// The status report reads these from the environment; the golden was generated
// with them cleared, so the test passes the documented defaults explicitly
// rather than inheriting the developer's shell.
const ENV = { MEMORY_ENV: undefined } as NodeJS.ProcessEnv;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Mirror Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Mirror Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_AUTHOR_DATE: "2026-09-01T12:00:00+00:00",
  GIT_COMMITTER_DATE: "2026-09-01T12:00:00+00:00",
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
}

function createDatabase(path: string, migrationIds: string[], ledger = true): void {
  const db = new DatabaseSync(path);
  if (ledger) {
    db.exec("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT)");
    const insert = db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)");
    for (const id of migrationIds) insert.run(id, "2026-09-01T12:00:00+00:00");
  } else {
    db.exec("CREATE TABLE placeholder (id INTEGER PRIMARY KEY)");
  }
  db.close();
}

function addExtLedger(path: string, rows: [string, string, string][]): void {
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE _ext_migrations (extension_id TEXT, filename TEXT, checksum TEXT, applied_at TEXT)",
  );
  const insert = db.prepare(
    "INSERT INTO _ext_migrations (extension_id, filename, checksum, applied_at) VALUES (?, ?, ?, ?)",
  );
  for (const [extensionId, filename, sum] of rows) {
    insert.run(extensionId, filename, sum, "2026-09-01T12:00:00+00:00");
  }
  db.close();
}

function writeManifest(directory: string, body: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "skill.yaml"), body);
}

function commandSkillManifest(id: string): string {
  return (
    `id: ${id}\nname: ${id}\ncategory: extension\nkind: command-skill\n` +
    `summary: a fixture extension\nentrypoint:\n  module: handler\n` +
    `runtimes:\n  pi:\n    command_name: ext-${id}\n`
  );
}

function promptSkillManifest(id: string): string {
  return (
    `id: ${id}\nname: ${id}\ncategory: extension\nkind: prompt-skill\n` +
    `summary: a fixture extension\nruntimes:\n  pi:\n    command_name: ext-${id}\n` +
    `    skill_file: SKILL.md\n`
  );
}

function buildCommandSkill(root: string, id: string): string {
  const directory = join(root, id);
  writeManifest(directory, commandSkillManifest(id));
  writeFileSync(join(directory, "handler.py"), "# fixture\n");
  return directory;
}

function migrationsDir(extensionDir: string): string {
  const dir = join(extensionDir, "migrations");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const INVALID_MANIFESTS: Record<string, string> = {
  missing_field: "id: demo\nname: demo\ncategory: extension\nkind: command-skill\n",
  empty_runtimes:
    "id: demo\nname: demo\ncategory: extension\nkind: command-skill\nsummary: s\nruntimes: {}\n",
  bad_skill_id:
    "id: Demo_Widget\nname: demo\ncategory: extension\nkind: command-skill\n" +
    "summary: s\nruntimes:\n  pi:\n    command_name: ext-demo\n",
  bad_category:
    "id: demo\nname: demo\ncategory: core\nkind: command-skill\n" +
    "summary: s\nruntimes:\n  pi:\n    command_name: ext-demo\n",
  bad_kind:
    "id: demo\nname: demo\ncategory: extension\nkind: wizard\n" +
    "summary: s\nruntimes:\n  pi:\n    command_name: ext-demo\n",
  missing_entrypoint:
    "id: demo\nname: demo\ncategory: extension\nkind: command-skill\n" +
    "summary: s\nruntimes:\n  pi:\n    command_name: ext-demo\n",
  bad_command_prefix:
    "id: demo\nname: demo\ncategory: extension\nkind: prompt-skill\n" +
    "summary: s\nruntimes:\n  pi:\n    command_name: demo\n    skill_file: SKILL.md\n",
  not_a_mapping: "- just\n- a\n- list\n",
};

interface Fixture {
  root: string;
  repo: string;
  homes: Map<string, string>;
  cleanup: () => void;
}

/** The golden's fixture recipe, rebuilt locally. */
function fixture(): Fixture {
  // realpath: on macOS /tmp is a symlink to /private/tmp, and both cores
  // resolve the mirror home, so the placeholder must match the resolved form.
  const root = realpathSync(mkdtempSync("/tmp/runtime-status-"));
  const homes = new Map<string, string>();

  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "--initial-branch=stable");
  writeFileSync(join(repo, "README.md"), "fixture\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "fixture");

  const home = (name: string): string => {
    const path = join(root, name);
    mkdirSync(path, { recursive: true });
    return path;
  };

  homes.set("db_missing", home("home-db-missing"));

  let current = home("home-ledger-missing");
  createDatabase(join(current, "memory.db"), [], false);
  homes.set("ledger_missing", current);

  current = home("home-python-current");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  homes.set("python_current", current);

  current = home("home-ts-migrated");
  createDatabase(join(current, "memory.db"), [...PYTHON_IDS, TS_AUTHORED_ID]);
  homes.set("ts_migrated", current);

  current = home("home-migrations-missing");
  createDatabase(join(current, "memory.db"), PYTHON_IDS.slice(0, 10));
  homes.set("migrations_missing", current);

  current = home("home-unknown-migration");
  createDatabase(join(current, "memory.db"), [...PYTHON_IDS, "999_from_the_future"]);
  homes.set("unknown_migration", current);

  current = home("home-ext-clean");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  const extensions = join(current, "extensions");
  writeFileSync(
    join(migrationsDir(buildCommandSkill(extensions, "demo-widget")), "001_init.sql"),
    MIGRATION_SQL,
  );
  writeFileSync(
    join(migrationsDir(buildCommandSkill(extensions, "demo-reformat")), "001_init.sql"),
    MIGRATION_SQL_REFORMATTED,
  );
  writeFileSync(
    join(migrationsDir(buildCommandSkill(extensions, "demo-bom")), "001_init.sql"),
    MIGRATION_SQL_BOM,
  );
  writeManifest(join(extensions, "demo-prompt"), promptSkillManifest("demo-prompt"));
  writeFileSync(join(extensions, "demo-prompt", "SKILL.md"), "# fixture\n");
  addExtLedger(join(current, "memory.db"), [
    ["demo-widget", "001_init.sql", checksum(MIGRATION_SQL)],
    ["demo-reformat", "001_init.sql", checksum(MIGRATION_SQL)],
    ["demo-bom", "001_init.sql", checksum(MIGRATION_SQL_BOM)],
  ]);
  homes.set("ext_clean", current);

  current = home("home-ext-pending");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  let dir = migrationsDir(buildCommandSkill(join(current, "extensions"), "demo-widget"));
  writeFileSync(join(dir, "001_init.sql"), MIGRATION_SQL);
  writeFileSync(join(dir, "002_more.sql"), MIGRATION_SQL);
  addExtLedger(join(current, "memory.db"), [
    ["demo-widget", "001_init.sql", checksum(MIGRATION_SQL)],
  ]);
  homes.set("ext_pending", current);

  current = home("home-ext-drift");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  dir = migrationsDir(buildCommandSkill(join(current, "extensions"), "demo-widget"));
  writeFileSync(join(dir, "001_init.sql"), MIGRATION_SQL.replace("notes", "renamed"));
  addExtLedger(join(current, "memory.db"), [
    ["demo-widget", "001_init.sql", checksum(MIGRATION_SQL)],
  ]);
  homes.set("ext_drift", current);

  current = home("home-ext-unknown-applied");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  dir = migrationsDir(buildCommandSkill(join(current, "extensions"), "demo-widget"));
  writeFileSync(join(dir, "001_init.sql"), MIGRATION_SQL);
  addExtLedger(join(current, "memory.db"), [
    ["demo-widget", "001_init.sql", checksum(MIGRATION_SQL)],
    ["demo-widget", "002_vanished.sql", checksum(MIGRATION_SQL)],
  ]);
  homes.set("ext_unknown_applied", current);

  current = home("home-ext-ledger-missing");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  dir = migrationsDir(buildCommandSkill(join(current, "extensions"), "demo-widget"));
  writeFileSync(join(dir, "001_init.sql"), MIGRATION_SQL);
  homes.set("ext_ledger_missing", current);

  current = home("home-ext-no-migrations");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  buildCommandSkill(join(current, "extensions"), "demo-widget");
  homes.set("ext_no_migrations", current);

  current = home("home-ext-bad-filename");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  dir = migrationsDir(buildCommandSkill(join(current, "extensions"), "demo-widget"));
  writeFileSync(join(dir, "1_init.sql"), MIGRATION_SQL);
  addExtLedger(join(current, "memory.db"), []);
  homes.set("ext_bad_filename", current);

  current = home("home-ext-db-missing");
  buildCommandSkill(join(current, "extensions"), "demo-widget");
  homes.set("ext_database_unavailable", current);

  for (const [label, body] of Object.entries(INVALID_MANIFESTS)) {
    current = home(`home-manifest-${label.replaceAll("_", "-")}`);
    createDatabase(join(current, "memory.db"), PYTHON_IDS);
    writeManifest(join(current, "extensions", "demo-widget"), body);
    homes.set(`manifest_${label}`, current);
  }

  current = home("home-manifest-prefix-mismatch");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  const mismatch = buildCommandSkill(join(current, "extensions"), "demo-widget");
  writeManifest(mismatch, `${commandSkillManifest("demo-widget")}table_prefix: ext_wrong_\n`);
  homes.set("manifest_table_prefix_mismatch", current);

  current = home("home-manifest-module-missing");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  writeManifest(join(current, "extensions", "demo-widget"), commandSkillManifest("demo-widget"));
  homes.set("manifest_entrypoint_module_missing", current);

  current = home("home-manifest-skill-file-missing");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  writeManifest(join(current, "extensions", "demo-widget"), promptSkillManifest("demo-widget"));
  homes.set("manifest_skill_file_missing", current);

  current = home("home-manifest-bad-yaml");
  createDatabase(join(current, "memory.db"), PYTHON_IDS);
  writeManifest(join(current, "extensions", "demo-widget"), "id: demo\n  bad: [unclosed\n");
  homes.set("manifest_bad_yaml", current);

  return { root, repo, homes, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Render a scenario with the ambient values pinned exactly as the golden pins them. */
function renderScenario(f: Fixture, home: string | null): { render: string; verdict: string } {
  const report = buildRuntimeStatus({
    start: f.repo,
    mirrorHome: home,
    env: ENV,
    version: golden.meta.fixture_version,
    pythonVersion: "<python-version>",
    nodeVersion: "<node-version>",
  });
  return {
    render: renderRuntimeStatus(report, ENV).replaceAll(f.root, "<root>"),
    verdict: statusVerdict(report),
  };
}

test("SQL normalisation agrees with the oracle on every corpus checksum", () => {
  assert.equal(checksum(MIGRATION_SQL), golden.meta.checksums.canonical);
  // Comments and reformatting are invisible to the checksum...
  assert.equal(checksum(MIGRATION_SQL_REFORMATTED), golden.meta.checksums.reformatted);
  assert.equal(checksum(MIGRATION_SQL_REFORMATTED), golden.meta.checksums.canonical);
  // ...but a BOM is NOT whitespace to Python, so it must survive normalisation
  // here too. A JavaScript `\s` would collapse it and change the hash.
  assert.equal(checksum(MIGRATION_SQL_BOM), golden.meta.checksums.bom);
  assert.notEqual(checksum(MIGRATION_SQL_BOM), checksum(MIGRATION_SQL));
});

test("every status scenario renders exactly as the oracle renders it", () => {
  const f = fixture();
  try {
    const divergent = new Set(["ts_migrated", "manifest_bad_yaml"]);
    for (const [label, scenario] of Object.entries(golden.scenarios)) {
      if (divergent.has(label) || label === "home_not_configured") continue;
      const home = f.homes.get(label);
      assert.ok(home !== undefined, `fixture missing a home for scenario ${label}`);
      const actual = renderScenario(f, home);
      assert.equal(actual.render, scenario.render, `render mismatch in scenario ${label}`);
      assert.equal(actual.verdict, scenario.status, `verdict mismatch in scenario ${label}`);
    }
  } finally {
    f.cleanup();
  }
});

test("a TS-migrated database is clean here and a false alarm to the oracle", () => {
  const f = fixture();
  try {
    const home = f.homes.get("ts_migrated") as string;
    const actual = renderScenario(f, home);
    const oracle = golden.scenarios.ts_migrated as Scenario;

    // The oracle's recorded answer: 017 is unknown, so the install is told it
    // needs attention. That is the defect this story removes.
    assert.match(
      oracle.render,
      /Core migrations: attention needed \(16\/16 applied; unknown 017_journey_parent_column\)/,
    );
    assert.equal(oracle.status, "attention needed");

    // TypeScript owns the schema since DS6, so 017 is known, not unknown.
    assert.match(actual.render, /Core migrations: current \(17\/17\)/);
    assert.equal(actual.verdict, "ready");

    // The divergence must be EXACTLY those two lines. Every other line of the
    // render still has to match, or something else drifted under cover of the
    // intended difference.
    const expected = oracle.render
      .replace(
        "Core migrations: attention needed (16/16 applied; unknown 017_journey_parent_column)",
        "Core migrations: current (17/17)",
      )
      .replace("Status: attention needed", "Status: ready");
    assert.equal(actual.render, expected);
  } finally {
    f.cleanup();
  }
});

test("a database missing only the TS-authored migration matches the oracle exactly", () => {
  // The mirror image of the scenario above, and the reason `known_count`
  // counts what THIS database requires: a database Python calls current must
  // not be downgraded to `16/17 applied; missing 017...` by the TS grader.
  const f = fixture();
  try {
    const actual = renderScenario(f, f.homes.get("python_current") as string);
    assert.match(actual.render, /Core migrations: current \(16\/16\)/);
    assert.equal(actual.verdict, "ready");
  } finally {
    f.cleanup();
  }
});

test("D1: the malformed-manifest note matches the oracle up to the parser's own text", () => {
  const f = fixture();
  try {
    const actual = renderScenario(f, f.homes.get("manifest_bad_yaml") as string);
    const oracle = (golden.scenarios.manifest_bad_yaml as Scenario).render;

    const noteLine = (render: string): string => {
      const found = render.split("\n").find((entry) => entry.includes("invalid YAML in"));
      assert.ok(found !== undefined, "expected an invalid-YAML health note");
      return found;
    };
    // Everything Mirror writes, up to and including the manifest path and the
    // separator. Only the parser's own explanation follows.
    const stableHead = (entry: string): string => {
      const end = entry.indexOf(".yaml: ");
      assert.notEqual(end, -1, "expected the note to name the manifest path");
      return entry.slice(0, end + ".yaml: ".length);
    };

    const actualLine = noteLine(actual.render);
    const oracleLine = noteLine(oracle);

    // Mirror's own wording and the manifest path are byte-identical...
    assert.equal(stableHead(actualLine), stableHead(oracleLine));
    assert.match(
      stableHead(actualLine),
      /^ {2}- demo-widget: invalid YAML in <root>\/.*\/skill\.yaml: $/,
    );
    // ...and only the parser's trailing explanation differs, which is all of D1.
    assert.notEqual(actualLine, oracleLine);
    assert.ok(oracleLine.endsWith("mapping values are not allowed here"));
    assert.equal(actual.verdict, "attention needed");
  } finally {
    f.cleanup();
  }
});

test("an unconfigured mirror home reports the oracle's sentence", () => {
  const f = fixture();
  try {
    const report = buildRuntimeStatus({
      start: f.repo,
      env: { MEMORY_ENV: undefined, MIRROR_HOME: undefined, MIRROR_USER: undefined },
      version: golden.meta.fixture_version,
      pythonVersion: "<python-version>",
      nodeVersion: "<node-version>",
    });
    const render = renderRuntimeStatus(report, ENV).replaceAll(f.root, "<root>");
    assert.equal(render, (golden.scenarios.home_not_configured as Scenario).render);
  } finally {
    f.cleanup();
  }
});

test("the runtime versions are read, not spawned, where that is possible", () => {
  // Node: the front door IS the runtime the line diagnoses, so it is read from
  // the process with no spawn at all.
  assert.equal(detectNodeVersion(), process.version.replace(/^v/, ""));

  // Python: no interpreter in process, so the front door's own fallback is
  // asked. Bounded, off the per-turn path, and gone with Python in DS10.
  const version = detectPythonVersion(process.cwd());
  assert.match(version, /^(?:\d+\.\d+\.\d+.*|unknown)$/);
});
