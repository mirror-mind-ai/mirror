#!/usr/bin/env python3
"""Fail CI when a surface CV22.DS10 retired comes back, or never fully left.

DS10 removes five surfaces rather than porting them: the projection subsystem
(TS1), the web console (US1), the extension compatibility host (TS2), the eval
harness's Python home (TS3), and a set of unported commands (TS4). Each deletion
is large, touches many files, and is easy to leave half-done -- a dangling import,
a `--help` row, a skill still naming the command, a test that patches a module
nobody has anymore.

A deletion has no test of its own. This is that test: one table, one sweep, and a
row added by each retiring story. It checks two things per surface:

  * ABSENCE -- every path the story deleted is still gone.
  * NO RESIDUE -- no tracked file mentions the surface, except where a mention is
    the point: the roadmap, decisions, debt, refinement, and release notes, which
    exist to record that it was retired and why.

What it deliberately does NOT do: prove the deletion was correct. The suites do
that. This proves it was COMPLETE, and stays complete.

Usage:
    python scripts/check_retired_surfaces.py
"""

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Mentions are expected -- and required -- in the documents whose job is to record
# the retirement. Everything else is residue.
HISTORY_PREFIXES = (
    # Everything under `docs/project/` is the project's record of itself --
    # roadmap, decisions, debt, refinement, audits, briefing. A retired surface
    # is supposed to be named there.
    "docs/project/",
    "docs/process/worklog.md",
    "docs/releases/",
    # A guard's own table is the one file that must name every retired surface:
    # the patterns ARE the data. Python has always self-exempted; CV22.DS10.TS5
    # adds its Node port and that port's self-test for the same reason, and
    # deletes this Python file at plateau 3.
    "scripts/check_retired_surfaces.py",
    "ts/src/guards/retiredSurfaces.ts",
    "ts/test/scripts/retiredSurfaces.test.ts",
)


@dataclass(frozen=True)
class RetiredSurface:
    """One surface DS10 removed, and the evidence that it stayed removed."""

    surface_id: str
    story: str
    #: Paths that must not exist. Directories end with `/`.
    absent_paths: tuple[str, ...]
    #: Regexes that must not appear in tracked files outside HISTORY_PREFIXES.
    forbidden_patterns: tuple[str, ...]
    #: Paths allowed to mention the surface beyond the history prefixes, with why.
    exemptions: dict[str, str] = field(default_factory=dict)


RETIRED: tuple[RetiredSurface, ...] = (
    RetiredSurface(
        surface_id="journey-projections",
        story="CV22.DS10.TS1",
        absent_paths=(
            "src/memory/journey_projections/",
            "src/memory/cli/journey_projection.py",
            "ts/src/explorer/projectionRefresh.ts",
            "tests/unit/memory/journey_projections/",
            "tests/integration/memory/journey_projections/",
            "tests/fixtures/journey_projections/",
        ),
        forbidden_patterns=(
            r"journey_projections",
            r"journey-projection\b",
            r"createPythonProjectionRefresh",
            r"requestProjectionRefresh",
            # The API names, not just the module names. CI found
            # `configure_projection_refresh` surviving in `ts/parity/` after the
            # first version of this table missed it: the patterns were written
            # from the files the deletion touched, which is the one place residue
            # cannot be.
            r"configure_projection_refresh",
            r"request_projection_refresh",
        ),
        exemptions={
            "src/memory/extensions/api.py": (
                "the deliberate refusal that tells an extension the capability was removed"
            ),
            "tests/unit/memory/extensions/test_loader.py": "the test of that refusal",
            "ts/test/builder/cursor.test.ts": (
                "asserts TypeScript requests no refresh against the oracle's recording"
            ),
            "ts/test/builder/lifecycle.test.ts": (
                "documents why the corpus field is no longer asserted (D-019)"
            ),
            "ts/test/goldens/builder-cursor.golden.json": "the recorded Python oracle",
            "src/memory/oracle_drift.py": "a comment naming a function that used to exist",
            "docs/product/extensions/api-reference.md": (
                "documents the removal for an extension author reading an older copy"
            ),
            "src/memory/extensions/version.py": (
                "decision D-018 names the removed capability to explain why VERSION is "
                "frozen at 1.1 rather than bumped"
            ),
        },
    ),
    RetiredSurface(
        surface_id="web-console",
        story="CV22.DS10.US1",
        absent_paths=(
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
        ),
        forbidden_patterns=(
            r"memory\.web\b",
            r"memory web\b",
            r"SurfaceService",
            r"intelligence\.scene\b",
            r"WorkspaceSurface|AtlasSurface|EvidenceSurface|SearchSurface|ObjectDetailSurface",
        ),
        exemptions={},
    ),
    RetiredSurface(
        surface_id="compat-host",
        story="CV22.DS10.TS2",
        # Gate items 2 and 5 in one mechanical place: item 2 asks that the
        # packaged artifact carry no core-owned Python extension bridge, and
        # item 5 that every retained provider and command enter through a
        # declared language-neutral runtime. Both reduce to the same claim --
        # the host and every launcher branch for it are gone -- and this check
        # runs over the tracked file set the package is built from.
        absent_paths=(
            "src/memory/extensions/compat_host.py",
            "tests/unit/memory/extensions/test_compat_host.py",
            "ts/parity/generate_ext_dispatch_golden.py",
            "ts/test/fixtures/ext-dispatch.golden.json",
        ),
        forbidden_patterns=(
            r"compat_host",
            r"compat-host",
            # The launcher seams, not only the module. The TS1 lesson: residue
            # hides in the names of the things that CALLED the deleted code,
            # which is the one place the deletion diff cannot show it.
            r"validate_register",
            r"validateExtensionRegister",
            r"legacyCommand",
            r"legacyCwd",
            r"hostCommand",
            r"spawnHost",
            # The generator and the corpus it recorded. `absent_paths` proves
            # the FILES are gone; these prove nothing still CALLS them. CI
            # found the gap the hard way on 2026-09-22: the determinism step
            # kept invoking the deleted generator and failed on Python 3.10
            # and 3.12 after the files had been removed for four commits.
            r"generate_ext_dispatch_golden",
            r"ext-dispatch\.golden",
        ),
        exemptions={
            "src/memory/oracle_drift.py": (
                "a comment recording that the bridge was tracked here until TS2 deleted it"
            ),
            "ts/test/extensions/dispatch.test.ts": (
                "the file that REPLACED the host's parity corpus, and whose header records "
                "what each retired group of cases proved -- the disposition itself"
            ),
        },
    ),
    RetiredSurface(
        surface_id="eval-harness",
        story="CV22.DS10.TS3",
        # The model-behavior release gate moved to ts/evals/ and the Python
        # harness was deleted with its tests, its entry point, and the three
        # helpers that existed only to feed the port: the input capture, the
        # fixture-equality check, and the support-golden generator. Each of
        # those imported what this story removed, so they die with it -- the
        # fixture and its oracle die together, as in TS2.
        absent_paths=(
            "evals/",
            "tests/unit/memory/evals/",
        ),
        forbidden_patterns=(
            r"from evals\b",
            r"import evals\b",
            r"memory eval\b",
            r"evals\.runner",
            r"evals\._support",
            # The helpers by name: absent_paths proves the FILES are gone,
            # these prove nothing still calls them -- the TS2 lesson, where a
            # CI step kept invoking a deleted generator for four commits.
            r"_capture_probe_inputs",
            r"_check_fixture_equality",
            r"_generate_support_golden",
        ),
        exemptions={
            "docs/process/development-guide.md": (
                "the guide now names ts/evals/ and npm run eval; the phrase survives only "
                "where it explains what the Python era measured and why the denominator moved"
            ),
        },
    ),
    # CV22.DS10.TS4 retired five surfaces, so it contributes five rows rather
    # than one. They are separate because they fail separately: a resurrected
    # `migrate-legacy` and a resurrected Workbench verb are different mistakes
    # with different fixes, and one row naming both would report the wrong one.
    #
    # Every pattern below is a COMMAND SHAPE or a MODULE NAME, never bare
    # vocabulary. `mutate`, `change-request`, and `refinement-story` are living
    # Ariad words -- the file-first Refinement flow, the mm-build skill, and the
    # TypeScript builder surfaces all use them correctly -- so a guard matching
    # the words alone would be red on the day it landed and would then be
    # weakened with exemptions until it meant nothing.
    RetiredSurface(
        surface_id="legacy-migration",
        story="CV22.DS10.TS4",
        absent_paths=(
            "src/memory/cli/migrate_legacy.py",
            "src/memory/cli/migration_rehearsal.py",
            "tests/unit/memory/cli/test_migrate_legacy.py",
            "tests/unit/memory/cli/test_migration_rehearsal.py",
        ),
        forbidden_patterns=(
            r"migrate_legacy",
            r"migration_rehearsal",
            r"memory-rehearse-migration",
            r"memory migrate-legacy",
        ),
        exemptions={
            "docs/product/extensions/migrations.md": (
                "`ext <id> migrate-legacy` is an EXTENSION-owned subcommand name that an "
                "extension author may still choose; it never referred to the core command"
            ),
            "ts/src/frontDoor/routing.ts": "the retired entry that answers the name",
            "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of that refusal",
            "tests/unit/memory/test_main.py": (
                "asserts the dispatcher no longer knows the name"
            ),
        },
    ),
    RetiredSurface(
        surface_id="journey-admin-verbs",
        story="CV22.DS10.TS4",
        absent_paths=(
            "src/memory/services/journey_admin.py",
            "src/memory/storage/journey_admin.py",
            "tests/unit/memory/services/test_journey_admin.py",
        ),
        forbidden_patterns=(
            r"journey_admin",
            r"JourneyAdmin",
            r"journey export-registry",
            r"journey mutate\b",
            r"mirror\.journey-mutation@",
        ),
        exemptions={
            "ts/src/frontDoor/routing.ts": "the retired entries that answer the two verbs",
            "ts/src/frontDoor/cli.ts": (
                "the refusal itself; the comment names the write verb to explain why it "
                "must answer BEFORE stdin is read, which is the property under test"
            ),
            "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of those refusals",
            "tests/unit/memory/cli/test_journey.py": (
                "asserts the verbs reach no service and consume no stdin"
            ),
            "src/memory/oracle_drift.py": (
                "a comment recording that the two verbs used to be tracked here"
            ),
        },
    ),
    RetiredSurface(
        surface_id="conversation-metadata-backfill",
        story="CV22.DS10.TS4",
        absent_paths=(),
        forbidden_patterns=(
            # The flags and the two service methods. NOT the bare word
            # `backfill`: `conversation-logger backfill-pi-sessions` and
            # `ts/src/conversation/backfill.ts` are the TRANSCRIPT backfills,
            # a different feature that is ported and staying.
            r"--metadata-backfill-",
            r"metadata_backfill",
            r"preview_metadata_backfill",
            r"apply_metadata_backfill",
        ),
        exemptions={
            "ts/src/frontDoor/routing.ts": "the retired entries that answer the two flags",
            "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of those refusals",
            "ts/test/frontDoor/routing.test.ts": (
                "asserts the flags are retired whatever the lifecycle gate says"
            ),
            "scripts/ts5/capture_family_outputs.sh": (
                "CV22.DS10.TS5 captures the refusal itself as a command family: the "
                "cutoff answer is a user-visible surface, so it is hashed before the "
                "deletion and replayed after it"
            ),
        },
    ),
    RetiredSurface(
        surface_id="sqlite-refinement-workbench",
        story="CV22.DS10.TS4",
        absent_paths=(
            "src/memory/builder/workbench.py",
            "src/memory/builder/workbench_surfaces.py",
            "src/memory/storage/builder_workbench.py",
            "ts/src/builder/workbenchSnapshot.ts",
            "tests/unit/memory/builder/test_workbench.py",
            "tests/unit/memory/storage/test_builder_workbench_store.py",
        ),
        forbidden_patterns=(
            r"workbench_surfaces",
            r"BuilderWorkbenchStore",
            r"get_workbench_snapshot",
            r"getWorkbenchSnapshot",
            r"safeWorkbenchSnapshot",
            r"_safe_workbench_snapshot",
            r"workbenchSnapshot",
            r"build refinement-story ",
            r"build change-request ",
            # The surfaces those twenty commands rendered.
            r"CHANGE_REQUEST_CAPTURED",
            r"REFINEMENT_STORY_OVERVIEW",
            r"REFINEMENT_STORY_PULLED",
        ),
        exemptions={
            "ts/src/frontDoor/routing.ts": (
                "TS_BUILD_WORKBENCH_ACTIONS is retained as the NAME LIST the retired "
                "entries match on, which is what keeps the twenty verbs refusable"
            ),
            "ts/test/frontDoor/buildRouting.test.ts": (
                "asserts all twenty names retire, and that the count is still twenty"
            ),
            "ts/test/frontDoor/retiredSurfaces.test.ts": "the test of those refusals",
            "scripts/ts5/capture_family_outputs.sh": (
                "CV22.DS10.TS5 captures the refusal itself as a command family: the "
                "cutoff answer is a user-visible surface, so it is hashed before the "
                "deletion and replayed after it"
            ),
            "tests/unit/memory/cli/test_build.py": (
                "asserts the mm-build skill no longer offers the retired command -- the "
                "mention is the negative assertion itself"
            ),
            "src/memory/db/migrations.py": (
                "migrations 015/016 create the tables and REMAIN applied: the rows are "
                "kept, only the commands were retired"
            ),
            "ts/src/db/migrations.ts": "the same two migrations on the TypeScript side",
            "ts/src/db/schemaState.ts": (
                "still recognizes 015/016 as applied, which is what keeps an existing "
                "database from looking unmigrated"
            ),
            "ts/parity/generate_migration_fixtures.py": "grades those two migrations",
            "ts/parity/generate_runtime_status_golden.py": "lists the applied migration ids",
            "tests/unit/memory/db/test_migrations.py": "tests those two migrations",
            "ts/test/db/migrationFixtures.test.ts": "grades those two migrations",
            "ts/test/db/schemaState.test.ts": "pins 015/016 recognition",
            "src/memory/oracle_drift.py": (
                "a comment recording that workbench.py used to be tracked here"
            ),
        },
    ),
)


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def is_history(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in HISTORY_PREFIXES)


def check_absent(surface: RetiredSurface, files: list[str]) -> list[str]:
    """Tracked paths only.

    Git is the authority on what the repository contains. A leftover
    `__pycache__` beside a deleted module is a stale build artifact on one
    machine, not a surface that came back -- failing on it would teach the
    reader to distrust this check.
    """
    problems: list[str] = []
    for relpath in surface.absent_paths:
        if relpath.endswith("/"):
            found = [path for path in files if path.startswith(relpath)]
        else:
            found = [path for path in files if path == relpath]
        for path in found:
            problems.append(
                f"  {surface.surface_id}: {path} is tracked but was retired by {surface.story}"
            )
    return problems


def check_residue(surface: RetiredSurface, files: list[str]) -> list[str]:
    problems: list[str] = []
    patterns = [re.compile(pattern) for pattern in surface.forbidden_patterns]
    for path in files:
        if is_history(path) or path in surface.exemptions:
            continue
        full = REPO_ROOT / path
        try:
            content = full.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue  # binaries and unreadable files carry no residue worth reading
        for pattern in patterns:
            match = pattern.search(content)
            if match:
                line = content[: match.start()].count("\n") + 1
                problems.append(
                    f"  {surface.surface_id}: {path}:{line} mentions "
                    f"`{match.group(0)}`, retired by {surface.story}"
                )
                break
    return problems


def main() -> int:
    files = tracked_files()
    problems: list[str] = []
    for surface in RETIRED:
        problems.extend(check_absent(surface, files))
        problems.extend(check_residue(surface, files))

    if problems:
        print("retired-surface check: RESIDUE FOUND\n")
        print("\n".join(problems))
        print(
            "\nRemediation: finish the deletion, or -- if the mention is deliberate and"
            "\npermanent -- add the path to that surface's `exemptions` with the reason."
            "\nAn exemption is a claim that a mention is correct, so it must say why."
        )
        return 1

    surfaces = ", ".join(surface.surface_id for surface in RETIRED)
    print(f"retired-surface check: clean -- {surfaces} stayed retired.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
