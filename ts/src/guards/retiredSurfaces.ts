// Fail CI when a surface CV22.DS10 retired comes back, or never fully left.
//
// The Node port of `scripts/check_retired_surfaces.py` (CV22.DS10.TS5, slice
// B). The Zero Python gate assigns that file here with a one-line reason that
// is the whole argument: **it must outlive the deletion it proves.** A guard
// written in the language it forbids cannot run on the day the language is
// gone.
//
// DS10 removes surfaces rather than porting them. Each deletion is large,
// touches many files, and is easy to leave half-done -- a dangling import, a
// `--help` row, a skill still naming the command, a test patching a module
// nobody has anymore. A deletion has no test of its own. This is that test:
// one table, one sweep, and a row added by each retiring story. Per surface:
//
//   * ABSENCE   -- every path the story deleted is still gone.
//   * NO RESIDUE -- no tracked file mentions the surface, except where the
//     mention is the point: the roadmap, decisions, debt, refinement, and
//     release notes, which exist to record that it was retired and why.
//
// What it deliberately does NOT do: prove the deletion was correct. The suites
// do that. This proves it was COMPLETE, and stays complete.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mentions are expected -- and required -- in the documents whose job is to
 * record the retirement. Everything else is residue.
 */
export const HISTORY_PREFIXES: readonly string[] = [
  // Everything under `docs/project/` is the project's record of itself --
  // roadmap, decisions, debt, refinement, audits, briefing. A retired surface
  // is supposed to be named there.
  "docs/project/",
  "docs/process/worklog.md",
  "docs/releases/",
  // A guard's own table is the one file that must name every retired surface:
  // the patterns ARE the data, so the table and its self-test exempt
  // themselves, as the Python original (deleted at TS5 plateau 3) always did.
  //
  // Both guards learned this the same way, in CI rather than locally, because
  // the sweep reads `git ls-files` -- so a file that is written but not yet
  // COMMITTED is invisible to it. Local green on new files is not evidence.
  "ts/src/guards/retiredSurfaces.ts",
  "ts/test/scripts/retiredSurfaces.test.ts",
];

export interface RetiredSurface {
  readonly surfaceId: string;
  readonly story: string;
  /** Paths that must not exist. Directories end with `/`. */
  readonly absentPaths: readonly string[];
  /**
   * File suffixes that must not be tracked ANYWHERE -- `.py`, for the claim
   * that the repository holds no Python at all rather than none in the paths
   * someone thought to list (CV22.DS10.TS5).
   */
  readonly absentSuffixes?: readonly string[];
  /** Regexes that must not appear in tracked files outside HISTORY_PREFIXES. */
  readonly forbiddenPatterns: readonly string[];
  /** Paths allowed to mention the surface beyond the history prefixes, with why. */
  readonly exemptions: Readonly<Record<string, string>>;
  /**
   * When present, the residue sweep reads ONLY tracked files under these
   * prefixes. For a claim about one kind of file -- "no workflow installs an
   * interpreter" -- where the same words elsewhere (a guide explaining what
   * CI used to do) are not residue.
   */
  readonly residueScope?: readonly string[];
  /**
   * A row that is DEFINED but not yet ENFORCED, with the reason and the moment
   * it goes live.
   *
   * A staged row is not a disabled one. `python-core` below is proven to fire
   * against today's tree by `retiredSurfaces.test.ts` -- it must report the
   * live interpreter, or the test fails. So the row is graded now and enforced
   * later, and going live at plateau 3 is a one-word edit rather than new,
   * unexercised code written on the day the safety net is already gone.
   */
  readonly stagedUntil?: string;
}

export const RETIRED: readonly RetiredSurface[] = [
  {
    surfaceId: "journey-projections",
    story: "CV22.DS10.TS1",
    absentPaths: [
      "src/memory/journey_projections/",
      "src/memory/cli/journey_projection.py",
      "ts/src/explorer/projectionRefresh.ts",
      "tests/unit/memory/journey_projections/",
      "tests/integration/memory/journey_projections/",
      "tests/fixtures/journey_projections/",
    ],
    forbiddenPatterns: [
      "journey_projections",
      "journey-projection\\b",
      "createPythonProjectionRefresh",
      "requestProjectionRefresh",
      // The API names, not just the module names. CI found
      // `configure_projection_refresh` surviving in `ts/parity/` after the
      // first version of this table missed it: the patterns were written from
      // the files the deletion touched, which is the one place residue cannot
      // be.
      "configure_projection_refresh",
      "request_projection_refresh",
    ],
    exemptions: {
      "src/memory/extensions/api.py":
        "the deliberate refusal that tells an extension the capability was removed",
      "tests/unit/memory/extensions/test_loader.py": "the test of that refusal",
      "ts/test/builder/cursor.test.ts":
        "asserts TypeScript requests no refresh against the oracle's recording",
      "ts/test/builder/lifecycle.test.ts":
        "documents why the corpus field is no longer asserted (D-019)",
      "ts/test/goldens/builder-cursor.golden.json": "the recorded Python oracle",
      "src/memory/oracle_drift.py": "a comment naming a function that used to exist",
      "docs/product/extensions/api-reference.md":
        "documents the removal for an extension author reading an older copy",
      "src/memory/extensions/version.py":
        "decision D-018 names the removed capability to explain why VERSION is frozen at 1.1 rather than bumped",
    },
  },
  {
    surfaceId: "web-console",
    story: "CV22.DS10.US1",
    absentPaths: [
      "src/memory/web/",
      "src/memory/surfaces/atlas.py",
      "src/memory/surfaces/workspace.py",
      "src/memory/surfaces/evidence.py",
      "src/memory/surfaces/objects.py",
      "src/memory/surfaces/models.py",
      "src/memory/surfaces/search.py",
      "src/memory/intelligence/scene.py",
      "evals/scene.py",
      "tests/unit/memory/web/",
      "tests/unit/memory/evals/test_scene_fixture_contract.py",
      "tests/unit/memory/intelligence/test_scene.py",
    ],
    forbiddenPatterns: [
      "memory\\.web\\b",
      "memory web\\b",
      "SurfaceService",
      "intelligence\\.scene\\b",
      "WorkspaceSurface|AtlasSurface|EvidenceSurface|SearchSurface|ObjectDetailSurface",
    ],
    exemptions: {},
  },
  {
    surfaceId: "compat-host",
    story: "CV22.DS10.TS2",
    // Gate items 2 and 5 in one mechanical place: item 2 asks that the packaged
    // artifact carry no core-owned Python extension bridge, and item 5 that
    // every retained provider and command enter through a declared
    // language-neutral runtime. Both reduce to the same claim -- the host and
    // every launcher branch for it are gone -- and this check runs over the
    // tracked file set the package is built from.
    absentPaths: [
      "src/memory/extensions/compat_host.py",
      "tests/unit/memory/extensions/test_compat_host.py",
      "ts/parity/generate_ext_dispatch_golden.py",
      "ts/test/fixtures/ext-dispatch.golden.json",
    ],
    forbiddenPatterns: [
      "compat_host",
      "compat-host",
      // The launcher seams, not only the module. The TS1 lesson: residue hides
      // in the names of the things that CALLED the deleted code, which is the
      // one place the deletion diff cannot show it.
      "validate_register",
      "validateExtensionRegister",
      "legacyCommand",
      "legacyCwd",
      "hostCommand",
      "spawnHost",
      // The generator and the corpus it recorded. `absentPaths` proves the
      // FILES are gone; these prove nothing still CALLS them. CI found the gap
      // the hard way on 2026-09-22: the determinism step kept invoking the
      // deleted generator and failed on Python 3.10 and 3.12 after the files
      // had been removed for four commits.
      "generate_ext_dispatch_golden",
      "ext-dispatch\\.golden",
    ],
    exemptions: {
      "src/memory/oracle_drift.py":
        "a comment recording that the bridge was tracked here until TS2 deleted it",
      "ts/test/extensions/dispatch.test.ts":
        "the file that REPLACED the host's parity corpus, and whose header records what each retired group of cases proved -- the disposition itself",
    },
  },
  {
    surfaceId: "eval-harness",
    story: "CV22.DS10.TS3",
    // The model-behavior release gate moved to ts/evals/ and the Python harness
    // was deleted with its tests, its entry point, and the three helpers that
    // existed only to feed the port. Each of those imported what this story
    // removed, so they die with it -- the fixture and its oracle die together,
    // as in TS2.
    absentPaths: ["evals/", "tests/unit/memory/evals/"],
    forbiddenPatterns: [
      "from evals\\b",
      "import evals\\b",
      "memory eval\\b",
      "evals\\.runner",
      "evals\\._support",
      // The helpers by name: absentPaths proves the FILES are gone, these prove
      // nothing still calls them -- the TS2 lesson, where a CI step kept
      // invoking a deleted generator for four commits.
      "_capture_probe_inputs",
      "_check_fixture_equality",
      "_generate_support_golden",
    ],
    exemptions: {
      "docs/process/development-guide.md":
        "the guide now names ts/evals/ and npm run eval; the phrase survives only where it explains what the Python era measured and why the denominator moved",
    },
  },
  // CV22.DS10.TS4 retired five surfaces, so it contributes five rows rather
  // than one. They are separate because they fail separately: a resurrected
  // `migrate-legacy` and a resurrected Workbench verb are different mistakes
  // with different fixes, and one row naming both would report the wrong one.
  //
  // Every pattern below is a COMMAND SHAPE or a MODULE NAME, never bare
  // vocabulary. `mutate`, `change-request`, and `refinement-story` are living
  // Ariad words, so a guard matching the words alone would be red on the day it
  // landed and would then be weakened with exemptions until it meant nothing.
  {
    surfaceId: "legacy-migration",
    story: "CV22.DS10.TS4",
    absentPaths: [
      "src/memory/cli/migrate_legacy.py",
      "src/memory/cli/migration_rehearsal.py",
      "tests/unit/memory/cli/test_migrate_legacy.py",
      "tests/unit/memory/cli/test_migration_rehearsal.py",
    ],
    forbiddenPatterns: [
      "migrate_legacy",
      "migration_rehearsal",
      "memory-rehearse-migration",
      "memory migrate-legacy",
    ],
    exemptions: {
      "docs/product/extensions/migrations.md":
        "`ext <id> migrate-legacy` is an EXTENSION-owned subcommand name that an extension author may still choose; it never referred to the core command",
      "ts/src/frontDoor/routing.ts": "the retired entry that answers the name",
      "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of that refusal",
      "tests/unit/memory/test_main.py": "asserts the dispatcher no longer knows the name",
    },
  },
  {
    surfaceId: "journey-admin-verbs",
    story: "CV22.DS10.TS4",
    absentPaths: [
      "src/memory/services/journey_admin.py",
      "src/memory/storage/journey_admin.py",
      "tests/unit/memory/services/test_journey_admin.py",
    ],
    forbiddenPatterns: [
      "journey_admin",
      "JourneyAdmin",
      "journey export-registry",
      "journey mutate\\b",
      "mirror\\.journey-mutation@",
    ],
    exemptions: {
      "ts/src/frontDoor/routing.ts": "the retired entries that answer the two verbs",
      "ts/src/frontDoor/cli.ts":
        "the refusal itself; the comment names the write verb to explain why it must answer BEFORE stdin is read, which is the property under test",
      "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of those refusals",
      "tests/unit/memory/cli/test_journey.py":
        "asserts the verbs reach no service and consume no stdin",
      "src/memory/oracle_drift.py":
        "a comment recording that the two verbs used to be tracked here",
    },
  },
  {
    surfaceId: "conversation-metadata-backfill",
    story: "CV22.DS10.TS4",
    absentPaths: [],
    forbiddenPatterns: [
      // The flags and the two service methods. NOT the bare word `backfill`:
      // `conversation-logger backfill-pi-sessions` and
      // `ts/src/conversation/backfill.ts` are the TRANSCRIPT backfills, a
      // different feature that is ported and staying.
      "--metadata-backfill-",
      "metadata_backfill",
      "preview_metadata_backfill",
      "apply_metadata_backfill",
    ],
    exemptions: {
      "ts/src/frontDoor/routing.ts": "the retired entries that answer the two flags",
      "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of those refusals",
      "ts/test/frontDoor/routing.test.ts":
        "asserts the flags are retired whatever the lifecycle gate says",
      "scripts/ts5/capture_family_outputs.sh":
        "CV22.DS10.TS5 captures the refusal itself as a command family: the cutoff answer is a user-visible surface, so it is hashed before the deletion and replayed after it",
    },
  },
  {
    surfaceId: "sqlite-refinement-workbench",
    story: "CV22.DS10.TS4",
    absentPaths: [
      "src/memory/builder/workbench.py",
      "src/memory/builder/workbench_surfaces.py",
      "src/memory/storage/builder_workbench.py",
      "ts/src/builder/workbenchSnapshot.ts",
      "tests/unit/memory/builder/test_workbench.py",
      "tests/unit/memory/storage/test_builder_workbench_store.py",
    ],
    forbiddenPatterns: [
      "workbench_surfaces",
      "BuilderWorkbenchStore",
      "get_workbench_snapshot",
      "getWorkbenchSnapshot",
      "safeWorkbenchSnapshot",
      "_safe_workbench_snapshot",
      "workbenchSnapshot",
      "build refinement-story ",
      "build change-request ",
      // The surfaces those twenty commands rendered.
      "CHANGE_REQUEST_CAPTURED",
      "REFINEMENT_STORY_OVERVIEW",
      "REFINEMENT_STORY_PULLED",
    ],
    exemptions: {
      "ts/src/frontDoor/routing.ts":
        "TS_BUILD_WORKBENCH_ACTIONS is retained as the NAME LIST the retired entries match on, which is what keeps the twenty verbs refusable",
      "ts/test/frontDoor/buildRouting.test.ts":
        "asserts all twenty names retire, and that the count is still twenty",
      "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of those refusals",
      "scripts/ts5/capture_family_outputs.sh":
        "CV22.DS10.TS5 captures the refusal itself as a command family: the cutoff answer is a user-visible surface, so it is hashed before the deletion and replayed after it",
      "tests/unit/memory/cli/test_build.py":
        "asserts the mm-build skill no longer offers the retired command -- the mention is the negative assertion itself",
      "src/memory/db/migrations.py":
        "migrations 015/016 create the tables and REMAIN applied: the rows are kept, only the commands were retired",
      "ts/src/db/migrations.ts": "the same two migrations on the TypeScript side",
      "ts/src/db/schemaState.ts":
        "still recognizes 015/016 as applied, which is what keeps an existing database from looking unmigrated",
      "ts/parity/generate_migration_fixtures.py": "grades those two migrations",
      "ts/parity/generate_runtime_status_golden.py": "lists the applied migration ids",
      "tests/unit/memory/db/test_migrations.py": "tests those two migrations",
      "ts/test/db/migrationFixtures.test.ts": "grades those two migrations",
      "ts/test/db/schemaState.test.ts": "pins 015/016 recognition",
      "src/memory/oracle_drift.py": "a comment recording that workbench.py used to be tracked here",
    },
  },
  {
    surfaceId: "python-core",
    story: "CV22.DS10.TS5",
    // The row DS10's Zero Python gate asks for, written at plateau 0 and split
    // in two at plateau 3 (decision D12). This half is the STRUCTURAL claim,
    // live since plateau 3: nothing the Python core consisted of is tracked, no
    // file anywhere is Python, and no workflow installs an interpreter. The
    // other half -- what the tree still SAYS about Python -- is
    // `python-core-mentions` below, staged until slice H has rewritten the
    // documentation that holds most of it.
    //
    // `absentSuffixes` is the part a path list could not express. The Plan's
    // own inventory listed where the Python lived; it was the six fixture
    // bodies nobody listed that proved the list could be short.
    absentPaths: [
      "src/memory/",
      "tests/",
      "pyproject.toml",
      "uv.lock",
      "spikes/ts-search-parity/",
      "scripts/check_doc_links.py",
      "scripts/check_retired_surfaces.py",
      "scripts/check_oracle_drift.py",
      "scripts/build_claude_plugin.py",
      "scripts/reset_sandbox_pet_store.py",
      "ts/parity/",
    ],
    absentSuffixes: [".py"],
    // CI installing an interpreter is the same claim at the workflow level, and
    // it is scoped to the workflows: a guide may still explain what CI did.
    forbiddenPatterns: ["setup-python", "astral-sh/setup-uv", "\\buv (run|sync)\\b"],
    residueScope: [".github/workflows/"],
    exemptions: {},
  },
  {
    surfaceId: "python-core-mentions",
    story: "CV22.DS10.TS5",
    stagedUntil: "CV22.DS10.TS5 plateau 4, when slice H has rewritten the documentation",
    // The second half of the Zero Python row (D12): no tracked file outside
    // the project's record INVOKES the interpreter or imports the core.
    //
    // It is deliberately WIDER than the guard it replaces. US2's Skill
    // Invocation Gate was satisfied by a check whose pattern was
    // `uv run python -m memory`, scanning skills. TS5's inventory then found
    // TWELVE runtime hook files invoking `python3 -m memory` -- and reaching
    // into `memory.hooks.*` and `memory.cli.*` internals that were never
    // commands at all. The narrow pattern was true and the conclusion it
    // supported was false. So the patterns below cover the interpreter by any
    // name, the module by any import shape, and `uv` itself.
    absentPaths: [],
    forbiddenPatterns: [
      // The interpreter, by any name it is invoked under.
      "uv run python",
      "python3? -m memory\\b",
      "python3? -c ",
      "\\buv (run|sync)\\b",
      // The core as an importable Python package -- the shape the hooks used,
      // which no command-level pattern can see.
      "from memory\\.",
      "from memory import",
      "import memory\\b",
      "memory\\.hooks",
    ],
    exemptions: {
      // Re-homed to US3 by US2 decision D4, because their new shape depends on
      // the npm artifact's `bin` and install path. Named here so the
      // zero-Python claim cannot be made for the shipped artifact while they
      // stand -- an exemption that expires, not one that hides.
      "frame/main/command-registry.js":
        "eight interpreter spawns re-homed to CV22.DS10.US3 (US2 decision D4); TS5 claims zero Python for the REPOSITORY, US3 claims it for the ARTIFACT",
      "installer/configure.ps1": "same US3 re-homing: the installer assumes a uv-bearing clone",
      "installer/health-check.ps1": "same US3 re-homing",
      // An extension may own any executable runtime, including Python. TS2's
      // cutoff says so explicitly. Forbidding the documentation of that would
      // forbid the contract.
      "docs/product/extensions/authoring-guide.md":
        "documents that an extension may declare a Python runtime of its own; the core owning Python is what retired, not extensions choosing it",
      "docs/product/extensions/testing-guide.md": "same contract, from the testing side",
      "docs/product/extensions/template/README.md": "same contract, in the template's README",
    },
  },
];

export interface SurfaceProblem {
  readonly surfaceId: string;
  readonly message: string;
}

export function isHistory(path: string): boolean {
  return HISTORY_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Tracked paths only -- `git ls-files`, in repository order. */
export function trackedFiles(repoRoot: string): string[] {
  const stdout = execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.split("\n").filter((line) => line.length > 0);
}

/**
 * Tracked paths only.
 *
 * Git is the authority on what the repository contains. A leftover
 * `__pycache__` beside a deleted module is a stale build artifact on one
 * machine, not a surface that came back -- failing on it would teach the reader
 * to distrust this check.
 */
export function checkAbsent(surface: RetiredSurface, files: readonly string[]): SurfaceProblem[] {
  const retired = (path: string): boolean =>
    surface.absentPaths.some((relPath) =>
      relPath.endsWith("/") ? path.startsWith(relPath) : path === relPath,
    ) || (surface.absentSuffixes ?? []).some((suffix) => path.endsWith(suffix));
  // One problem per file, however many of the row's rules it breaks: a
  // re-added `src/memory/__init__.py` is one regression, not two.
  return files.filter(retired).map((path) => ({
    surfaceId: surface.surfaceId,
    message: `  ${surface.surfaceId}: ${path} is tracked but was retired by ${surface.story}`,
  }));
}

export function checkResidue(
  surface: RetiredSurface,
  files: readonly string[],
  repoRoot: string,
): SurfaceProblem[] {
  const problems: SurfaceProblem[] = [];
  const patterns = surface.forbiddenPatterns.map((pattern) => new RegExp(pattern));
  for (const path of files) {
    if (isHistory(path) || path in surface.exemptions) continue;
    if (surface.residueScope && !surface.residueScope.some((prefix) => path.startsWith(prefix))) {
      continue;
    }
    let content: string;
    try {
      content = readFileSync(join(repoRoot, path), "utf8");
    } catch {
      continue; // binaries and unreadable files carry no residue worth reading
    }
    // A NUL byte means a binary git happens to have tracked as readable text.
    if (content.includes("\0")) continue;
    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        const line = (content.slice(0, match.index).match(/\n/g) ?? []).length + 1;
        problems.push({
          surfaceId: surface.surfaceId,
          message: `  ${surface.surfaceId}: ${path}:${line} mentions \`${match[0]}\`, retired by ${surface.story}`,
        });
        break;
      }
    }
  }
  return problems;
}

export interface SweepOptions {
  /** Grade staged rows too, without enforcing them. Used by the self-test. */
  readonly includeStaged?: boolean;
  /** Restrict the sweep to one surface id. Used by the self-test. */
  readonly only?: string;
}

export function sweep(
  repoRoot: string,
  surfaces: readonly RetiredSurface[] = RETIRED,
  options: SweepOptions = {},
): SurfaceProblem[] {
  const files = trackedFiles(repoRoot);
  const problems: SurfaceProblem[] = [];
  for (const surface of surfaces) {
    if (options.only && surface.surfaceId !== options.only) continue;
    if (surface.stagedUntil && !options.includeStaged && !options.only) continue;
    problems.push(...checkAbsent(surface, files));
    problems.push(...checkResidue(surface, files, repoRoot));
  }
  return problems;
}

export const ENFORCED: readonly RetiredSurface[] = RETIRED.filter((s) => !s.stagedUntil);
export const STAGED: readonly RetiredSurface[] = RETIRED.filter((s) => s.stagedUntil);
