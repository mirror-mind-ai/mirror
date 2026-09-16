// CV22.DS7.TS4 plateau 3 — bindings and the migration runner's write half.
//
// The corpus replays Python's recorded `ext <id> bind|unbind|bindings|migrate`
// invocations and compares TWO things after every step: the streams and exit
// code, and the ROWS left in `_ext_bindings` / `_ext_migrations` plus the
// extension tables that exist. A command that prints the right line and writes
// the wrong row is the defect this corpus exists to catch.
//
// Timestamps are tokenised here and graded as a SHAPE; their bytes belong to
// the write probe, which runs with a frozen clock.

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { pythonUtcIsoformat } from "#extensions/bindings.ts";
import { type ExtWriteContext, runExtCommand } from "#extensions/catalogCommands.ts";
import { isExtensionDispatch } from "#extensions/dispatch.ts";

interface GoldenCase {
  label: string;
  scenario: string;
  argv: string[];
  stdout: string;
  stderr: string;
  exit_code: number;
  bindings: Array<Record<string, string | null>>;
  migrations: Array<Record<string, string>>;
  tables: string[];
}

const golden = JSON.parse(
  readFileSync(new URL("../fixtures/ext-bindings.golden.json", import.meta.url), "utf8"),
) as { timestamp_token: string; extension_id: string; steps: string[]; cases: GoldenCase[] };

const FIXTURES = new URL("../fixtures/ext-bindings", import.meta.url).pathname;
const TOKEN = golden.timestamp_token;
const ISO_UTC = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+00:00/g;

interface World {
  root: string;
  home: string;
  db: WritableDatabase;
}

function makeWorld(scenario: string): World {
  const root = mkdtempSync(join(tmpdir(), "ext-bindings-"));
  const home = join(root, "home");
  mkdirSync(join(home, "extensions", golden.extension_id), { recursive: true });
  cpSync(join(FIXTURES, scenario), join(home, "extensions", golden.extension_id, "migrations"), {
    recursive: true,
  });
  const db = bootstrapDatabase(join(home, "memory_test.db"));
  return { root, home, db };
}

function closeWorld(world: World): void {
  world.db.close();
  rmSync(world.root, { recursive: true, force: true });
}

function contextFor(world: World): ExtWriteContext {
  return { mirrorHome: world.home, db: world.db, deps: { nowIso: () => pythonUtcIsoformat() } };
}

function stateOf(world: World) {
  const bindings = world.db
    .prepare(
      "SELECT extension_id, capability_id, target_kind, target_id, created_at " +
        "FROM _ext_bindings ORDER BY capability_id, target_kind, COALESCE(target_id, ''), created_at",
    )
    .all()
    .map((row) => ({
      extension_id: String(row.extension_id),
      capability_id: String(row.capability_id),
      target_kind: String(row.target_kind),
      target_id: row.target_id === null ? null : String(row.target_id),
      created_at: TOKEN,
    }));
  const migrations = world.db
    .prepare(
      "SELECT extension_id, filename, checksum, applied_at FROM _ext_migrations ORDER BY filename",
    )
    .all()
    .map((row) => ({
      extension_id: String(row.extension_id),
      filename: String(row.filename),
      checksum: String(row.checksum),
      applied_at: TOKEN,
    }));
  const tables = world.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ext_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
  return { bindings, migrations, tables };
}

function invoke(world: World, argv: readonly string[]) {
  const result = runExtCommand(contextFor(world), argv);
  if (isExtensionDispatch(result)) {
    // The built-in verbs never load extension code. A dispatch decision here
    // would mean `bind` or `migrate` had started executing an extension.
    throw new Error(`bindings golden reached the dispatch path: ${argv.join(" ")}`);
  }
  return {
    ...result,
    stdout: result.stdout.split(world.home).join("<HOME>").replace(ISO_UTC, TOKEN),
    stderr: result.stderr.split(world.home).join("<HOME>").replace(ISO_UTC, TOKEN),
  };
}

function compare(
  actual: ReturnType<typeof invoke>,
  state: ReturnType<typeof stateOf>,
  recorded: GoldenCase,
): void {
  if (recorded.stdout.includes("failed to apply:")) {
    // RECORDED DIVERGENCE: the tail of this message is the SQLite driver's own
    // sentence, and `node:sqlite` does not word it as CPython's sqlite3 does.
    // The graded contract is the prefix, the exit code, and the rollback.
    assert.match(actual.stdout, /failed to apply:/, recorded.label);
    assert.ok(actual.stdout.startsWith(recorded.stdout.split("failed to apply:")[0] as string));
  } else {
    assert.equal(actual.stdout, recorded.stdout, recorded.label);
  }
  assert.equal(actual.stderr, recorded.stderr, `${recorded.label} (stderr)`);
  assert.equal(actual.exitCode, recorded.exit_code, `${recorded.label} (exit)`);
  assert.deepEqual(state.bindings, recorded.bindings, `${recorded.label} (bindings)`);
  assert.deepEqual(state.migrations, recorded.migrations, `${recorded.label} (migrations)`);
  assert.deepEqual(state.tables, recorded.tables, `${recorded.label} (tables)`);
}

test("the ordered binding + migration sequence matches Python at every step", () => {
  const byLabel = new Map(golden.cases.map((recorded) => [recorded.label, recorded]));
  const world = makeWorld("happy");
  try {
    for (const label of golden.steps) {
      const recorded = byLabel.get(label);
      assert.ok(recorded, `missing case: ${label}`);
      compare(invoke(world, recorded.argv), stateOf(world), recorded);
    }
  } finally {
    closeWorld(world);
  }
});

test("each migration scenario matches Python, rollback and bookkeeping included", () => {
  for (const label of [
    "migrate_prefix_violation",
    "migrate_invalid_filename",
    "migrate_failing_sql_rolls_back",
  ]) {
    const recorded = golden.cases.find((entry) => entry.label === label);
    assert.ok(recorded, `missing case: ${label}`);
    const world = makeWorld(recorded.scenario);
    try {
      compare(invoke(world, recorded.argv), stateOf(world), recorded);
    } finally {
      closeWorld(world);
    }
  }
});

test("an applied migration is pinned by checksum: drift refused, comments tolerated", () => {
  const drift = golden.cases.find((entry) => entry.label === "migrate_drifted_file");
  const tolerated = golden.cases.find(
    (entry) => entry.label === "migrate_tolerates_comment_and_whitespace_edit",
  );
  assert.ok(drift && tolerated);

  const driftWorld = makeWorld("drift");
  try {
    invoke(driftWorld, [golden.extension_id, "migrate"]);
    const path = join(
      driftWorld.home,
      "extensions",
      golden.extension_id,
      "migrations",
      "001_initial.sql",
    );
    writeFileSync(path, readFileSync(path, "utf8").replace("'alpha'", "'beta'"), "utf8");
    compare(invoke(driftWorld, drift.argv), stateOf(driftWorld), drift);
  } finally {
    closeWorld(driftWorld);
  }

  const toleratedWorld = makeWorld("happy");
  try {
    invoke(toleratedWorld, [golden.extension_id, "migrate"]);
    const path = join(
      toleratedWorld.home,
      "extensions",
      golden.extension_id,
      "migrations",
      "001_initial.sql",
    );
    writeFileSync(
      path,
      `-- a new comment line\n${readFileSync(path, "utf8").replaceAll("\n", "\n\n")}`,
      "utf8",
    );
    compare(invoke(toleratedWorld, tolerated.argv), stateOf(toleratedWorld), tolerated);
  } finally {
    closeWorld(toleratedWorld);
  }
});

test("the corpus grades what reading the runner would not give", () => {
  const at = (label: string): GoldenCase => {
    const recorded = golden.cases.find((entry) => entry.label === label);
    assert.ok(recorded, `missing case: ${label}`);
    return recorded;
  };

  // A --global bind is NOT idempotent and a persona bind is: `_ext_bindings`'s
  // primary key includes a nullable `target_id`, and SQLite does not consider
  // two NULLs equal, so INSERT OR IGNORE ignores nothing.
  assert.equal(at("bind_persona").bindings.length, 1);
  assert.equal(at("bind_persona_again_is_idempotent").bindings.length, 1);
  assert.equal(at("bind_global").bindings.length, 3);
  assert.equal(at("bind_global_again_duplicates").bindings.length, 4);
  // ...and one unbind removes every duplicate, because `target_id IS ?` matches
  // them all at once.
  assert.equal(at("unbind_global_removes_every_duplicate").bindings.length, 1);

  // `--help` on a built-in verb describes and never executes: the migration
  // stays unapplied and no binding appears.
  assert.equal(at("migrate_help_describes_and_does_not_apply").migrations.length, 0);
  assert.equal(at("bind_help_describes_and_does_not_write").bindings.length, 1);

  // A failing statement rolls the WHOLE file back -- table and bookkeeping row.
  assert.deepEqual(at("migrate_failing_sql_rolls_back").tables, []);
  assert.equal(at("migrate_failing_sql_rolls_back").migrations.length, 0);

  // The prefix guard reads the statement, not the comment: the block comment in
  // the happy fixture names `memories` and `conversations`, and the violation
  // reported for the other fixture is the real statement's table.
  assert.match(at("migrate_prefix_violation").stdout, /targets table 'memories_shadow'/);
  assert.equal(at("migrate_applies_pending").exit_code, 0);

  // Timestamps are Python's `isoformat()`, not the `Z` spelling used elsewhere.
  assert.match(pythonUtcIsoformat(new Date("2026-01-01T00:00:00.123Z")), /\.123000\+00:00$/);
});
