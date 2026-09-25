// Self-test for the retired-surface guard (CV22.DS10.TS5, slice B).
//
// The Python original has NO test. It was written as a script and graded by
// use, which is why its table gained patterns twice after CI caught residue it
// had missed -- `configure_projection_refresh` surviving in `ts/parity/`, and a
// determinism step that kept invoking a deleted generator for four commits.
// The port gets the test the original never had, because after TS5 this guard
// is the only mechanical proof that six deletions stayed deleted.
//
// The last two groups are the important ones: they prove TS5's `python-core`
// rows actually fire. Both were STAGED first -- graded against the live tree,
// not enforced -- because a row nobody exercises is a row that gets switched
// on the day the Python safety net is gone, with nobody having ever seen it
// work. `python-core` went live at plateau 3, `python-core-mentions` at 4.

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
  type RetiredSurface,
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

describe("absence by suffix (CV22.DS10.TS5)", () => {
  const PY = { ...SURFACE, absentPaths: [], absentSuffixes: [".py"] } as const;

  test("flags a tracked file with a retired suffix anywhere in the tree", () => {
    const root = gitRepo({ "deep/nested/fixture/extension.py": "x\n" });
    const problems = checkAbsent(PY, trackedFiles(root));
    assert.equal(problems.length, 1);
    assert.match(problems[0]?.message ?? "", /deep\/nested\/fixture\/extension\.py is tracked/);
  });

  test("matches the suffix, not a name that merely contains it", () => {
    const root = gitRepo({
      "cache/module.pyc": "x\n",
      "docs/template/cli.py.template": "x\n",
      "notes/python.md": "x\n",
    });
    assert.deepEqual(checkAbsent(PY, trackedFiles(root)), []);
  });
});

describe("residue scope (CV22.DS10.TS5)", () => {
  const SCOPED = { ...SURFACE, residueScope: [".github/workflows/"] } as const;

  test("a scoped row reads only the files under its scope", () => {
    const root = gitRepo({
      ".github/workflows/tests.yml": "uses: forbiddenName\n",
      "docs/guide.md": "forbiddenName is explained here\n",
    });
    const problems = checkResidue(SCOPED, trackedFiles(root), root);
    assert.equal(problems.length, 1);
    assert.match(problems[0]?.message ?? "", /\.github\/workflows\/tests\.yml:1 mentions/);
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

  test("every exemption names a file the repository still tracks", () => {
    // An exemption for a file that cannot exist is a hole waiting for one to:
    // whatever lands at that path later is pre-approved to mention the surface.
    // Fourteen of them outlived the Python files they named until TS5 plateau
    // 4 pruned them.
    const tracked = new Set(trackedFiles(REPO_ROOT));
    for (const surface of RETIRED) {
      for (const path of Object.keys(surface.exemptions)) {
        assert.ok(tracked.has(path), `${surface.surfaceId}: exempts ${path}, which is not tracked`);
      }
    }
  });

  test("every exemption is still needed -- the file would fail without it", () => {
    // The other way an exemption goes stale: the file is rewritten and stops
    // mentioning the surface, and the exemption silently widens into a blind
    // spot for whatever that file says next.
    for (const surface of RETIRED) {
      const bare = { ...surface, exemptions: {} };
      for (const path of Object.keys(surface.exemptions)) {
        assert.equal(
          checkResidue(bare, [path], REPO_ROOT).length,
          1,
          `${surface.surfaceId}: ${path} no longer mentions the surface -- drop its exemption`,
        );
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

  test("the enforced rows are TS1 through TS4's retirements, and TS5's Python core", () => {
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
        "python-core",
        "python-core-mentions",
      ],
    );
  });

  test("nothing is staged: every row is enforced", () => {
    // The staging mechanism stays for the next row that needs it; a row left
    // staged after its story closes is a guard nobody is running.
    assert.deepEqual(STAGED, []);
  });

  test("the enforced sweep is clean against this repository", () => {
    assert.deepEqual(sweep(REPO_ROOT, ENFORCED), []);
  });
});

describe("the live python-core row (plateau 3, decision D12)", () => {
  const row = RETIRED.find((surface) => surface.surfaceId === "python-core");

  test("is enforced", () => {
    assert.ok(row, "the python-core row exists");
    assert.equal(row?.stagedUntil, undefined);
    assert.ok(ENFORCED.some((surface) => surface.surfaceId === "python-core"));
  });

  // Seeded regressions, one per thing plateau 3 deleted. A path in this list
  // coming back must fail the row; a row that cannot see them guards nothing.
  const SEEDS = [
    "src/memory/__init__.py",
    "tests/conftest.py",
    "ts/parity/generate_golden.py",
    "scripts/check_oracle_drift.py",
    "scripts/reset_sandbox_pet_store.py",
    "scripts/check_retired_surfaces.py",
    "scripts/check_doc_links.py",
    "scripts/build_claude_plugin.py",
    "spikes/ts-search-parity/README.md",
    "pyproject.toml",
    "uv.lock",
  ];

  test("fails on every path the deletion removed, if it comes back", () => {
    for (const path of SEEDS) {
      const problems = checkAbsent(row as NonNullable<typeof row>, [path]);
      assert.equal(problems.length, 1, path);
    }
  });

  test("fails on a .py file anywhere, not only where the core used to live", () => {
    // The six inert fixture bodies were Python nobody had listed; this is the
    // part of the claim a path list cannot make.
    const problems = checkAbsent(row as NonNullable<typeof row>, [
      "ts/test/fixtures/ext-new/extension.py",
    ]);
    assert.equal(problems.length, 1);
  });

  test("fails on a workflow that installs an interpreter, and only on workflows", () => {
    const root = gitRepo({
      ".github/workflows/tests.yml": "      - uses: actions/setup-python@v6\n",
      "docs/process/ci.md": "CI used actions/setup-python until CV22.DS10.TS5.\n",
    });
    const problems = checkResidue(row as NonNullable<typeof row>, trackedFiles(root), root);
    assert.equal(problems.length, 1);
    assert.match(problems[0]?.message ?? "", /\.github\/workflows\/tests\.yml:1 mentions/);
  });
});

describe("the live python-core-mentions row (plateau 4, decision D12)", () => {
  const row = RETIRED.find(
    (surface) => surface.surfaceId === "python-core-mentions",
  ) as RetiredSurface;

  test("is enforced", () => {
    assert.ok(row, "the python-core-mentions row exists");
    assert.equal(row.stagedUntil, undefined);
    assert.ok(ENFORCED.includes(row));
  });

  test("is clean against this repository", () => {
    // Plateau 3 left 79 mentions: slice H rewrote the documentation that held
    // most of them, and each of the rest is rewritten or exempted with a
    // reason. A new one is a regression, named with its line.
    assert.deepEqual(sweep(REPO_ROOT, RETIRED, { only: "python-core-mentions" }), []);
  });

  test("FIRES on every shape it forbids -- the row is graded, not merely written", () => {
    // Until plateau 4 this asserted against the real tree, where the
    // developer conventions still said `uv run`. Slice H rewrote them, so the
    // row is graded on seeds instead: one file per shape, each of which must
    // be reported, while the prose around them must not be.
    const seeds: Record<string, string> = {
      "hooks/a.sh": "python3 -m memory backup --silent\n",
      "hooks/b.sh": 'python3 -c "import json"\n',
      "docs/c.md": "Run `uv run python -m memory seed`.\n",
      "docs/d.md": "First `uv sync`, then go.\n",
      "src/e.py.txt": "from memory.cli import main\n",
      "src/f.txt": "import memory\n",
      "src/g.txt": "memory.hooks.mirror_state\n",
    };
    const root = gitRepo({
      ...seeds,
      "docs/prose.md": "The Python core was deleted; run `mirror seed` instead.\n",
    });
    const flagged = checkResidue(row, trackedFiles(root), root).map((problem) =>
      problem.message.split(":")[1]?.trim(),
    );
    assert.deepEqual(flagged.sort(), Object.keys(seeds).sort());
  });

  test("no longer catches the runtime hooks -- plateau 1 rewrote them", () => {
    // When this row was written it reported thirteen hook and launcher files
    // invoking `python3 -m memory`, or reaching into memory.hooks and
    // memory.cli internals that were never commands. US2's Skill Invocation
    // Gate could not see any of them: its pattern was `uv run python -m
    // memory`, and these said `python3`.
    const messages = sweep(REPO_ROOT, RETIRED, { only: "python-core-mentions" })
      .map((problem) => problem.message)
      .join("\n");

    for (const hook of [
      ".claude/hooks/",
      ".gemini/hooks/",
      "plugins/mirror-mind/hooks/",
      "plugins/mirror-mind/mcp/launch.sh",
      "scripts/codex-mirror.sh",
      "scripts/codex-hooks/",
      ".claude/settings.json",
    ]) {
      assert.ok(!messages.includes(hook), `${hook} still reaches for an interpreter`);
    }
  });

  test("exempts the US3 re-homed callers by name, with the reason", () => {
    // `frame/` and `installer/` keep their interpreter spawns until US3 gives
    // them an npm entry point. The exemption is what keeps TS5 from claiming
    // zero Python for the shipped artifact -- a claim only US3 can make.
    const exemptions = row.exemptions;
    assert.match(exemptions["installer/configure.ps1"] ?? "", /US3/);
    for (const path of ["installer/health-check.ps1", "frame/main/session-gate.js"]) {
      assert.match(exemptions[path] ?? "", /US3/, path);
    }
  });

  test("still allows an extension to declare a Python runtime of its own", () => {
    // TS2's cutoff says an extension may own any executable runtime. The core
    // owning Python is what retired, not extensions choosing it -- so the
    // guard must not forbid documenting the contract. Until plateau 4 that
    // took file-level exemptions for the extension guides; the rewritten
    // guides declare runtimes as manifests do, which no pattern matches, so
    // the exemptions went and this proves they are not needed.
    const root = gitRepo({
      "docs/guide.md":
        "runtime:\n  protocol: mirror-cli-v1\n  command: [python3, cli.py, campaigns]\n" +
        "`command: [python3, commands/ping.py]` is exactly as valid.\n",
    });
    assert.deepEqual(checkResidue(row, trackedFiles(root), root), []);
    assert.ok(!("docs/product/extensions/authoring-guide.md" in row.exemptions));
  });
});
