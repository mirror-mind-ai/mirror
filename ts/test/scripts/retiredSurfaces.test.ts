// Self-test for the retired-surface guard (CV22.DS10.TS5, slice B).
//
// The Python original has NO test. It was written as a script and graded by
// use, which is why its table gained patterns twice after CI caught residue it
// had missed -- `configure_projection_refresh` surviving in `ts/parity/`, and a
// determinism step that kept invoking a deleted generator for four commits.
// The port gets the test the original never had, because after TS5 this guard
// is the only mechanical proof that six deletions stayed deleted.
//
// The last group is the important one: it proves the STAGED `python-core` row
// actually fires. A staged row that nobody exercises is a row that will be
// switched on at plateau 3 -- the moment the Python safety net is gone -- with
// nobody having ever seen it work.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, test } from "node:test";

import {
  checkAbsent,
  checkResidue,
  ENFORCED,
  isHistory,
  RETIRED,
  STAGED,
  sweep,
  trackedFiles,
} from "#guards/retiredSurfaces.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const roots: string[] = [];

function gitRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mirror-retired-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const SURFACE = {
  surfaceId: "probe",
  story: "CV22.DS10.TEST",
  absentPaths: ["src/gone/", "src/gone.ts"],
  forbiddenPatterns: ["forbiddenName", "gone\\.subcommand\\b"],
  exemptions: { "src/allowed.ts": "documented reason" },
} as const;

describe("absence", () => {
  test("flags a tracked file under a retired directory", () => {
    const root = gitRepo({ "src/gone/thing.ts": "x\n" });

    const problems = checkAbsent(SURFACE, trackedFiles(root));

    assert.equal(problems.length, 1);
    assert.match(problems[0]?.message ?? "", /src\/gone\/thing\.ts is tracked but was retired/);
  });

  test("flags a retired file by exact path", () => {
    const root = gitRepo({ "src/gone.ts": "x\n" });
    assert.equal(checkAbsent(SURFACE, trackedFiles(root)).length, 1);
  });

  test("does not flag a path that merely shares a prefix", () => {
    // `src/gone.ts` is retired; `src/goneaway.ts` is a different file.
    const root = gitRepo({ "src/goneaway.ts": "x\n" });
    assert.deepEqual(checkAbsent(SURFACE, trackedFiles(root)), []);
  });

  test("untracked files are invisible", () => {
    // Git is the authority on what the repository contains: a stale build
    // artifact on one machine is not a surface that came back. This is also
    // why the guard only caught capture_family_outputs.sh once it was
    // committed.
    const root = gitRepo({ "keep.ts": "x\n" });
    mkdirSync(join(root, "src/gone"), { recursive: true });
    writeFileSync(join(root, "src/gone/untracked.ts"), "x\n");

    assert.deepEqual(checkAbsent(SURFACE, trackedFiles(root)), []);
  });
});

describe("residue", () => {
  test("flags a forbidden mention with its line number", () => {
    const root = gitRepo({ "src/caller.ts": "line one\nline two\ncalls forbiddenName here\n" });

    const problems = checkResidue(SURFACE, trackedFiles(root), root);

    assert.equal(problems.length, 1);
    assert.match(problems[0]?.message ?? "", /src\/caller\.ts:3 mentions `forbiddenName`/);
  });

  test("reports only the first pattern per file", () => {
    const root = gitRepo({ "src/caller.ts": "forbiddenName\ngone.subcommand\n" });
    assert.equal(checkResidue(SURFACE, trackedFiles(root), root).length, 1);
  });

  test("history documents are allowed to name the surface", () => {
    const root = gitRepo({ "docs/project/decisions.md": "we retired forbiddenName\n" });
    assert.deepEqual(checkResidue(SURFACE, trackedFiles(root), root), []);
  });

  test("an exempted path is allowed to name the surface", () => {
    const root = gitRepo({ "src/allowed.ts": "forbiddenName\n" });
    assert.deepEqual(checkResidue(SURFACE, trackedFiles(root), root), []);
  });

  test("a binary file is skipped rather than failing the sweep", () => {
    const root = gitRepo({ "assets/blob.bin": "\u0000\u0001forbiddenName\u0000" });
    assert.deepEqual(checkResidue(SURFACE, trackedFiles(root), root), []);
  });

  test("isHistory covers the project record and not the product", () => {
    assert.ok(isHistory("docs/project/roadmap/index.md"));
    assert.ok(isHistory("docs/releases/pending-cutoffs.md"));
    assert.ok(isHistory("docs/process/worklog.md"));
    assert.ok(!isHistory("docs/process/development-guide.md"));
    assert.ok(!isHistory("README.md"));
  });

  test("the guard's own table and this self-test are history", () => {
    // A guard's table must name every retired surface -- the patterns ARE the
    // data -- so the table and its test cannot be residue. Missing this turned
    // CI red at 5fb23132: locally both guards were green because the new files
    // were not yet COMMITTED, and the sweep reads `git ls-files`.
    //
    // The Python original's exemption left with it (TS5 plateau 3): an
    // exemption for a file that cannot exist is a hole waiting for one to.
    assert.ok(!isHistory("scripts/check_retired_surfaces.py"));
    assert.ok(isHistory("ts/src/guards/retiredSurfaces.ts"));
    assert.ok(isHistory("ts/test/scripts/retiredSurfaces.test.ts"));
  });
});

describe("the table itself", () => {
  test("every exemption states a reason", () => {
    // An exemption is a claim that a mention is correct. An empty one is a
    // silent hole, which is how a guard stops meaning anything.
    for (const surface of RETIRED) {
      for (const [path, reason] of Object.entries(surface.exemptions)) {
        assert.ok(reason.trim().length > 10, `${surface.surfaceId}: ${path} has no real reason`);
      }
    }
  });

  test("every surface carries at least one mechanical assertion", () => {
    for (const surface of RETIRED) {
      assert.ok(
        surface.absentPaths.length + surface.forbiddenPatterns.length > 0,
        `${surface.surfaceId} asserts nothing`,
      );
    }
  });

  test("every forbidden pattern compiles", () => {
    for (const surface of RETIRED) {
      for (const pattern of surface.forbiddenPatterns) {
        assert.doesNotThrow(() => new RegExp(pattern), `${surface.surfaceId}: ${pattern}`);
      }
    }
  });

  test("the eight enforced rows are the ones TS1 through TS4 retired", () => {
    assert.deepEqual(
      ENFORCED.map((surface) => surface.surfaceId),
      [
        "journey-projections",
        "web-console",
        "compat-host",
        "eval-harness",
        "legacy-migration",
        "journey-admin-verbs",
        "conversation-metadata-backfill",
        "sqlite-refinement-workbench",
      ],
    );
  });

  test("the enforced sweep is clean against this repository", () => {
    assert.deepEqual(sweep(REPO_ROOT, ENFORCED), []);
  });
});

describe("the staged python-core row", () => {
  test("is staged, and says when it goes live", () => {
    assert.equal(STAGED.length, 1);
    assert.equal(STAGED[0]?.surfaceId, "python-core");
    assert.match(STAGED[0]?.stagedUntil ?? "", /plateau 3/);
  });

  test("is skipped by the default sweep while Python is still here", () => {
    // Otherwise every build between now and plateau 3 is red, and a red build
    // that everyone expects is the same as no build at all.
    assert.deepEqual(sweep(REPO_ROOT, ENFORCED), []);
  });

  // Plateau 3 deletes one row of the Plan's slice F per commit, and each commit
  // moves its paths from the second list to the first. Both halves are the
  // point: a path in `stillTracked` proves the row can still SEE what is left,
  // and a path in `deleted` proves the deletion happened and stays done.
  const deleted = [
    "src/memory/",
    "tests/",
    "ts/parity/",
    "scripts/check_oracle_drift.py",
    "scripts/reset_sandbox_pet_store.py",
    "scripts/check_retired_surfaces.py",
    "scripts/check_doc_links.py",
    "scripts/build_claude_plugin.py",
  ];
  const stillTracked = ["pyproject.toml"];

  test("FIRES against today's tree when asked -- the row is graded, not merely written", () => {
    const problems = sweep(REPO_ROOT, RETIRED, { only: "python-core" });

    assert.ok(problems.length > 0, "python-core found nothing while the interpreter is present");
    const absent = problems
      .filter((problem) => problem.message.includes("is tracked but was retired"))
      .map((problem) => problem.message)
      .join("\n");

    for (const path of stillTracked) {
      assert.ok(absent.includes(`python-core: ${path}`), `${path} is no longer reported`);
    }
    for (const path of deleted) {
      assert.ok(!absent.includes(`python-core: ${path}`), `${path} is tracked again`);
    }
  });

  test("no longer catches the runtime hooks -- plateau 1 rewrote them", () => {
    // When this row was written it reported thirteen hook and launcher files
    // invoking `python3 -m memory`, or reaching into memory.hooks and
    // memory.cli internals that were never commands. US2's Skill Invocation
    // Gate could not see any of them: its pattern was `uv run python -m
    // memory`, and these said `python3`.
    //
    // They are Node now, and the row's own catch list is the evidence. This
    // assertion is the shrinking half of the same instrument: what it still
    // reports is what plateau 3 still has to delete.
    const messages = sweep(REPO_ROOT, RETIRED, { only: "python-core" })
      .map((problem) => problem.message)
      .join("\n");

    for (const hook of [
      ".claude/hooks/",
      ".gemini/hooks/",
      "plugins/mirror-mind/hooks/",
      "plugins/mirror-mind/mcp/launch.sh",
      "scripts/codex-mirror.sh",
      ".claude/settings.json",
    ]) {
      assert.ok(!messages.includes(hook), `${hook} still reaches for an interpreter`);
    }
  });

  test("exempts the US3 re-homed callers by name, with the reason", () => {
    // `frame/` and `installer/` keep their interpreter spawns until US3 gives
    // them an npm entry point. The exemption is what keeps TS5 from claiming
    // zero Python for the shipped artifact -- a claim only US3 can make.
    const exemptions = STAGED[0]?.exemptions ?? {};
    assert.match(exemptions["frame/main/command-registry.js"] ?? "", /US3/);
    assert.match(exemptions["installer/configure.ps1"] ?? "", /US3/);
  });

  test("still allows an extension to declare a Python runtime of its own", () => {
    // TS2's cutoff says an extension may own any executable runtime. The core
    // owning Python is what retired, not extensions choosing it -- so the
    // guard must not forbid documenting the contract.
    const exemptions = STAGED[0]?.exemptions ?? {};
    assert.ok("docs/product/extensions/authoring-guide.md" in exemptions);
  });
});
