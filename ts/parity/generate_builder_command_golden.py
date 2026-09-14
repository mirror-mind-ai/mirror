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

Plateau 3 adds the five story-lifecycle leaves -- `pull-item`, `prepare-item`,
`plan-item`, `approve-plan`, `cancel-plan-preauthorization` -- which are the first
commands here that WRITE INTO THE NAVIGATOR'S PROJECT. Two consequences:

- cases that materialize files record a `project_files` snapshot, because the
  files are the behavior; `prepare_templates` already established the pattern and
  the preservation rule (`if not path.exists()`) is what it protects;
- `plan_checkpoint` and `expand_blocked` print ABSOLUTE paths, so those outputs
  are routed through `builder_surface_paths`, which collapses wrapped path rows to
  a stable token and rewrites untruncated paths as project-relative. That module
  explains why a plain token substitution cannot work on a truncated card row.

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

import builder_surface_paths as surface_paths

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

# A Delivery Story package whose candidate table IS canonical, written only for the
# scenarios that pull a Delivery Story. It is deliberately not part of
# PROJECT_FILES: adding a second delivery story there would rewrite every recorded
# `pull-candidates` output and bury the plateau-3 diff in unrelated churn.
PULLABLE_DS_INDEX = """# CV1.DS2 \u2014 Pullable delivery story

**Status:** \U0001f7e1 Planned
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS2.US1 | Port the first slice | User Story | \U0001f7e1 Planned |
| CV1.DS2.TS1 | Harden the seam | Technical Story | \U0001f7e1 Planned |

## Done Condition

Done when the children deliver a coherent outcome.
"""

# The complete authored Plan a preauthorization receipt requires before it can be
# consumed: every section in STORY_PLAN_REQUIRED_SECTIONS present and non-empty.
COMPLETE_PLAN = """# Plan \u2014 CV1.US1

## Objective

Deliver the slice.

## Scope

- Bind one active story structurally.

## Non-Goals

- No sibling scope.

## Acceptance Behavior

Given exact authority
When approval is consumed
Then implementation starts once.

## Validation Route

- Run focused tests and Navigator validation.

## Implementation Contract

- Use TDD and stop at Navigator Validation.
"""


def write_project(root: Path) -> None:
    for relative, content in PROJECT_FILES.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def _seed(home: Path, project: Path, *, scenario: str) -> None:
    """Seed a disposable mirror home for one scenario."""
    from memory.builder.delivery_cursor import set_delivery_cursor
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
        # `adopted_cursor_no_project` must reach `Delivery Story expansion requires
        # project_path`, which sits AFTER the cursor guard, so it needs a cursor and
        # no project path. Writing an EMPTY project path does not achieve that: the
        # first attempt did exactly that, the row kept its earlier value, the case
        # expanded successfully and proved nothing. The path row must never be
        # written at all.
        if scenario not in {"adopted_no_project", "adopted_cursor_no_project"}:
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
    if scenario in {"adopted_with_templates", "adopted_with_cursor", "adopted_plan_approved"}:
        set_adopted_method(mem.store, "demo", "ariad")
    if scenario == "adopted_with_templates":
        # Two of the nine templates already exist, with content a Navigator
        # authored. `prepare-templates` must PRESERVE them and create the rest.
        for relative in (
            "docs/project/roadmap/ariad-adoption.md",
            "docs/project/roadmap/templates/plan.md",
        ):
            target = project / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("# Authored by a human, must survive\n", encoding="utf-8")
    if scenario == "adopted_with_cursor":
        set_delivery_cursor(
            mem.store,
            journey="demo",
            method="ariad",
            active_item="CV1.US1",
            last_delivery_event="pulled",
            cursor_generation=4,
        )
    if scenario == "adopted_plan_approved":
        set_delivery_cursor(
            mem.store,
            journey="demo",
            method="ariad",
            active_item="CV1.US1",
            last_delivery_event="plan_approved",
        )
    if scenario in _LIFECYCLE_SCENARIOS:
        _seed_lifecycle(mem, project, scenario=scenario)

    if scenario == "other_mode":
        # A journey attached to Mirror Mode must NOT resolve for Builder.
        activate_mode(mem.store, mode="Mirror Mode", journey="demo", session_id=SESSION_ID)
    elif scenario == "mode_without_journey":
        activate_mode(mem.store, mode="Builder Mode", journey=None, session_id=SESSION_ID)
    elif scenario != "no_active_mode":
        activate_mode(mem.store, mode="Builder Mode", journey="demo", session_id=SESSION_ID)
    mem.store.conn.commit()


# Scenarios added at plateau 3 for the five story-lifecycle leaves. Each one seeds
# the exact cursor state its leaf's guard requires, so the refusals are graded as
# the guards Python actually runs rather than as a single generic error.
_LIFECYCLE_SCENARIOS = {
    "adopted_closure_plan_approved",
    "adopted_closure_validated",
    "adopted_closure_reviewed",
    "adopted_closure_pending_validation",
    "adopted_cursor_empty",
    "adopted_cursor_no_project",
    "adopted_ds_pullable",
    "adopted_pulled",
    "adopted_prepared",
    "adopted_prepared_ds",
    "adopted_plan_pending",
    "adopted_preauthorized",
    # Plateau 6, the cadence scenarios: a cursor mid-closure carrying a cadence
    # profile, which is what `continue-lifecycle` reads before deciding whether
    # any continuation is bypassable at all.
    "adopted_cadence_checkpoint_reviewed",
    "adopted_cadence_checkpoint_pending",
    "adopted_cadence_autonomous_unlimited",
    "adopted_cadence_checkpoint_prepared",
    # Plateau 5, the aggregate scenarios. `adopted_agg_`, not `adopted_ds_`:
    # `adopted_ds_pullable` already means "a Delivery Story that can be pulled",
    # and a prefix that swallowed it would have re-seeded an existing case.
    "adopted_agg_planned",
    "adopted_agg_pending_approval",
    "adopted_agg_approved",
    "adopted_agg_validated",
    "adopted_agg_reviewed",
    "adopted_agg_children_unfinished",
    "adopted_agg_story_by_story",
}


# The Delivery Story package the aggregate leaves work on, with the two children
# the Done preflight insists on. Authored Done, so the preflight PASSES; the
# refusal case rewrites one status line.
DS_AGGREGATE_INDEX = """# CV1.DS3 \u2014 Aggregate delivery

**Status:** \u2705 Done
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS3.US1 | First child | User Story | \u2705 Done |
| CV1.DS3.TS1 | Second child | Technical Story | \u2705 Done |

## Done Condition

Done when the children deliver a coherent outcome.
"""

DS_AGGREGATE_CHILDREN = ("CV1.DS3.US1", "CV1.DS3.TS1")


def _write_delivery_story_package(project: Path, *, children_done: bool = True) -> None:
    """Author the aggregate package and its children under the disposable project."""
    package = project / "docs/project/roadmap/cv1-first/cv1-ds3-aggregate"
    package.mkdir(parents=True, exist_ok=True)
    (package / "index.md").write_text(DS_AGGREGATE_INDEX, encoding="utf-8")
    status = "\u2705 Done" if children_done else "\U0001f7e1 Planned"
    for code, title, kind in (
        ("CV1.DS3.US1", "First child", "User Story"),
        ("CV1.DS3.TS1", "Second child", "Technical Story"),
    ):
        child = package / f"{code.lower().replace('.', '-')}-child"
        child.mkdir(parents=True, exist_ok=True)
        (child / "index.md").write_text(
            f"# {code} \u2014 {title}\n\n**Status:** {status}\n**Type:** {kind}\n",
            encoding="utf-8",
        )


def _seed_lifecycle(mem: Any, project: Path, *, scenario: str) -> None:
    """Seed adoption plus the delivery cursor state a lifecycle leaf expects."""
    from memory.builder.ariad_method import get_ariad_method
    from memory.builder.delivery_cursor import set_delivery_cursor
    from memory.builder.delivery_story_plan import plan_delivery_story_checkpoint
    from memory.builder.lifecycle import plan_lifecycle_item
    from memory.builder.method_adoption import set_adopted_method

    set_adopted_method(mem.store, "demo", "ariad")
    if scenario.startswith("adopted_cadence_"):
        # Same states the closure scenarios use, plus the cadence fields. Seeded
        # raw for the same reason: they are the guards' INPUTS, and reaching them
        # through `set-cadence` would make the case depend on another leaf.
        profile = "autonomous" if scenario.endswith("autonomous_unlimited") else "checkpoint"
        pending = scenario.endswith("checkpoint_pending")
        event = "prepare" if scenario.endswith("checkpoint_prepared") else "review_complete"
        set_delivery_cursor(
            mem.store,
            journey="demo",
            method="ariad",
            active_item="CV1.DS1.US1",
            active_item_title="A user story",
            active_item_level="user_story",
            active_checkpoint="after_validation" if pending else None,
            pending_confirmation="navigator_debt_decision" if pending else None,
            last_delivery_event=event,
            cadence_profile=profile,
            navigator_flow_unit="story_by_story",
        )
        return
    if scenario.startswith("adopted_agg_"):
        # The aggregate scenarios (plateau 5). Every one of them authors the package
        # tree first, because the Done preflight reads authored CONTENT rather than
        # cursor state -- it is the only Builder guard whose input is the
        # Navigator's repository.
        _write_delivery_story_package(
            project, children_done=scenario != "adopted_agg_children_unfinished"
        )
        flow_unit = (
            "story_by_story" if scenario == "adopted_agg_story_by_story" else "delivery_story"
        )
        base = {
            "journey": "demo",
            "method": "ariad",
            "active_item": "CV1.DS3",
            "active_item_title": "Aggregate delivery",
            "active_item_level": "delivery_story",
            "navigator_flow_unit": flow_unit,
            "child_work_items": DS_AGGREGATE_CHILDREN,
        }
        status_by_scenario: dict[str, tuple[str, ...]] = {
            "adopted_agg_planned": (),
            "adopted_agg_story_by_story": (),
            "adopted_agg_approved": ("plan:approved",),
            "adopted_agg_validated": ("plan:approved", "validation:passed"),
            "adopted_agg_reviewed": (
                "plan:approved",
                "validation:passed",
                "debt_review:review:no_action",
            ),
            "adopted_agg_children_unfinished": (
                "plan:approved",
                "validation:passed",
                "debt_review:review:no_action",
            ),
        }
        if scenario == "adopted_agg_pending_approval":
            # A real pending DS Plan checkpoint, created by the real Plan: a
            # hand-written checkpoint would not carry a receipt Python accepts.
            set_delivery_cursor(mem.store, last_delivery_event="prepare", **base)
            plan_delivery_story_checkpoint(
                mem.store,
                journey="demo",
                method="ariad",
                objective="Deliver both children as one coherent outcome.",
                child_work_items=DS_AGGREGATE_CHILDREN,
                plan_artifact_path=(
                    project
                    / "docs/project/roadmap/cv1-first/cv1-ds3-aggregate/plan.md"
                ),
            )
            return
        set_delivery_cursor(
            mem.store,
            last_delivery_event="prepare",
            aggregate_checkpoint_status=status_by_scenario[scenario],
            **base,
        )
        return
    if scenario in {"adopted_cursor_empty", "adopted_cursor_no_project"}:
        # A cursor with no active item: reaches the guards that sit BEHIND the
        # cursor guard -- `active item is required before prepare`, and the
        # project-path refusal for a Delivery Story pull.
        set_delivery_cursor(mem.store, journey="demo", method="ariad")
        return
    if scenario == "adopted_ds_pullable":
        target = project / "docs/project/roadmap/cv1-first/cv1-ds2-pullable/index.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(PULLABLE_DS_INDEX, encoding="utf-8")
        set_delivery_cursor(mem.store, journey="demo", method="ariad")
        return
    if scenario == "adopted_pulled":
        set_delivery_cursor(
            mem.store,
            journey="demo",
            method="ariad",
            active_item="CV1.DS1.US1",
            active_item_title="A user story",
            active_item_level="user_story",
            last_delivery_event="pull",
        )
        return
    if scenario in {
        "adopted_closure_plan_approved",
        "adopted_closure_validated",
        "adopted_closure_reviewed",
        "adopted_closure_pending_validation",
    }:
        # The closure leaves start from a cursor mid-closure. Seeded as raw cursor
        # states rather than by replaying the lifecycle: the states are the guards'
        # inputs, and reaching them through the verbs would make the seed depend on
        # the very behavior the case grades.
        event = {
            # Validation starts from an APPROVED PLAN. Using `adopted_prepared` here
            # was the first attempt, and all three validate cases refused with
            # `Validation requires an approved Plan and completed implementation` --
            # a real guard, but one case already covers it, and the other two proved
            # nothing about the behavior they were written for.
            "adopted_closure_plan_approved": "plan_approved",
            "adopted_closure_validated": "validation_passed",
            "adopted_closure_reviewed": "review_complete",
            "adopted_closure_pending_validation": "validate",
        }[scenario]
        set_delivery_cursor(
            mem.store,
            journey="demo",
            method="ariad",
            active_item="CV1.DS1.US1",
            active_item_title="A user story",
            active_item_level="user_story",
            active_checkpoint="after_validation" if event == "validate" else None,
            pending_confirmation="navigator_validation" if event == "validate" else None,
            last_delivery_event=event,
            navigator_flow_unit="story_by_story",
        )
        return
    if scenario in {"adopted_prepared", "adopted_prepared_ds"}:
        delivery_story = scenario == "adopted_prepared_ds"
        set_delivery_cursor(
            mem.store,
            journey="demo",
            method="ariad",
            active_item="CV1.DS1" if delivery_story else "CV1.DS1.US1",
            active_item_title="A delivery story" if delivery_story else "A user story",
            active_item_level="delivery_story" if delivery_story else "user_story",
            last_delivery_event="prepare",
            navigator_flow_unit="story_by_story",
        )
        return
    # Both remaining scenarios need a real pending Plan checkpoint, so they run the
    # real Plan through the library rather than hand-writing checkpoint fields: a
    # hand-built receipt would not carry a fingerprint Python would accept.
    set_delivery_cursor(
        mem.store,
        journey="demo",
        method="ariad",
        active_item="CV1.DS1.US1",
        active_item_title="A user story",
        active_item_level="user_story",
        last_delivery_event="prepare",
        navigator_flow_unit="story_by_story",
    )
    package = project / "docs/project/roadmap/cv1-first/cv1-ds1-delivery/cv1-ds1-us1-story"
    package.mkdir(parents=True, exist_ok=True)
    plan_path = package / "plan.md"
    plan_path.write_text(COMPLETE_PLAN, encoding="utf-8")
    plan_lifecycle_item(
        mem.store,
        journey="demo",
        method=get_ariad_method(),
        plan_artifact_path=plan_path,
        preauthorize=scenario == "adopted_preauthorized",
    )


def _project_snapshot(project: Path) -> dict[str, str]:
    """Authored project files, project-relative, with their content.

    `.mirror/projections` is deliberately excluded and summarized separately by
    `_projection_summary`. Every Builder cursor write requests a Journey projection
    refresh, and the publisher names each receipt `op-<uuid4>.json` and stamps it,
    so including that tree made this golden differ between two consecutive runs on
    one machine -- caught here rather than by CI's determinism gate. The publisher is
    US7-owned and explicitly out of US8's scope (nothing in TypeScript writes under
    `.mirror/projections`), and the story's evidence contract asserts the PUBLISHED
    FILE in the lifecycle smoke, not in this corpus.
    """
    snapshot: dict[str, str] = {}
    for path in sorted(project.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(project).as_posix()
        if relative.startswith(".mirror/"):
            continue
        snapshot[relative] = path.read_text(encoding="utf-8")
    return snapshot


def _projection_summary(project: Path) -> dict[str, Any]:
    """Projection-seam evidence that is stable: what was published, and how often.

    The receipt COUNT is behavior -- it says the refresh fired at the expected call
    sites, which is what a port can silently lose, since the delegation is
    best-effort and a broken seam is silent. The receipt NAMES and digests are not
    behavior; they are uuid4 and content stamps.
    """
    projections = project / ".mirror" / "projections"
    if not projections.is_dir():
        return {"documents": [], "receipts": 0}
    documents = sorted(
        path.relative_to(projections).as_posix()
        for path in projections.rglob("*")
        if path.is_file() and ".receipts" not in path.parts and path.name != ".publication.lock"
    )
    receipts = sum(1 for path in (projections / ".receipts").rglob("*") if path.is_file())
    return {"documents": documents, "receipts": receipts}


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


def _normalize_paths(outcome: dict[str, Any], project: Path) -> dict[str, Any]:
    """Make absolute project paths in a recorded invocation machine-independent.

    Card rows that WRAP a path collapse to one token row; the unwrapped `*_path=`
    trailer lines and stderr messages are rewritten project-relative, so they stay
    graded exactly. `builder_surface_paths` explains why the two need different
    treatment. `repo_root=project` keeps the rewrite to paths inside the project, so
    an unexpected leak from anywhere else still trips the machine-dependence guard
    in `main`.
    """
    absolute = [str(project), str(project.resolve())]
    for path in project.rglob("*"):
        absolute.append(str(path))
        absolute.append(str(path.resolve()))
    absolute = sorted(set(absolute), key=len, reverse=True)
    stdout = surface_paths.normalize_path_rows(outcome["stdout"], absolute)
    stdout = surface_paths.normalize_trailer_paths(stdout, absolute, project)
    return {
        **outcome,
        "stdout": stdout,
        "stderr": surface_paths.scrub_message(
            outcome["stderr"], project_root=project, repo_root=project
        ),
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
    # adopt
    ("adopt_first_time", "unadopted", ["adopt", "--method", "ariad", "--journey", "demo"]),
    ("adopt_again", "adopted", ["adopt", "--method", "ariad", "--journey", "demo"]),
    (
        "adopt_over_other_method",
        "adopted_other_method",
        ["adopt", "--method", "ariad", "--journey", "demo"],
    ),
    ("adopt_unknown_method", "unadopted", ["adopt", "--method", "bogus", "--journey", "demo"]),
    ("adopt_journey_missing", "unadopted", ["adopt", "--method", "ariad", "--journey", "nope"]),
    (
        "adopt_no_journey",
        "no_active_mode",
        ["adopt", "--method", "ariad", "--session-id", "absent"],
    ),
    # `adopt` deliberately has NO adoption guard -- it is the command that adopts.
    (
        "adopt_via_active_mode",
        "unadopted",
        ["adopt", "--method", "ariad", "--session-id", SESSION_ID],
    ),
    # prepare-templates
    (
        "prepare_templates_creates",
        "adopted",
        ["prepare-templates", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "prepare_templates_preserves",
        "adopted_with_templates",
        ["prepare-templates", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "prepare_templates_no_project_path",
        "adopted_no_project",
        ["prepare-templates", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "prepare_templates_not_adopted",
        "unadopted",
        ["prepare-templates", "--method", "ariad", "--journey", "demo"],
    ),
    # sync-cursor
    ("sync_cursor_first", "adopted", ["sync-cursor", "--method", "ariad", "--journey", "demo"]),
    (
        "sync_cursor_over_existing",
        "adopted_with_cursor",
        ["sync-cursor", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "sync_cursor_not_adopted",
        "unadopted",
        ["sync-cursor", "--method", "ariad", "--journey", "demo"],
    ),
    # check-implementation
    (
        "check_implementation_no_cursor",
        "adopted",
        ["check-implementation", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "check_implementation_blocked",
        "adopted_with_cursor",
        ["check-implementation", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "check_implementation_allowed",
        "adopted_plan_approved",
        ["check-implementation", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "check_implementation_not_adopted",
        "unadopted",
        ["check-implementation", "--method", "ariad", "--journey", "demo"],
    ),
    # --- plateau 3: the five story-lifecycle leaves ------------------------
    # pull-item. The CLI runs Prepare automatically after Pull, so the happy path
    # emits TWO surfaces; a port that stops at the Pull report is one surface short.
    (
        "pull_item_user_story",
        "adopted_with_cursor",
        [
            "pull-item", "--method", "ariad", "--journey", "demo",
            "--item-code", "CV1.DS1.US1", "--item-title", "A user story",
            "--item-level", "user_story", "--why-now", "next implementable slice",
        ],
    ),
    (
        "pull_item_technical_story",
        "adopted_with_cursor",
        [
            "pull-item", "--method", "ariad", "--journey", "demo",
            "--item-code", "CV1.DS1.TS1", "--item-title", "Harden the seam",
            "--item-level", "technical_story", "--why-now", "the seam is the risk",
        ],
    ),
    # A Delivery Story pull also EXPANDS: delivery_story_ready plus the artifacts
    # surface, and real child packages on disk.
    (
        "pull_item_delivery_story_expands",
        "adopted_ds_pullable",
        [
            "pull-item", "--method", "ariad", "--journey", "demo",
            "--item-code", "CV1.DS2", "--item-title", "Pullable delivery story",
            "--item-level", "delivery_story", "--why-now", "the delivery story is next",
        ],
    ),
    # The authored CV1.DS1 package has NO candidate table, so Expand must refuse
    # rather than fabricate a generic US1 -- the CV22.DS7 secondary defect.
    (
        "pull_item_delivery_story_blocked",
        "adopted_with_cursor",
        [
            "pull-item", "--method", "ariad", "--journey", "demo",
            "--item-code", "CV1.DS1", "--item-title", "A delivery story",
            "--item-level", "delivery_story", "--why-now", "expand it",
        ],
    ),
    (
        "pull_item_delivery_story_without_project_path",
        "adopted_cursor_no_project",
        [
            "pull-item", "--method", "ariad", "--journey", "demo",
            "--item-code", "CV1.DS1", "--item-title", "A delivery story",
            "--item-level", "delivery_story", "--why-now", "expand it",
        ],
    ),
    (
        "pull_item_unknown_level",
        "adopted_with_cursor",
        [
            "pull-item", "--method", "ariad", "--journey", "demo",
            "--item-code", "CV1.DS1.US1", "--item-title", "A user story",
            "--item-level", "epic", "--why-now", "wrong level",
        ],
    ),
    (
        "pull_item_no_cursor",
        "adopted",
        [
            "pull-item", "--method", "ariad", "--journey", "demo",
            "--item-code", "CV1.DS1.US1", "--item-title", "A user story",
            "--item-level", "user_story", "--why-now", "no cursor yet",
        ],
    ),
    (
        "pull_item_not_adopted",
        "unadopted",
        [
            "pull-item", "--method", "ariad", "--journey", "demo",
            "--item-code", "CV1.DS1.US1", "--item-title", "A user story",
            "--item-level", "user_story", "--why-now", "not adopted",
        ],
    ),
    # prepare-item
    (
        "prepare_item_after_pull",
        "adopted_pulled",
        ["prepare-item", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "prepare_item_delivery_story",
        "adopted_prepared_ds",
        ["prepare-item", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "prepare_item_without_active_item",
        "adopted_cursor_empty",
        ["prepare-item", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "prepare_item_not_adopted",
        "unadopted",
        ["prepare-item", "--method", "ariad", "--journey", "demo"],
    ),
    # plan-item
    (
        "plan_item_after_prepare",
        "adopted_prepared",
        ["plan-item", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "plan_item_with_objective",
        "adopted_prepared",
        [
            "plan-item", "--method", "ariad", "--journey", "demo",
            "--objective", "Port the story lifecycle leaves.",
        ],
    ),
    (
        "plan_item_preauthorized",
        "adopted_prepared",
        [
            "plan-item", "--method", "ariad", "--journey", "demo",
            "--preauthorize-approval", "--stop-after", "navigator_validation",
        ],
    ),
    (
        "plan_item_requires_prepare",
        "adopted_with_cursor",
        ["plan-item", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "plan_item_refuses_delivery_story",
        "adopted_prepared_ds",
        ["plan-item", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "plan_item_not_adopted",
        "unadopted",
        ["plan-item", "--method", "ariad", "--journey", "demo"],
    ),
    # approve-plan
    (
        "approve_plan_pending_checkpoint",
        "adopted_plan_pending",
        ["approve-plan", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "approve_plan_without_checkpoint",
        "adopted_with_cursor",
        ["approve-plan", "--method", "ariad", "--journey", "demo"],
    ),
    # Consuming real authority emits PLAN APPROVED *and* IMPLEMENTATION STARTED.
    (
        "approve_plan_with_preauthorization",
        "adopted_preauthorized",
        ["approve-plan", "--method", "ariad", "--journey", "demo", "--use-preauthorization"],
    ),
    # No receipt: the bounded fallback surface, exit 0, ordinary approval still due.
    (
        "approve_plan_with_preauthorization_missing",
        "adopted_plan_pending",
        ["approve-plan", "--method", "ariad", "--journey", "demo", "--use-preauthorization"],
    ),
    (
        "approve_plan_not_adopted",
        "unadopted",
        ["approve-plan", "--method", "ariad", "--journey", "demo"],
    ),
    # cancel-plan-preauthorization
    (
        "cancel_plan_preauthorization_pending",
        "adopted_preauthorized",
        ["cancel-plan-preauthorization", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "cancel_plan_preauthorization_without_pending",
        "adopted_plan_pending",
        ["cancel-plan-preauthorization", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "cancel_plan_preauthorization_no_cursor",
        "adopted",
        ["cancel-plan-preauthorization", "--method", "ariad", "--journey", "demo"],
    ),
    # --- plateau 4: the four closure leaves --------------------------------
    # Their refusals are NOT the ordinary stderr shape: a blocked lifecycle call
    # renders IMPLEMENTATION_GUARD on stdout and still exits 1, like
    # `check-implementation`. And two of them emit a SECOND, CLI-only surface on the
    # complete path -- `debt_review_started` after a passed Validation,
    # `done_closure_confirmation` after a `no_action` Debt Review.
    (
        "validate_item_passes_with_full_evidence",
        "adopted_closure_plan_approved",
        [
            "validate-item", "--method", "ariad", "--journey", "demo",
            "--implementation-complete", "--check", "uv run pytest -q",
            "--checks-status", "passed", "--e2e-decision", "not_required",
            "--navigator-route", "Run the command and read the surface.",
            "--navigator-accepted", "--expected-observation", "The surface renders.",
            "--pass-condition", "Bytes match.", "--fail-condition", "Any byte differs.",
        ],
    ),
    (
        "validate_item_records_pending_navigator_validation",
        "adopted_closure_plan_approved",
        ["validate-item", "--method", "ariad", "--journey", "demo", "--implementation-complete"],
    ),
    (
        "validate_item_accepts_pending_navigator_validation",
        "adopted_closure_pending_validation",
        [
            "validate-item", "--method", "ariad", "--journey", "demo",
            "--check", "uv run pytest -q", "--checks-status", "passed",
            "--navigator-route", "Navigator ran it.", "--navigator-accepted",
        ],
    ),
    (
        "validate_item_blocks_without_implementation_completion",
        "adopted_closure_plan_approved",
        [
            "validate-item", "--method", "ariad", "--journey", "demo",
            "--check", "pytest", "--checks-status", "passed",
            "--navigator-route", "Navigator ran it.", "--navigator-accepted",
        ],
    ),
    (
        "validate_item_requires_approved_plan",
        "adopted_prepared",
        ["validate-item", "--method", "ariad", "--journey", "demo", "--implementation-complete"],
    ),
    (
        "validate_item_no_cursor",
        "adopted",
        ["validate-item", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "validate_item_not_adopted",
        "unadopted",
        ["validate-item", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "review_item_completes_no_action",
        "adopted_closure_validated",
        [
            "review-item", "--method", "ariad", "--journey", "demo",
            "--debt", "No debt found.", "--decision", "no_action",
        ],
    ),
    (
        "review_item_renders_pending_debt_decision",
        "adopted_closure_validated",
        ["review-item", "--method", "ariad", "--journey", "demo", "--decision", "pending"],
    ),
    # A COMPLETE decision that is not `no_action`: the only case that distinguishes
    # "offer closure when nothing is missing" from "offer closure when the decision was
    # no_action and nothing is missing". Added after mutation testing showed dropping
    # the decision check survived the whole corpus.
    (
        "review_item_defer_complete_offers_no_closure",
        "adopted_closure_validated",
        [
            "review-item", "--method", "ariad", "--journey", "demo",
            "--debt", "Allowlist staleness.", "--decision", "defer",
            "--defer-reason", "Out of this story's scope.",
            "--revisit-trigger", "When the last gated leaf lands.",
        ],
    ),
    (
        "review_item_defer_without_reason",
        "adopted_closure_validated",
        ["review-item", "--method", "ariad", "--journey", "demo", "--decision", "defer"],
    ),
    (
        "review_item_requires_validation_passed",
        "adopted_prepared",
        ["review-item", "--method", "ariad", "--journey", "demo", "--decision", "no_action"],
    ),
    (
        "coherence_item_completes_after_review",
        "adopted_closure_reviewed",
        [
            "coherence-item", "--method", "ariad", "--journey", "demo",
            "--process", "Lifecycle followed.", "--project", "Docs updated.",
            "--product", "Behavior matches.",
        ],
    ),
    (
        "coherence_item_requires_review_complete",
        "adopted_closure_validated",
        [
            "coherence-item", "--method", "ariad", "--journey", "demo",
            "--process", "Followed.", "--project", "Updated.", "--product", "Matches.",
        ],
    ),
    (
        "done_item_completes_after_review",
        "adopted_closure_reviewed",
        [
            "done-item", "--method", "ariad", "--journey", "demo",
            "--history-action", "One scoped commit.", "--roadmap-update", "Package marked done.",
            "--next-recommendation", "Pull the next story.",
        ],
    ),
    (
        "done_item_requires_review_complete",
        "adopted_prepared",
        [
            "done-item", "--method", "ariad", "--journey", "demo",
            "--history-action", "Committed.", "--roadmap-update", "Updated.",
            "--next-recommendation", "Next.",
        ],
    ),
    (
        "done_item_not_adopted",
        "unadopted",
        ["done-item", "--method", "ariad", "--journey", "demo"],
    ),
    # -- plateau 5: the Delivery Story lifecycle -----------------------------
    (
        "set_flow_unit_inspects_by_default",
        "adopted_agg_planned",
        ["set-flow-unit", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "set_flow_unit_selects_delivery_story",
        "adopted_prepared_ds",
        ["set-flow-unit", "--method", "ariad", "--journey", "demo", "--unit", "delivery_story"],
    ),
    (
        "set_flow_unit_selects_story_by_story",
        "adopted_agg_planned",
        ["set-flow-unit", "--method", "ariad", "--journey", "demo", "--unit", "story_by_story"],
    ),
    (
        "set_flow_unit_requires_a_cursor",
        "adopted",
        ["set-flow-unit", "--method", "ariad", "--journey", "demo", "--unit", "delivery_story"],
    ),
    (
        "plan_delivery_story_creates_checkpoint",
        "adopted_agg_planned",
        [
            "plan-delivery-story", "--method", "ariad", "--journey", "demo",
            "--objective", "Deliver both children as one coherent outcome.",
            "--child", "CV1.DS3.US1", "--child", "CV1.DS3.TS1",
        ],
    ),
    (
        "plan_delivery_story_refuses_story_by_story",
        "adopted_agg_story_by_story",
        [
            "plan-delivery-story", "--method", "ariad", "--journey", "demo",
            "--objective", "Deliver both children.", "--child", "CV1.DS3.US1",
        ],
    ),
    (
        "plan_delivery_story_records_preauthorization",
        "adopted_agg_planned",
        [
            "plan-delivery-story", "--method", "ariad", "--journey", "demo",
            "--objective", "Deliver both children as one coherent outcome.",
            "--child", "CV1.DS3.US1", "--child", "CV1.DS3.TS1",
            "--preauthorize-approval", "--stop-after", "navigator_validation",
        ],
    ),
    (
        "approve_delivery_story_plan_starts_implementation",
        "adopted_agg_pending_approval",
        ["approve-delivery-story-plan", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "approve_delivery_story_plan_requires_checkpoint",
        "adopted_agg_planned",
        ["approve-delivery-story-plan", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "cancel_delivery_story_preauthorization_without_receipt",
        "adopted_agg_pending_approval",
        [
            "cancel-delivery-story-plan-preauthorization",
            "--method", "ariad", "--journey", "demo",
        ],
    ),
    (
        "validate_delivery_story_passes",
        "adopted_agg_approved",
        [
            "validate-delivery-story", "--method", "ariad", "--journey", "demo",
            "--summary", "Aggregate validation evidence.", "--navigator-accepted",
        ],
    ),
    (
        "validate_delivery_story_pending_navigator",
        "adopted_agg_approved",
        [
            "validate-delivery-story", "--method", "ariad", "--journey", "demo",
            "--summary", "Route provided, acceptance not given.",
        ],
    ),
    (
        "validate_delivery_story_requires_plan_approved",
        "adopted_agg_planned",
        [
            "validate-delivery-story", "--method", "ariad", "--journey", "demo",
            "--summary", "Too early.", "--navigator-accepted",
        ],
    ),
    (
        "review_delivery_story_no_action",
        "adopted_agg_validated",
        [
            "review-delivery-story", "--method", "ariad", "--journey", "demo",
            "--decision", "no_action", "--summary", "No debt found.",
        ],
    ),
    (
        "review_delivery_story_defer",
        "adopted_agg_validated",
        [
            "review-delivery-story", "--method", "ariad", "--journey", "demo",
            "--decision", "defer", "--summary", "Deferred with a trigger.",
        ],
    ),
    # NO argparse-level case here, deliberately. `--decision maybe` is refused by
    # argparse before the leaf runs, and its message is INTERPRETER text that
    # changes between supported versions: 3.10 prints
    # `choose from 'no_action', 'defer', 'pay_now'` and 3.12 prints the same list
    # unquoted. Recording it made the determinism gate fail on 3.10 while passing on
    # 3.12 -- the corpus would have pinned a CPython release, not Mirror behavior.
    # The choice constraint is real and belongs to plateau 8's refusal matrix, which
    # asserts STRUCTURE (exit 2, a usage block, the offending option) rather than
    # bytes.
    (
        "coherence_delivery_story_completes",
        "adopted_agg_reviewed",
        [
            "coherence-delivery-story", "--method", "ariad", "--journey", "demo",
            "--summary", "Process, project, and product align.",
        ],
    ),
    (
        "done_delivery_story_closes_after_review",
        "adopted_agg_reviewed",
        [
            "done-delivery-story", "--method", "ariad", "--journey", "demo",
            "--summary", "Aggregate closure recorded.",
        ],
    ),
    # The preflight refusal, end to end: authored children still Planned. This is
    # the composition the module corpus cannot grade -- the `; ` join, the exit
    # code, and the fact that the guard runs BEFORE any cursor or artifact write.
    (
        "done_delivery_story_refuses_unfinished_roadmap",
        "adopted_agg_children_unfinished",
        [
            "done-delivery-story", "--method", "ariad", "--journey", "demo",
            "--summary", "Premature.",
        ],
    ),
    (
        "done_delivery_story_requires_review",
        "adopted_agg_approved",
        [
            "done-delivery-story", "--method", "ariad", "--journey", "demo",
            "--summary", "Too early.",
        ],
    ),
    (
        "delivery_story_leaves_not_adopted",
        "unadopted",
        [
            "done-delivery-story", "--method", "ariad", "--journey", "demo",
            "--summary", "Unadopted.",
        ],
    ),
    # -- plateau 6: cadence, release intent, continuation ---------------------
    #
    # `set-cadence` has NO module: the whole leaf is `cmd_set_cadence`, and its
    # guard order differs from every other leaf -- the profile and the
    # autonomous-limits rule are checked BEFORE the journey is resolved, so a bad
    # profile with an unresolvable journey reports the PROFILE.
    (
        "set_cadence_checkpoint",
        "adopted_with_cursor",
        ["set-cadence", "--method", "ariad", "--journey", "demo", "--profile", "checkpoint"],
    ),
    (
        "set_cadence_accelerated",
        "adopted_with_cursor",
        ["set-cadence", "--method", "ariad", "--journey", "demo", "--profile", "accelerated"],
    ),
    (
        "set_cadence_autonomous_with_limits",
        "adopted_with_cursor",
        [
            "set-cadence", "--method", "ariad", "--journey", "demo",
            "--profile", "autonomous",
            "--limit", "stop before push or release",
            "--limit", "stop on failing checks",
        ],
    ),
    (
        "set_cadence_autonomous_requires_limits",
        "adopted_with_cursor",
        ["set-cadence", "--method", "ariad", "--journey", "demo", "--profile", "autonomous"],
    ),
    (
        "set_cadence_rejects_unknown_profile",
        "adopted_with_cursor",
        ["set-cadence", "--method", "ariad", "--journey", "demo", "--profile", "yolo"],
    ),
    # The profile guard runs BEFORE journey resolution, and the only way to SEE
    # that is a journey that cannot be resolved at all -- an explicit `--journey`
    # always resolves, because existence is checked later and `set-cadence` never
    # checks it. So: no `--journey`, and an active mode carrying no journey. Python
    # reports the PROFILE; a port that resolves first reports the missing journey.
    # (Found by mutation testing: the first version of this case passed
    # `--journey nope` and could not distinguish the two orders.)
    (
        "set_cadence_profile_guard_precedes_journey",
        "mode_without_journey",
        ["set-cadence", "--method", "ariad", "--profile", "yolo", "--session-id", SESSION_ID],
    ),
    # The same shape with a VALID profile reaches the journey guard, which is what
    # makes the pair above a comparison rather than an assertion.
    (
        "set_cadence_valid_profile_reaches_journey_guard",
        "mode_without_journey",
        ["set-cadence", "--method", "ariad", "--profile", "checkpoint", "--session-id", SESSION_ID],
    ),
    (
        "set_cadence_requires_a_cursor",
        "adopted",
        ["set-cadence", "--method", "ariad", "--journey", "demo", "--profile", "checkpoint"],
    ),
    (
        "set_cadence_not_adopted",
        "unadopted",
        ["set-cadence", "--method", "ariad", "--journey", "demo", "--profile", "checkpoint"],
    ),
    (
        "release_intent_inspects_not_recorded",
        "adopted_prepared",
        ["release-intent", "--method", "ariad", "--journey", "demo"],
    ),
    # `adopted_with_cursor`'s active item is `CV1.US1`, which carries no `DS<n>`
    # segment — so there is no Delivery Story boundary to record an intent against.
    (
        "release_intent_requires_a_delivery_story_boundary",
        "adopted_with_cursor",
        ["release-intent", "--method", "ariad", "--journey", "demo"],
    ),
    (
        "release_intent_records_planned",
        "adopted_prepared",
        ["release-intent", "--method", "ariad", "--journey", "demo", "--intent", "planned"],
    ),
    # NO case for `--intent maybe`: argparse declares `choices`, so it refuses with
    # version-dependent text before the leaf runs -- the same reason
    # `--decision maybe` is absent. The consequence is worth naming: the module's
    # own `release intent must be planned, none, or undecided` guard is UNREACHABLE
    # through the CLI, and is graded at module level by
    # `release_intent_value_rules` instead.
    (
        "release_intent_requires_a_cursor",
        "adopted",
        ["release-intent", "--method", "ariad", "--journey", "demo", "--intent", "planned"],
    ),
    # `continue-lifecycle` is also CLI-only, and its five guards each render the
    # IMPLEMENTATION_GUARD surface on STDOUT while exiting 1 -- the same
    # stdout-refusal shape `check-implementation` and the closure leaves use.
    (
        "continue_refuses_stepwise",
        "adopted_closure_reviewed",
        [
            "continue-lifecycle", "--method", "ariad", "--journey", "demo",
            "--history-action", "Committed.", "--roadmap-update", "Updated.",
            "--next-recommendation", "Next.",
        ],
    ),
    (
        "continue_refuses_pending_confirmation",
        "adopted_cadence_checkpoint_pending",
        [
            "continue-lifecycle", "--method", "ariad", "--journey", "demo",
            "--history-action", "Committed.", "--roadmap-update", "Updated.",
            "--next-recommendation", "Next.",
        ],
    ),
    (
        "continue_refuses_autonomous_without_limits",
        "adopted_cadence_autonomous_unlimited",
        [
            "continue-lifecycle", "--method", "ariad", "--journey", "demo",
            "--history-action", "Committed.", "--roadmap-update", "Updated.",
            "--next-recommendation", "Next.",
        ],
    ),
    (
        "continue_refuses_unbypassable_event",
        "adopted_cadence_checkpoint_prepared",
        [
            "continue-lifecycle", "--method", "ariad", "--journey", "demo",
            "--history-action", "Committed.", "--roadmap-update", "Updated.",
            "--next-recommendation", "Next.",
        ],
    ),
    (
        "continue_refuses_missing_done_evidence",
        "adopted_cadence_checkpoint_reviewed",
        [
            "continue-lifecycle", "--method", "ariad", "--journey", "demo",
            "--history-action", "Committed.", "--roadmap-update", "Updated.",
        ],
    ),
    # The one continuation that proceeds: it crosses the Done boundary itself and
    # prints DONE_CHECKPOINT. The four alignment arguments it accepts are IGNORED
    # by Python, which the case records by passing them.
    (
        "continue_crosses_done",
        "adopted_cadence_checkpoint_reviewed",
        [
            "continue-lifecycle", "--method", "ariad", "--journey", "demo",
            "--process", "Followed.", "--project", "Updated.", "--product", "Matches.",
            "--history-action", "One scoped commit.",
            "--roadmap-update", "Package marked done.",
            "--next-recommendation", "Pull the next story.",
        ],
    ),
    (
        "continue_not_adopted",
        "unadopted",
        [
            "continue-lifecycle", "--method", "ariad", "--journey", "demo",
            "--history-action", "Committed.", "--roadmap-update", "Updated.",
            "--next-recommendation", "Next.",
        ],
    ),
]

# Leaves whose output can carry an absolute project path: `plan_checkpoint` prints
# the package path and the `*_path=` trailer, `expand_blocked` embeds the resolved
# directory in its reason.
_PATH_BEARING = (
    "plan_item",
    "pull_item",
    "approve_plan",
    # The closure surfaces print their artifact path the same way `plan_checkpoint`
    # prints its package path: raw, absolute, wrapped (CR082).
    "validate_item",
    "review_item",
    "coherence_item",
    "done_item",
    # The aggregate leaves print artifact paths the same way, and the Done preflight
    # names the files it refused on -- project-relative by construction, but the
    # ambiguity path can still carry absolutes.
    "plan_delivery_story",
    "approve_delivery_story",
    "validate_delivery_story",
    "review_delivery_story",
    "coherence_delivery_story",
    "done_delivery_story",
    # `continue-lifecycle` crosses Done, so it prints the same paths Done prints.
    "continue_",
)

# Leaves that write into the project, so the files are part of the behavior.
_FILE_WRITING = (
    "continue_",
    "prepare_templates",
    "plan_item",
    "pull_item",
    "validate_item",
    "review_item",
    "coherence_item",
    "done_item",
    "plan_delivery_story",
    "approve_delivery_story",
    "validate_delivery_story",
    "review_delivery_story",
    "coherence_delivery_story",
    "done_delivery_story",
)


def _repo_docs_fingerprint() -> frozenset[str]:
    """Every path under the REPOSITORY's own roadmap, so pollution is detectable.

    This guard exists because it was needed twice. At plateau 2 a generic case loop
    pointed `prepare-templates` at the committed fixture and created nine files
    inside it. At plateau 3 a scenario seeded an EMPTY project path; `Path("")`
    resolves to the process cwd, which for a subprocess launched from the repository
    root is the repository itself, so `pull-item` materialized a fabricated
    `CV1.DS1 - A delivery story` package under this project's real CV1 -- a second
    package claiming a live code, which `resolve_story_directory` would then refuse
    as ambiguous and the roadmap-integrity check would fail on.

    Both times the damage was found by `git status`, not by an assertion. This is the
    assertion.
    """
    roadmap = HERE.parent.parent / "docs" / "project" / "roadmap"
    return frozenset(str(path.relative_to(roadmap)) for path in roadmap.rglob("*"))


def build_cases() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    repo_docs_before = _repo_docs_fingerprint()
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
            if name.startswith(_PATH_BEARING):
                outcome = _normalize_paths(outcome, project)
            entry: dict[str, Any] = {
                "name": name,
                "scenario": scenario,
                "argv": argv,
                "session_id": SESSION_ID,
                **outcome,
            }
            # For file-writing leaves the FILES are the behavior: their
            # project-relative paths and the bytes of the ones that already
            # existed, so a port that overwrites an authored file fails.
            if name.startswith(_FILE_WRITING):
                entry["project_files"] = _project_snapshot(project)
                entry["projection"] = _projection_summary(project)
            results.append(entry)
            created = _repo_docs_fingerprint() - repo_docs_before
            if created:
                raise SystemExit(
                    f"case {name!r} wrote into the REPOSITORY's own roadmap: "
                    f"{sorted(created)[:5]}. A case must only ever write inside its "
                    "disposable project. Check the scenario's project_path: an empty "
                    "or missing value makes Path('') resolve to the process cwd."
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
