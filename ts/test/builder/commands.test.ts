// CV22.DS7.US8 plateau 1 — `inspect-method` and `pull-candidates` as invocations.
//
// Everything before this graded functions. This grades the two leaves the way a
// Navigator runs them: argv in, stdout/stderr/exit code out, against a golden
// captured from the real Python CLI in a SUBPROCESS — so `print()` semantics and
// the stream split are part of the contract rather than an assumption.
//
// The golden's own generation proved that necessary twice over: an in-process
// oracle silently reused the first case's database (`memory.config` resolves
// `DB_PATH` once, at import), and `print(x + "\n")` ends the stream with TWO
// newlines, which no renderer-level golden can see.
//
// `check-implementation` is absent on purpose: it reads the delivery cursor, so it
// lands in plateau 2 rather than being half-ported here.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runInspectMethod, runPullCandidates, surfacesForTrigger } from "#builder/commands.ts";
import { setAdoptedMethod } from "#builder/methodAdoption.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/builder-command.golden.json" with { type: "json" };
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";

const PROJECT = fileURLToPath(new URL("../fixtures/builder-command/project", import.meta.url));

interface Case {
  name: string;
  scenario: string;
  argv: string[];
  session_id: string;
  stdout: string;
  stderr: string;
  exit_code: number;
}

const cases = (golden as unknown as { cases: Case[] }).cases;
const SESSION_ID = cases[0]?.session_id ?? "builder-command-session";
const NOW = "2026-01-01T00:00:00Z";

const temporaryDirectories: string[] = [];

test.after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function memoryDatabase(): WritableDatabase {
  // `openDatabaseCopyForWrite` refuses a target outside a `tmp/` path — the
  // guard that keeps a write probe off a real database — and on macOS
  // `os.tmpdir()` is `/var/folders/...`, which does not satisfy it. The literal
  // prefix is what the existing append test uses.
  const directory = mkdtempSync("/tmp/builder-command-");
  temporaryDirectories.push(directory);
  const db = openDatabaseCopyForWrite(join(directory, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  return db;
}

/** Recreate the generator's `_seed` for one scenario. */
function seed(scenario: string): WritableDatabase {
  const db = memoryDatabase();
  const insertIdentity = (layer: string, key: string, content: string, metadata?: string) => {
    db.prepare(
      `INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(`${layer}:${key}`, layer, key, content, NOW, NOW, metadata ?? null);
  };

  if (scenario !== "no_journey_identity") {
    // The project path is the `journey` row's METADATA, exactly as
    // `JourneyService.set_project_path` writes it — not a separate
    // `journey_path` row. Writing the wrong row made an earlier version of this
    // test agree with an equally wrong generator.
    const metadata =
      scenario === "adopted_no_project" ? null : JSON.stringify({ project_path: PROJECT });
    insertIdentity(
      "journey",
      "demo",
      "# Demo journey\n\nA journey for the golden.\n",
      metadata ?? undefined,
    );
  }
  if (
    [
      "adopted",
      "adopted_no_project",
      "no_journey_identity",
      "other_mode",
      "mode_without_journey",
    ].includes(scenario)
  ) {
    setAdoptedMethod(db, "demo", "ariad", () => NOW);
  }
  if (scenario === "adopted_other_method") {
    setAdoptedMethod(db, "demo", "scrumban", () => NOW);
  }

  if (scenario === "other_mode") {
    activateOperatingMode(db, { mode: "Mirror Mode", journey: "demo", sessionId: SESSION_ID }, NOW);
  } else if (scenario === "mode_without_journey") {
    activateOperatingMode(db, { mode: "Builder Mode", journey: null, sessionId: SESSION_ID }, NOW);
  } else if (scenario !== "no_active_mode") {
    activateOperatingMode(
      db,
      { mode: "Builder Mode", journey: "demo", sessionId: SESSION_ID },
      NOW,
    );
  }
  return db;
}

/** Parse the golden's argv the way the front door will. */
function invoke(db: WritableDatabase, argv: readonly string[]) {
  const option = (name: string): string | null => {
    const index = argv.indexOf(name);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  const positionals = argv.filter(
    (token, index) => index > 0 && !token.startsWith("--") && !argv[index - 1]?.startsWith("--"),
  );
  const context = { db, environmentSessionId: null };
  if (argv[0] === "inspect-method") {
    return runInspectMethod(context, {
      method: positionals[0] ?? null,
      journey: option("--journey"),
      sessionId: option("--session-id"),
    });
  }
  if (argv[0] === "pull-candidates") {
    return runPullCandidates(context, {
      method: option("--method") ?? "",
      journey: option("--journey"),
      sessionId: option("--session-id"),
    });
  }
  throw new Error(`unsupported argv in this plateau: ${argv.join(" ")}`);
}

test("the golden covers both leaves and their refusals", () => {
  assert.ok(cases.length >= 20, `expected the full case matrix, got ${cases.length}`);
  assert.ok(cases.some((entry) => entry.exit_code === 0));
  assert.ok(cases.filter((entry) => entry.exit_code === 1).length >= 7);
});

test("every case matches Python's stdout, stderr, and exit code", () => {
  for (const entry of cases) {
    const db = seed(entry.scenario);
    try {
      const actual = invoke(db, entry.argv);
      assert.equal(actual.stdout, entry.stdout, `${entry.name} stdout`);
      assert.equal(actual.stderr, entry.stderr, `${entry.name} stderr`);
      assert.equal(actual.exitCode, entry.exit_code, `${entry.name} exit code`);
    } finally {
      db.close();
    }
  }
});

test("pull-candidates stdout ends with two newlines, because print adds one", () => {
  const entry = cases.find((candidate) => candidate.name === "pull_candidates_explicit_journey");
  assert.ok(entry);
  assert.ok(entry.stdout.endsWith("\n\n"), "the oracle itself must carry the blank line");
  const db = seed(entry.scenario);
  try {
    assert.ok(invoke(db, entry.argv).stdout.endsWith("\n\n"));
  } finally {
    db.close();
  }
});

test("the guards refuse in Python's order: method, journey, existence, adoption", () => {
  // An unknown method with no resolvable journey must report the METHOD error;
  // resolving the journey first would report the journey one.
  const unknownFirst = cases.find(
    (entry) => entry.name === "pull_candidates_unknown_method_no_journey",
  );
  const journeyNext = cases.find((entry) => entry.name === "pull_candidates_no_journey");
  const adoptionLast = cases.find((entry) => entry.name === "pull_candidates_not_adopted");
  assert.ok(unknownFirst && journeyNext && adoptionLast);
  assert.match(unknownFirst.stderr, /Builder method 'bogus' not found/u);
  assert.match(journeyNext.stderr, /requires a journey/u);
  assert.match(adoptionLast.stderr, /has not adopted Ariad yet/u);
});

test("only an active Builder Mode journey resolves", () => {
  // A journey attached to Mirror Mode must not satisfy Builder's resolution, and
  // Builder Mode with no journey must not either.
  for (const name of ["pull_candidates_other_mode"]) {
    const entry = cases.find((candidate) => candidate.name === name);
    assert.ok(entry);
    assert.equal(entry.exit_code, 1);
    assert.match(entry.stderr, /requires a journey/u);
  }
  for (const name of ["inspect_method_other_mode", "inspect_method_mode_without_journey"]) {
    const entry = cases.find((candidate) => candidate.name === name);
    assert.ok(entry);
    assert.equal(entry.exit_code, 0);
    assert.match(entry.stdout, /No Builder journey is active yet\./u);
  }
});

test("--journey wins over the positional method in inspect-method", () => {
  // Python's first branch returns on `--journey` without consulting the method,
  // so `inspect-method ariad --journey demo` renders the JOURNEY card.
  const entry = cases.find(
    (candidate) => candidate.name === "inspect_method_both_method_and_journey",
  );
  assert.ok(entry);
  assert.ok(!entry.stdout.includes("Builder Method Available"));
  assert.ok(entry.stdout.startsWith("■ Builder Method\n"));
});

test("a journey whose adopted method differs still renders as adopted", () => {
  // `inspect-method --journey` reports whatever is adopted, with no ariad check;
  // only `pull-candidates` requires the method to match.
  const inspect = cases.find((entry) => entry.name === "inspect_method_journey_other_method");
  const pull = cases.find((entry) => entry.name === "pull_candidates_adopted_other_method");
  assert.ok(inspect && pull);
  assert.equal(inspect.exit_code, 0);
  assert.match(inspect.stdout, /scrumban is adopted for this journey\./u);
  assert.equal(pull.exit_code, 1);
});

test("an adopted journey with no project path still renders both surfaces", () => {
  const entry = cases.find((candidate) => candidate.name === "pull_candidates_no_project_path");
  assert.ok(entry);
  assert.equal(entry.exit_code, 0);
  assert.equal((entry.stdout.match(/<<<ARIAD:/gu) ?? []).length, 2);
  // With no project path there is no roadmap to read, so the snapshot reports no
  // source and the empty-state frame rows appear.
  assert.match(entry.stdout, /source\nnone/u);
  // The ragged empty-state row, verbatim: 57 inner code points, not the 56 a
  // card produces.
  assert.ok(entry.stdout.includes("│ roadmap field                                      none │"));
});

test("which surfaces appear is decided by the DSL surface route", () => {
  // `_surfaces_for_trigger(method, "show_roadmap")`, not a hardcoded pair in the
  // command. Removing one from `ariadMethod.ts` would drop that block.
  assert.deepEqual(
    [...surfacesForTrigger("show_roadmap")],
    ["roadmap_snapshot", "pull_candidates"],
  );
  assert.deepEqual([...surfacesForTrigger("no_such_trigger")], []);
});
