// CV22.DS7.TS3 plateau 3b — `runtime diagnose`, graded against the Python
// oracle over the same fixture mirror homes the golden was generated from.
//
// Finding ORDER is part of the render, so every scenario compares the whole
// rendered diagnosis rather than a set of codes.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { checksum } from "#extensions/migrations.ts";
import {
  type DriftFinding,
  diagnoseRuntime,
  frontDoorErrorFindings,
  probeModelPins,
  ReplayModelCatalogProvider,
  renderRuntimeDiagnosis,
  rootStateFindings,
} from "#runtime/diagnose.ts";
import { buildRuntimeStatus, type RuntimeStatusReport } from "#runtime/status.ts";

const GOLDEN_PATH = new URL("../goldens/runtime-diagnose.golden.json", import.meta.url);

interface Scenario {
  findings: DriftFinding[];
  render: string;
  exit_code: number;
}

interface Golden {
  meta: { fixture_version: string; python_migration_ids: string[] };
  scenarios: Record<string, Scenario>;
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
const PYTHON_IDS = golden.meta.python_migration_ids;
const MIGRATION_SQL =
  "CREATE TABLE IF NOT EXISTS ext_demo_widget_notes (id INTEGER PRIMARY KEY);\n";
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

function createDatabase(path: string, migrationIds: string[]): void {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT)");
  const insert = db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)");
  for (const id of migrationIds) insert.run(id, "2026-09-01T12:00:00+00:00");
  db.close();
}

const FTS_ROW_COUNT = 200;
const PAGE_SIZE = 4096;

function addHealthyFts(path: string): void {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE memories (id INTEGER PRIMARY KEY, content TEXT)");
  const insert = db.prepare("INSERT INTO memories VALUES (?, ?)");
  for (let i = 1; i < FTS_ROW_COUNT; i += 1) insert.run(i, `word${i} hello world mirror`);
  db.exec(
    "CREATE VIRTUAL TABLE memories_fts USING fts5(content, content='memories', content_rowid='id')",
  );
  db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
  db.close();
}

/**
 * The generator's recipe: zero every page after the first, with plain file
 * I/O. Not SQL -- node:sqlite refuses to write FTS5 shadow tables at all
 * (`table memories_fts_data may not be modified`), so the obvious corruption
 * recipe is one this test could never rebuild. Bytes are something both cores
 * can write identically, which is what makes the scenario gradeable.
 */
function corruptFts(path: string): void {
  const size = statSync(path).size;
  const handle = openSync(path, "r+");
  try {
    writeSync(handle, Buffer.alloc(size - PAGE_SIZE), 0, size - PAGE_SIZE, PAGE_SIZE);
  } finally {
    closeSync(handle);
  }
}

function addDecoyFtsTable(path: string): void {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE memories_fts (rowid INTEGER, content TEXT)");
  db.close();
}

/** The generator's log recipe: 1h and 2h old ERRORs count; 30h old does not. */
function writeFrontDoorLog(path: string, now: Date): void {
  const stamp = (hours: number): string =>
    new Date(now.getTime() - hours * 3_600_000).toISOString();
  const lines = [
    `${stamp(1)}\tERROR\twelcome\tts\texit=1\tbackup_failed`,
    `${stamp(2)}\tERROR\tsearch\tpython\texit=2\tschema_guard`,
    `${stamp(30)}\tERROR\tsearch\tts\texit=1\told_and_outside_the_window`,
    `${stamp(0.5)}\tINFO\twelcome\tts\texit=0\t`,
    "not a log line at all",
    "garbage-timestamp\tERROR\tsearch\tts\texit=1\tunparseable",
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
}

function buildCommandSkill(root: string, id: string): string {
  const directory = join(root, id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "skill.yaml"),
    `id: ${id}\nname: ${id}\ncategory: extension\nkind: command-skill\n` +
      `summary: a fixture extension\nentrypoint:\n  module: handler\n` +
      `runtimes:\n  pi:\n    command_name: ext-${id}\n`,
  );
  writeFileSync(join(directory, "handler.py"), "# fixture\n");
  return directory;
}

interface Fixture {
  root: string;
  repo: string;
  homes: Map<string, string>;
  homesRoot: string;
  cleanup: () => void;
}

function fixture(now: Date): Fixture {
  const root = realpathSync(mkdtempSync("/tmp/runtime-diagnose-"));
  const homes = new Map<string, string>();

  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "--initial-branch=stable");
  writeFileSync(join(repo, "README.md"), "fixture\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "fixture");

  // The oracle's fixture homes are owner-only; without the same posture every
  // scenario would grow a `loose_permissions` finding the golden does not have.
  const home = (name: string, migrations?: string[]): string => {
    const path = join(root, name);
    mkdirSync(path, { recursive: true });
    chmodSync(path, 0o700);
    if (migrations !== undefined) {
      createDatabase(join(path, "memory.db"), migrations);
      chmodSync(join(path, "memory.db"), 0o600);
    }
    return path;
  };

  homes.set("clean", home("home-clean", PYTHON_IDS));

  const loose = home("home-loose-perms", PYTHON_IDS);
  chmodSync(loose, 0o755);
  chmodSync(join(loose, "memory.db"), 0o644);
  homes.set("loose_permissions", loose);

  const errors = home("home-front-door-errors", PYTHON_IDS);
  writeFrontDoorLog(join(errors, "front-door.log"), now);
  homes.set("front_door_errors", errors);

  const healthy = home("home-fts-healthy", PYTHON_IDS);
  addHealthyFts(join(healthy, "memory.db"));
  homes.set("fts_healthy", healthy);

  const decoy = home("home-fts-decoy", PYTHON_IDS);
  addDecoyFtsTable(join(decoy, "memory.db"));
  homes.set("fts_decoy_table", decoy);

  const corrupt = home("home-page-corruption", PYTHON_IDS);
  addHealthyFts(join(corrupt, "memory.db"));
  corruptFts(join(corrupt, "memory.db"));
  homes.set("database_page_corruption", corrupt);

  homes.set("database_missing", home("home-db-missing"));
  homes.set("git_dirty", home("home-git-dirty", PYTHON_IDS));
  homes.set("core_migrations_pending", home("home-core-pending", PYTHON_IDS.slice(0, 14)));
  homes.set(
    "core_migrations_unknown",
    home("home-core-unknown", [...PYTHON_IDS, "999_from_the_future"]),
  );

  const ext = home("home-ext", PYTHON_IDS);
  const broken = join(ext, "extensions", "demo-broken");
  mkdirSync(broken, { recursive: true });
  writeFileSync(
    join(broken, "skill.yaml"),
    "id: demo-broken\nname: demo\ncategory: extension\nkind: command-skill\n",
  );
  const widget = buildCommandSkill(join(ext, "extensions"), "demo-widget");
  mkdirSync(join(widget, "migrations"), { recursive: true });
  writeFileSync(
    join(widget, "migrations", "001_init.sql"),
    MIGRATION_SQL.replace("notes", "renamed"),
  );
  writeFileSync(join(widget, "migrations", "002_pending.sql"), MIGRATION_SQL);
  const extDb = new DatabaseSync(join(ext, "memory.db"));
  extDb.exec(
    "CREATE TABLE _ext_migrations (extension_id TEXT, filename TEXT, checksum TEXT, applied_at TEXT)",
  );
  const insertExt = extDb.prepare("INSERT INTO _ext_migrations VALUES (?, ?, ?, ?)");
  for (const filename of ["001_init.sql", "003_vanished.sql"]) {
    insertExt.run("demo-widget", filename, checksum(MIGRATION_SQL), "2026-09-01T12:00:00+00:00");
  }
  extDb.close();
  homes.set("extension_findings", ext);

  homes.set("root_state", home("home-root-state", PYTHON_IDS));
  const homesRoot = join(root, "homes-root");
  mkdirSync(homesRoot, { recursive: true });
  writeFileSync(join(homesRoot, "stray-notes.md"), "legacy\n");
  mkdirSync(join(homesRoot, "backups"), { recursive: true });
  mkdirSync(join(homesRoot, "some-user"), { recursive: true });
  writeFileSync(join(homesRoot, ".DS_Store"), "noise\n");

  return {
    root,
    repo,
    homes,
    homesRoot,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function reportFor(f: Fixture, home: string | null): RuntimeStatusReport {
  return buildRuntimeStatus({
    start: f.repo,
    mirrorHome: home,
    env: home === null ? { MIRROR_HOME: undefined, MIRROR_USER: undefined } : ENV,
    version: golden.meta.fixture_version,
    pythonVersion: "<python-version>",
    nodeVersion: "<node-version>",
  });
}

/** The CLI's composition: diagnose + root state + the model-pin probe. */
async function diagnoseScenario(
  f: Fixture,
  label: string,
  now: Date,
): Promise<{ render: string; findings: DriftFinding[] }> {
  const home = label === "mirror_home_missing" ? null : (f.homes.get(label) as string);
  const report = reportFor(f, home);
  const entries =
    label === "git_dirty"
      ? [
          { status: " M", path: "src/memory/cli/runtime.py" },
          { status: "??", path: "scratch.txt" },
          { status: "??", path: "pi-session-2026-09-08.html" },
        ]
      : [];
  let findings = diagnoseRuntime(report, entries, { now });
  if (label === "root_state") findings = [...findings, ...rootStateFindings(f.homesRoot)];
  // No provider: inconclusive, matching the oracle without a key.
  findings = [...findings, ...(await probeModelPins(null, "google/gemini-2.5-flash-lite"))];
  return { render: renderRuntimeDiagnosis(findings).replaceAll(f.root, "<root>"), findings };
}

test("every diagnose scenario renders exactly as the oracle renders it", async () => {
  const now = new Date();
  const f = fixture(now);
  try {
    for (const [label, scenario] of Object.entries(golden.scenarios)) {
      const actual = await diagnoseScenario(f, label, now);
      assert.equal(actual.render, scenario.render, `render mismatch in scenario ${label}`);
      assert.equal(
        actual.findings.length === 0 ? 0 : 1,
        scenario.exit_code,
        `exit code mismatch in scenario ${label}`,
      );
    }
  } finally {
    f.cleanup();
  }
});

test("the two cores describe a broken index with the same driver text", async () => {
  // This was expected to be a third recorded divergence: the finding embeds
  // the DRIVER's message and the cores link different SQLite builds. For every
  // corruption both cores can construct, they agree exactly -- so both FTS
  // scenarios are graded byte for byte by the scenario sweep above, and this
  // test pins the two messages that agreement rests on.
  const now = new Date();
  const f = fixture(now);
  try {
    const decoy = await diagnoseScenario(f, "fts_decoy_table", now);
    assert.equal(
      (decoy.findings[0] as DriftFinding).detail,
      "FTS query failed (no such column: memories_fts); the index may be corrupt or desynced",
    );

    const corrupt = await diagnoseScenario(f, "database_page_corruption", now);
    assert.equal(
      (corrupt.findings[0] as DriftFinding).detail,
      "FTS query failed (vtable constructor failed: memories_fts); " +
        "the index may be corrupt or desynced",
    );

    // The residual difference lives only where node:sqlite REFUSES to go:
    // writing an FTS5 shadow table, which is how the divergent messages
    // ("database disk image is malformed" vs "fts5: corruption found reading
    // blob N...") are produced. That refusal is a safety property, and it is
    // asserted here so a future driver change that loosens it is noticed.
    const db = new DatabaseSync(join(f.homes.get("fts_healthy") as string, "memory.db"));
    try {
      assert.throws(
        () => db.exec("DELETE FROM memories_fts_data WHERE id > 1"),
        /memories_fts_data may not be modified/,
      );
    } finally {
      db.close();
    }
  } finally {
    f.cleanup();
  }
});

test("the front-door window counts only errors inside the last 24h", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  const f = fixture(now);
  try {
    const report = reportFor(f, f.homes.get("front_door_errors") as string);
    assert.equal(frontDoorErrorFindings(report, now).length, 1);
    assert.match(
      (frontDoorErrorFindings(report, now)[0] as DriftFinding).detail,
      /^2 front-door error\(s\) in the last 24h \(/,
    );

    // Roll the clock forward past the 2h-old error: the count drops to one.
    const later = new Date(now.getTime() + 23 * 3_600_000);
    assert.match(
      (frontDoorErrorFindings(report, later)[0] as DriftFinding).detail,
      /^1 front-door error\(s\)/,
    );
    // Past all of them: the finding disappears rather than reporting zero.
    const muchLater = new Date(now.getTime() + 48 * 3_600_000);
    assert.deepEqual(frontDoorErrorFindings(report, muchLater), []);
  } finally {
    f.cleanup();
  }
});

test("the model-pin probe warns only on a confirmed-missing pin", async () => {
  // No provider and a failing provider are both INCONCLUSIVE: diagnose stays
  // green offline, which is the whole reason the oracle swallows every error.
  assert.deepEqual(await probeModelPins(null, "google/gemini-2.5-flash-lite"), []);
  const failing = {
    listAvailableModels: () => Promise.reject(new Error("offline")),
  };
  assert.deepEqual(await probeModelPins(failing, "google/gemini-2.5-flash-lite"), []);

  // A catalog that HAS the pin is silent...
  const present = new ReplayModelCatalogProvider(["google/gemini-2.5-flash-lite", "other/model"]);
  assert.deepEqual(await probeModelPins(present, "google/gemini-2.5-flash-lite"), []);

  // ...and only a catalog that answers WITHOUT it warns.
  const absent = new ReplayModelCatalogProvider(["other/model"]);
  const findings = await probeModelPins(absent, "google/gemini-2.5-flash-lite");
  assert.equal(findings.length, 1);
  assert.equal((findings[0] as DriftFinding).code, "model_pin_unresolved");
  assert.equal(
    (findings[0] as DriftFinding).detail,
    "google/gemini-2.5-flash-lite is not available on OpenRouter",
  );
});

test("the homes root tolerates user homes and dotfiles, and only those", () => {
  const now = new Date();
  const f = fixture(now);
  try {
    const findings = rootStateFindings(f.homesRoot);
    assert.deepEqual(
      findings.map((finding) => finding.detail.replaceAll(f.root, "<root>")),
      ["<root>/homes-root/backups", "<root>/homes-root/stray-notes.md"],
    );
  } finally {
    f.cleanup();
  }
});
