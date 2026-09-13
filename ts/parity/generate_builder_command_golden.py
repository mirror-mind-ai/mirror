"""Generate the `build inspect-method` / `pull-candidates` command golden.

CV22.DS7.US8 plateau 1. Everything before this graded FUNCTIONS; this grades the
two leaves as a Navigator invokes them: argv in, stdout/stderr/exit code out.

That distinction has already earned its keep. Python composes the
pull-candidates output as::

    print("\\n".join(part.rstrip() for part in rendered) + "\\n")

and `print` appends a newline of its own, so the real stdout ends with TWO
newlines. A port that reproduces the expression and forgets `print` is one byte
short on every invocation, and no function-level golden can see it -- which is
exactly why `build.py`'s `main()` is driven here instead of the renderers.

The three guards are graded in their real ORDER, because the order is behavior:
method first, then journey resolution, then journey existence, then adoption. So
`--method bogus` with no journey reports the METHOD error, while a good method
with no resolvable journey reports the JOURNEY one. A port that resolves the
journey first swaps them.

Journey resolution is exercised through the operating-mode row rather than
`--journey`, since "the active Builder Mode journey" is the path every skill
invocation actually takes, and it must ignore a journey attached to any OTHER
mode.

Run:  uv run python ts/parity/generate_builder_command_golden.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "test" / "fixtures" / "builder-command"
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-command.golden.json"

# A small roadmap so `pull-candidates` has something to render, with one CV, one
# recommended user story, and one delivery story.
PROJECT_FILES: dict[str, str] = {
    "docs/project/roadmap/index.md": """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| CV1 | First value | \U0001f7e2 Active |
""",
    "docs/project/roadmap/cv1-first/index.md": """# CV1 — First value

**Status:** \U0001f7e2 Active
""",
    "docs/project/roadmap/cv1-first/cv1-ds1-delivery/index.md": """# CV1.DS1 — A delivery story

**Status:** \U0001f7e1 Planned
**Type:** Delivery Story
""",
    "docs/project/roadmap/cv1-first/cv1-ds1-delivery/cv1-ds1-us1-story/index.md": (
        "# CV1.DS1.US1 \u2014 A user story\n\n**Status:** \U0001f7e1 Planned\n**Type:** User Story\n"
    ),
}

SESSION_ID = "builder-command-session"


def write_project(root: Path) -> None:
    for relative, content in PROJECT_FILES.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def _seed(home: Path, project: Path, *, scenario: str) -> None:
    """Seed a disposable mirror home for one scenario."""
    from memory.builder.method_adoption import set_adopted_method
    from memory.client import MemoryClient
    from memory.services.operating_mode import activate_mode

    mem = MemoryClient(env="test", db_path=home / "memory.db")
    if scenario != "no_journey_identity":
        mem.set_identity("journey", "demo", "# Demo journey\n\nA journey for the golden.\n")
        # The project path is the `journey` row's METADATA, not a `journey_path`
        # row (`JourneyService.set_project_path` -> `update_identity_metadata`).
        # An earlier version of this generator "removed" it by deleting from a
        # `journey_path` layer, which was a silent no-op: the no-project-path case
        # ran with a project path and proved nothing.
        if scenario != "adopted_no_project":
            mem.journeys.set_project_path("demo", str(project))
    if scenario in {
        "adopted",
        "adopted_no_project",
        "no_journey_identity",
        "other_mode",
        "mode_without_journey",
    }:
        set_adopted_method(mem.store, "demo", "ariad")
    if scenario == "adopted_other_method":
        set_adopted_method(mem.store, "demo", "scrumban")

    if scenario == "other_mode":
        # A journey attached to Mirror Mode must NOT resolve for Builder.
        activate_mode(mem.store, mode="Mirror Mode", journey="demo", session_id=SESSION_ID)
    elif scenario == "mode_without_journey":
        activate_mode(mem.store, mode="Builder Mode", journey=None, session_id=SESSION_ID)
    elif scenario != "no_active_mode":
        activate_mode(mem.store, mode="Builder Mode", journey="demo", session_id=SESSION_ID)
    mem.store.conn.commit()


def _run(home: Path, argv: list[str]) -> dict[str, Any]:
    """Invoke the real CLI in a SUBPROCESS, one per case.

    In-process invocation cannot work here: `memory.config` resolves `DB_PATH`
    once, at import, into a module-level constant, so every case after the first
    in a shared process would read the first case's database. Measured, not
    assumed -- the first attempt at this generator recorded
    `Error: journey 'demo' not found.` for fifteen cases that were correctly
    seeded.

    A subprocess is also the more honest oracle: it grades the exit code and the
    stream split as a shell sees them, which is what the Navigator and every skill
    invocation actually observe.
    """
    environment = dict(os.environ)
    environment["DB_PATH"] = str(home / "memory.db")
    environment["MIRROR_HOME"] = str(home)
    environment["MEMORY_ENV"] = "test"
    environment.pop("MIRROR_SESSION_ID", None)
    # `src` on the path so `-m memory` resolves without an install step.
    environment["PYTHONPATH"] = str(HERE.parent.parent / "src")
    completed = subprocess.run(
        [sys.executable, "-m", "memory", "build", *argv],
        capture_output=True,
        text=True,
        env=environment,
        cwd=str(HERE.parent.parent),
        check=False,
    )
    return {
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "exit_code": completed.returncode,
    }


CASES: list[tuple[str, str, list[str]]] = [
    # (name, seeded scenario, argv)
    ("inspect_method_ariad", "adopted", ["inspect-method", "ariad"]),
    ("inspect_method_unknown", "adopted", ["inspect-method", "bogus"]),
    ("inspect_method_journey_adopted", "adopted", ["inspect-method", "--journey", "demo"]),
    ("inspect_method_journey_unadopted", "unadopted", ["inspect-method", "--journey", "demo"]),
    (
        "inspect_method_journey_other_method",
        "adopted_other_method",
        ["inspect-method", "--journey", "demo"],
    ),
    ("inspect_method_journey_missing", "unadopted", ["inspect-method", "--journey", "nope"]),
    # The positional method is IGNORED when --journey is given.
    (
        "inspect_method_both_method_and_journey",
        "adopted",
        ["inspect-method", "ariad", "--journey", "demo"],
    ),
    # No positional method: resolve through the active Builder journey.
    (
        "inspect_method_active_builder_journey",
        "adopted",
        ["inspect-method", "--session-id", SESSION_ID],
    ),
    (
        "inspect_method_no_active_mode",
        "no_active_mode",
        ["inspect-method", "--session-id", "absent"],
    ),
    ("inspect_method_other_mode", "other_mode", ["inspect-method", "--session-id", SESSION_ID]),
    (
        "inspect_method_mode_without_journey",
        "mode_without_journey",
        ["inspect-method", "--session-id", SESSION_ID],
    ),
    # pull-candidates
    (
        "pull_candidates_explicit_journey",
        "adopted",
        ["pull-candidates", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "pull_candidates_via_active_mode",
        "adopted",
        ["pull-candidates", "--method", "ariad", "--session-id", SESSION_ID],
    ),
    # Guard order: an unknown method beats an unresolvable journey.
    (
        "pull_candidates_unknown_method_no_journey",
        "no_active_mode",
        ["pull-candidates", "--method", "bogus", "--session-id", "absent"],
    ),
    (
        "pull_candidates_no_journey",
        "no_active_mode",
        ["pull-candidates", "--method", "ariad", "--session-id", "absent"],
    ),
    (
        "pull_candidates_journey_missing",
        "unadopted",
        ["pull-candidates", "--method", "ariad", "--journey", "nope"],
    ),
    (
        "pull_candidates_not_adopted",
        "unadopted",
        ["pull-candidates", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "pull_candidates_adopted_other_method",
        "adopted_other_method",
        ["pull-candidates", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "pull_candidates_other_mode",
        "other_mode",
        ["pull-candidates", "--method", "ariad", "--session-id", SESSION_ID],
    ),
    # An adopted journey with NO project path: the surfaces render their empty
    # shapes rather than failing.
    (
        "pull_candidates_no_project_path",
        "adopted_no_project",
        ["pull-candidates", "--method", "ariad", "--journey", "demo"],
    ),
]


def build_cases() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for name, scenario, argv in CASES:
        tmp = Path(tempfile.mkdtemp(prefix="builder-command-"))
        try:
            home = tmp / "home"
            home.mkdir(parents=True, exist_ok=True)
            project = tmp / "project"
            write_project(project)
            os.environ["DB_PATH"] = str(home / "memory.db")
            os.environ.pop("MIRROR_SESSION_ID", None)
            _seed(home, project, scenario=scenario)
            outcome = _run(home, argv)
            results.append(
                {
                    "name": name,
                    "scenario": scenario,
                    "argv": argv,
                    "session_id": SESSION_ID,
                    **outcome,
                }
            )
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return results


def main() -> None:
    if FIXTURES.exists():
        shutil.rmtree(FIXTURES)
    write_project(FIXTURES / "project")
    cases = build_cases()
    payload = {"cases": cases}
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    for marker in ("/Users/", "/home/runner", "/private/var", "/tmp/builder-command"):
        if marker in text:
            raise SystemExit(
                f"refusing to write a machine-dependent golden: it contains {marker!r}. "
                "A temp path reached the recorded output."
            )
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")
    failures = sum(1 for case in cases if case["exit_code"] != 0)
    print(f"{len(cases)} cases: {len(cases) - failures} ok, {failures} refused")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")
    print(f"wrote {FIXTURES.relative_to(HERE.parent.parent)}/")


if __name__ == "__main__":
    main()
