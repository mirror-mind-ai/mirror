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

/**
 * Every shape in which a line of text can tell someone to run the deleted
 * Python core: the interpreter by any name it was invoked under, `uv` itself,
 * and the core as an importable package -- the shape the runtime hooks used,
 * which no command-level pattern can see.
 *
 * Exported because two things need the same list: the `python-core-mentions`
 * row below, which reads the TRACKED FILES, and the tests that grade what the
 * product PRINTS -- an updater recommendation or a recovery route that sends a
 * user back to the interpreter is the same residue, one step later, and no
 * file scan can see a string the code assembles at runtime.
 */
export const INTERPRETER_INVOCATIONS: readonly string[] = [
  // The interpreter, by any name it is invoked under.
  "uv run python",
  "python3? -m memory\\b",
  "python3? -c ",
  "\\buv (run|sync)\\b",
  // The core as an importable Python package.
  "from memory\\.",
  "from memory import",
  "import memory\\b",
  "memory\\.hooks",
];

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
      "docs/product/extensions/api-reference.md":
        "documents the removal for an extension author reading an older copy",
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
    exemptions: {},
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
    exemptions: {},
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
      "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of those refusals",
      "scripts/ts5/capture_family_outputs.sh":
        "CV22.DS10.TS5 captures the refusal itself as a command family: the cutoff answer is a user-visible surface, so it is hashed before the deletion and replayed after it",
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
    forbiddenPatterns: INTERPRETER_INVOCATIONS,
    exemptions: {
      // Re-homed to US3 by US2 decision D4, because their new shape depends on
      // the npm artifact's `bin` and install path. Named here so the
      // zero-Python claim cannot be made for the shipped artifact while they
      // stand -- an exemption that expires, not one that hides.
      //
      // Not the only US3 residue: `frame/main/command-registry.js` spawns the
      // interpreter eight times, but builds each argv as an array, so no
      // pattern here matches it and it needs no exemption. The DS10 gate
      // table and TS5's known risks carry it by name.
      "installer/configure.ps1":
        "interpreter calls re-homed to CV22.DS10.US3 (US2 decision D4): the installer assumes a uv-bearing clone. TS5 claims zero Python for the REPOSITORY, US3 claims it for the ARTIFACT",
      "installer/health-check.ps1": "same US3 re-homing",
      "installer/bootstrap.ps1":
        "same US3 re-homing: the bootstrap installs uv and syncs the clone",
      "installer/lib/MirrorInstall.psm1":
        "same US3 re-homing: the install library syncs the clone with uv",
      "frame/main/session-gate.js":
        "same US3 re-homing: the Frame's update gate describes the uv-bearing install it orchestrates",
      "scripts/ci-nonascii-profile-smoke.ps1":
        "same US3 re-homing: the Windows installer's profile smoke drives the uv-bearing install end to end",
      // The installer's own design record describes the installer as it still
      // is. Rewriting it before US3 decides what the installer becomes would
      // make it describe nothing.
      "docs/installer/README.md":
        "documents the Windows installer, which installs a uv-bearing clone until CV22.DS10.US3 re-homes it",
      "docs/installer/RESUME.md": "same installer documentation, same US3 re-homing",
      "docs/installer/analysis-two-routes.md": "same installer documentation, same US3 re-homing",
      "docs/installer/plan.md": "same installer documentation, same US3 re-homing",
      "docs/installer/windows-compatibility.md": "same installer documentation, same US3 re-homing",
      // Checks whose job is to name what they forbid. The table's own file is
      // history for the same reason (HISTORY_PREFIXES).
      "ts/scripts/checkSkillCommandParity.ts":
        "a guard: its pattern IS the retired invocation it forbids in the skills, as this table's own patterns are here",
      "scripts/smoke_runtime_update.sh":
        "a negative check: the smoke FAILS if the updater's output still tells a user to run the interpreter",
      // Frozen fixtures. Their bytes are the record; see ts/test/goldens/README.md.
      "ts/test/goldens/README.md":
        "the frozen goldens' changelog: its D12 row names the retired invocation that substitution replaced",
      "ts/test/goldens/builder-command.golden.json":
        "recorded fixture INPUT, not product output: a scenario passes `validate-item --check` a caller's own check command, and the golden records the argv and the validation artifact that echoes it",
      "ts/test/goldens/builder-lifecycle.golden.json":
        "the same caller-supplied check command, recorded as `automated_checks` input across the lifecycle scenarios",
      // An extension may own any executable runtime, including Python. TS2's
      // cutoff says so explicitly. Forbidding the documentation of that would
      // forbid the contract.
      "docs/product/extensions/authoring-guide.md":
        "documents that an extension may declare a Python runtime of its own; the core owning Python is what retired, not extensions choosing it",
      "docs/product/extensions/testing-guide.md": "same contract, from the testing side",
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
