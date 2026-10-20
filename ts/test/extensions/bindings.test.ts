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
  // CR149: `bind` checks what it binds. The golden was recorded against a
  // world with no manifest and no identity; its bytes are unchanged, the
  // world now holds what the checks need -- the manifest declaring `context`
  // and `briefing`, and the persona and journey the cases bind to.
  writeFileSync(
    join(home, "extensions", golden.extension_id, "skill.yaml"),
    `id: ${golden.extension_id}\nname: Beta\ncategory: extension\nkind: command-skill\n` +
      "summary: bindings golden fixture\nruntimes:\n  pi:\n    command_name: ext-beta\n" +
      "    skill_file: SKILL.md\nmirror_context_providers:\n" +
      "  - id: context\n    description: fixture\n" +
      "  - id: briefing\n    description: fixture\n",
  );
  writeFileSync(join(home, "extensions", golden.extension_id, "SKILL.md"), "# Beta\n");
  seedIdentity(db, "persona", "engineer");
  seedIdentity(db, "journey", "mirror-ts-core");
  return { root, home, db };
}

function seedIdentity(db: WritableDatabase, layer: string, key: string): void {
  db.prepare(
    "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, '1.0.0', 't', 't')",
  ).run(`${layer}-${key}`, layer, key, `# ${key}\n`);
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

// ---------------------------------------------------------------------------
// CR149 — `bind` checks what it binds. Every refusal: one line on stdout, exit
// 1, nothing on stderr, and `_ext_bindings` exactly as it was.

function refusal(world: World, argv: readonly string[], line: string): void {
  const before = stateOf(world).bindings;
  const answer = invoke(world, argv);
  assert.equal(answer.stdout, `${line}\n`, argv.join(" "));
  assert.equal(answer.stderr, "", argv.join(" "));
  assert.equal(answer.exitCode, 1, argv.join(" "));
  assert.deepEqual(stateOf(world).bindings, before, `${argv.join(" ")}: a row was written`);
}

test("bind refuses an id that is not an extension id, before any path is built", () => {
  const world = makeWorld("happy");
  try {
    // `<home>/x/skill.yaml` with `id: x` is exactly what would let `../x`
    // through an existence check on an unnormalized path.
    mkdirSync(join(world.home, "x"));
    writeFileSync(join(world.home, "x", "skill.yaml"), "id: x\n");
    for (const id of ["../x", "/etc", "Beta", "a--b", ""]) {
      refusal(
        world,
        [id, "bind", "context", "--persona", "engineer"],
        `'${id}' is not a valid extension id`,
      );
    }
  } finally {
    closeWorld(world);
  }
});

test("bind refuses an extension that is not installed, in the family's own words", () => {
  const world = makeWorld("happy");
  try {
    refusal(
      world,
      ["ghost", "bind", "context", "--persona", "engineer"],
      // `invoke` masks the home as `<HOME>`, as the golden does.
      "extension not installed: <HOME>/extensions/ghost",
    );
  } finally {
    closeWorld(world);
  }
});

test("bind refuses a capability the manifest does not declare, and names the ones it does", () => {
  const world = makeWorld("happy");
  try {
    refusal(
      world,
      ["beta", "bind", "nonsense", "--persona", "engineer"],
      "extension/beta declares no capability 'nonsense' (declared: context, briefing)",
    );
    // The capability is judged before the target: `--global` has no target
    // to check, and still does not bind what is not declared.
    refusal(
      world,
      ["beta", "bind", "nonsense", "--global"],
      "extension/beta declares no capability 'nonsense' (declared: context, briefing)",
    );
    // A manifest with no providers at all -- a prompt-skill, for one.
    writeFileSync(
      join(world.home, "extensions", "beta", "skill.yaml"),
      "id: beta\nname: Beta\ncategory: extension\nkind: command-skill\nsummary: s\n" +
        "runtimes:\n  pi:\n    command_name: ext-beta\n    skill_file: SKILL.md\n",
    );
    refusal(
      world,
      ["beta", "bind", "context", "--persona", "engineer"],
      "extension/beta declares no capability 'context' (declares none)",
    );
  } finally {
    closeWorld(world);
  }
});

test("bind prints the validator's own message for a manifest install would refuse", () => {
  const world = makeWorld("happy");
  try {
    const manifestPath = join(world.home, "extensions", "beta", "skill.yaml");
    writeFileSync(
      manifestPath,
      "id: beta\nname: Beta\ncategory: extension\nkind: command-skill\nsummary: s\n" +
        "runtimes:\n  pi:\n    command_name: ext-beta\n    skill_file: SKILL.md\n" +
        "mirror_context_providers:\n  - id: Not Valid\n    description: d\n",
    );
    refusal(
      world,
      ["beta", "bind", "context", "--persona", "engineer"],
      "invalid mirror context capability id 'Not Valid' in <HOME>/extensions/beta/skill.yaml",
    );
  } finally {
    closeWorld(world);
  }
});

test("bind refuses a persona or journey that does not exist, and names where to look", () => {
  const world = makeWorld("happy");
  try {
    const personas = "(mirror list personas shows this home's)";
    const journeys = "(mirror journeys shows this home's)";
    refusal(
      world,
      ["beta", "bind", "context", "--persona", "engine"],
      `no persona 'engine' ${personas}`,
    );
    // Exact keys: identity's are lowercase, and `bind` does not fold case.
    refusal(
      world,
      ["beta", "bind", "context", "--persona", "Engineer"],
      `no persona 'Engineer' ${personas}`,
    );
    refusal(world, ["beta", "bind", "context", "--persona", ""], `no persona '' ${personas}`);
    refusal(
      world,
      ["beta", "bind", "context", "--journey", "nope"],
      `no journey 'nope' ${journeys}`,
    );
    // A slug that exists only as a `journey_path` row is not a journey a load
    // can find: the check reads `layer = 'journey'` and nothing else.
    seedIdentity(world.db, "journey_path", "path-only");
    refusal(
      world,
      ["beta", "bind", "context", "--journey", "path-only"],
      `no journey 'path-only' ${journeys}`,
    );
  } finally {
    closeWorld(world);
  }
});

test("what passes the checks still binds, and a dead row is still listed and still removable", () => {
  const world = makeWorld("happy");
  try {
    assert.equal(
      invoke(world, ["beta", "bind", "briefing", "--global"]).stdout,
      "bound beta/briefing -> global\n",
    );
    assert.equal(
      invoke(world, ["beta", "bind", "context", "--journey", "mirror-ts-core"]).stdout,
      "bound beta/context -> journey/mirror-ts-core\n",
    );
    // A row whose persona is gone -- bound before CR149, or whose persona was
    // deleted since. `bindings` lists it; `unbind` removes it: the repair.
    world.db
      .prepare(
        "INSERT INTO _ext_bindings (extension_id, capability_id, target_kind, target_id, created_at) " +
          "VALUES ('beta', 'context', 'persona', 'vanished', 't')",
      )
      .run();
    assert.match(
      invoke(world, ["beta", "bindings"]).stdout,
      /\n {2}context -> persona\/vanished\n/,
    );
    assert.equal(
      invoke(world, ["beta", "unbind", "context", "--persona", "vanished"]).stdout,
      "unbound beta/context -> persona/vanished\n",
    );
    assert.equal(stateOf(world).bindings.length, 2);
  } finally {
    closeWorld(world);
  }
});
