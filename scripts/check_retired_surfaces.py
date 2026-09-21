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
    "scripts/check_retired_surfaces.py",
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
