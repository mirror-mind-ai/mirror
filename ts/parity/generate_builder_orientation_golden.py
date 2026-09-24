"""Generate the Builder orientation/resume surface golden (CV22.DS7.US8 plateau 1).

The three surfaces a Navigator meets when Builder Mode activates:

  * `■ BUILDER RESUME`       -- a journey with work in flight
  * `■ BUILDER HOME`         -- an Ariad journey with no active item
  * `■ BUILDER ORIENTATION`  -- the companion orientation card

All three are PURE functions of a state object, which is why they are graded here
in plateau 1 while the DB-backed composition that fills those objects
(`read_builder_resume_state`, and the Workbench half of
`inspect_refinement_field`) waits for plateau 2 alongside the delivery cursor.
That split is deliberate: `get_delivery_cursor` and `set_delivery_cursor` share
one serialization, and the whole D2 revert argument rests on those bytes being
symmetric, so porting the reader a plateau ahead of the writer would break the
pair that has to be proven together.

What IS ported here from the composition side is its filesystem half:
`find_canonical_refinement_index`, which does not touch the database. (The
seed-CR scan beside it was removed from both engines by CV22.DS10.TS5, debt
D-024.)

The matrix below exists because these surfaces are almost entirely branches, and
the branches are what a port silently collapses:

  * the resume surface's `reason` block appears only when a reason exists, and
    `release intent` only when BOTH the intent and its Delivery Story are set --
    an `or` in place of that `and` renders a half-populated row;
  * `_refinement_field_lines` has three shapes (canonical index, absent snapshot,
    populated snapshot) and the populated one reads `last_refinement_event` as
    "none" whenever there is no active RS, even when an event is recorded;
  * `_available_refinement_moves` returns EARLY for a canonical index, so the
    later Workbench-storage branches are unreachable in that state;
  * `_refinement_orientation_lines` distinguishes "active RS with CR", "active RS
    without CR", "captured CRs but no RS", and "nothing" -- four shapes;
  * `_roadmap_placement_lines` falls back to a synthesized `roadmap focus` label
    when the recommended candidate's CV is absent from the snapshot.

Run:  uv run python ts/parity/generate_builder_orientation_golden.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from memory.builder.delivery_cursor import BuilderDeliveryCursor
from memory.builder.home_surface import (
    RefinementFieldSnapshot,
    find_canonical_refinement_index,
    inspect_refinement_field,
    render_builder_home_surface,
    render_builder_orientation_surface,
)
from memory.builder.pull_candidates import (
    PullCandidate,
    PullCandidatesReport,
    RoadmapSnapshotItem,
    RoadmapSnapshotReport,
)
from memory.builder.resume_state import (
    ACTIVE_ITEM_ACTIONS,
    NO_ACTIVE_ITEM_ACTIONS,
    PENDING_CONFIRMATION_ACTIONS,
    BuilderResumeState,
)
from memory.builder.resume_surface import render_builder_resume_surface
from memory.builder.roadmap_position import RoadmapPosition

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "test" / "fixtures" / "builder-refinement"
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-orientation.golden.json"

LONG = (
    "a delivery story whose title runs well past the fifty-four column card budget and keeps going"
)
UNICODE = "jornada de ação 🟦 com acentuação e emoji 🧰"

# --- Building blocks ------------------------------------------------------


def _cursor(**changes: Any) -> BuilderDeliveryCursor:
    base = {
        "journey": "mirror-ts-core",
        "method": "ariad",
        "active_item": "CV22.DS7.US8",
        "active_item_title": "Builder/Ariad tree",
        "active_item_level": "user_story",
        "last_delivery_event": "plan_approved",
        "cursor_generation": 16,
    }
    base.update(changes)
    return BuilderDeliveryCursor(**base)


def _refinement(**changes: Any) -> RefinementFieldSnapshot:
    base = {
        "active_refinement_story": None,
        "active_change_request": None,
        "storage_state": "project files (not started)",
        "next_move": "create docs/project/refinement/index.md",
        "canonical_index": None,
    }
    base.update(changes)
    return RefinementFieldSnapshot(**base)


SNAPSHOT = RoadmapSnapshotReport(
    journey="mirror-ts-core",
    method="ariad",
    items=(
        RoadmapSnapshotItem(code="CV22", title="TypeScript Core Port", status="🟢 Active"),
        RoadmapSnapshotItem(code="CV23", title="Later value", status="🟡 Planned"),
    ),
    source="docs/project/roadmap/index.md",
)

CANDIDATE = PullCandidate(
    code="CV22.DS7.US8",
    title="Builder/Ariad tree",
    level="user_story",
    status="🟡 Planned",
    path="docs/project/roadmap/cv22/us8/index.md",
)
CANDIDATE_LONG = PullCandidate(
    code="CV22.DS7.US9",
    title=LONG,
    level="user_story",
    status="🟡 Planned",
    path="docs/project/roadmap/cv22/us9/index.md",
)
CANDIDATE_OTHER_CV = PullCandidate(
    code="CV99.DS1",
    title="Belongs to a CV absent from the snapshot",
    level="delivery_story",
    status="🟡 Planned",
    path="docs/project/roadmap/cv99/index.md",
)


def _report(
    *candidates: PullCandidate, recommended: PullCandidate | None = None
) -> PullCandidatesReport:
    return PullCandidatesReport(
        journey="mirror-ts-core",
        method="ariad",
        candidates=candidates,
        recommended=recommended
        if recommended is not None
        else (candidates[0] if candidates else None),
    )


POSITION = RoadmapPosition(
    code="CV22",
    title="TypeScript Core Port",
    status="🟢 Active",
    path="docs/project/roadmap/cv22-typescript-core-port/index.md",
)


def _resume_state(**changes: Any) -> BuilderResumeState:
    base = {
        "journey": "mirror-ts-core",
        "adopted_method": "ariad",
        "cursor": _cursor(),
        "resumable": True,
        "reason": None,
        "allowed_next_actions": ACTIVE_ITEM_ACTIONS,
    }
    base.update(changes)
    return BuilderResumeState(**base)


# --- Fixtures for the filesystem half -------------------------------------

REFINEMENT_PROJECTS: dict[str, dict[str, str]] = {
    # The canonical file-first authority exists.
    "canonical": {"docs/project/refinement/index.md": "# Refinement\n"},
    # No canonical index, but the CV20.DS6 plan the seed-CR scan used to count
    # is present. Since D-024 it must change nothing: same snapshot as "bare".
    "seeded": {
        "docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds6-refinement-workbench-flow/plan.md": (
            "# Plan\n\n### CR: first seed\n\nbody\n\n### CR: second seed\n\n"
            "#### CR: not a level three heading\n\n### CR:third with no space\n"
        )
    },
    # The same plan with no seed headings: also indistinguishable from "bare".
    "unseeded": {
        "docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds6-refinement-workbench-flow/plan.md": (
            "# Plan\n\nNo seed headings here.\n"
        )
    },
    # A directory where the canonical index path is a DIRECTORY, not a file.
    "index_is_a_directory": {"docs/project/refinement/index.md/keep.md": "not a file\n"},
    # Nothing at all.
    "bare": {"README.md": "# Bare\n"},
}


def write_fixtures() -> None:
    import shutil

    if FIXTURES.exists():
        shutil.rmtree(FIXTURES)
    for project, files in REFINEMENT_PROJECTS.items():
        for relative, content in files.items():
            target = FIXTURES / project / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")


def _snapshot_dump(snapshot: RefinementFieldSnapshot) -> dict[str, Any]:
    return {
        "active_refinement_story": snapshot.active_refinement_story,
        "active_change_request": snapshot.active_change_request,
        "storage_state": snapshot.storage_state,
        "next_move": snapshot.next_move,
        "canonical_index": snapshot.canonical_index,
    }


def build_payload() -> dict[str, Any]:
    resume: list[dict[str, Any]] = []

    def add_resume(
        name: str,
        state: BuilderResumeState,
        *,
        position: RoadmapPosition | None = None,
        canonical: str | None = None,
    ) -> None:
        resume.append(
            {
                "name": name,
                "state": {
                    "journey": state.journey,
                    "adopted_method": state.adopted_method,
                    "cursor": None
                    if state.cursor is None
                    else {
                        "active_item": state.cursor.active_item,
                        "active_checkpoint": state.cursor.active_checkpoint,
                        "pending_confirmation": state.cursor.pending_confirmation,
                        "last_delivery_event": state.cursor.last_delivery_event,
                        "release_intent": state.cursor.release_intent,
                        "release_intent_delivery_story": state.cursor.release_intent_delivery_story,
                    },
                    "resumable": state.resumable,
                    "reason": state.reason,
                    "allowed_next_actions": list(state.allowed_next_actions),
                },
                "roadmap_position": None
                if position is None
                else {
                    "code": position.code,
                    "title": position.title,
                    "status": position.status,
                    "path": position.path,
                },
                "canonical_refinement_index": canonical,
                "expected": render_builder_resume_surface(
                    state,
                    roadmap_position=position,
                    canonical_refinement_index=canonical,
                ),
            }
        )

    add_resume("active_item", _resume_state(), position=POSITION)
    add_resume("active_item_no_position", _resume_state())
    add_resume(
        "adoption_required",
        _resume_state(
            adopted_method=None,
            cursor=None,
            resumable=False,
            reason="adoption_required",
            allowed_next_actions=("adopt_method", "inspect_method"),
        ),
    )
    add_resume(
        "cursor_sync_required",
        _resume_state(
            cursor=None,
            resumable=False,
            reason="cursor_sync_required",
            allowed_next_actions=("sync_cursor", "inspect_method"),
        ),
        position=POSITION,
    )
    add_resume(
        "pending_confirmation",
        _resume_state(
            cursor=_cursor(
                active_checkpoint="after_plan", pending_confirmation="navigator_approval"
            ),
            allowed_next_actions=PENDING_CONFIRMATION_ACTIONS,
        ),
        position=POSITION,
    )
    add_resume(
        "no_active_item",
        _resume_state(
            cursor=_cursor(active_item=None, active_item_title=None, last_delivery_event=None),
            allowed_next_actions=NO_ACTIVE_ITEM_ACTIONS,
        ),
    )
    add_resume(
        "release_intent_both",
        _resume_state(
            cursor=_cursor(release_intent="none", release_intent_delivery_story="CV22.DS8")
        ),
        position=POSITION,
    )
    add_resume(
        "release_intent_only_intent",
        _resume_state(cursor=_cursor(release_intent="planned")),
    )
    add_resume(
        "release_intent_only_story",
        _resume_state(cursor=_cursor(release_intent_delivery_story="CV22.DS8")),
    )
    add_resume(
        "canonical_refinement_index", _resume_state(), canonical="docs/project/refinement/index.md"
    )
    add_resume("no_canonical_index", _resume_state())
    add_resume("long_reason", _resume_state(reason=LONG, resumable=False))
    add_resume("unicode_journey", _resume_state(journey=UNICODE))
    add_resume("empty_actions", _resume_state(allowed_next_actions=()))

    home: list[dict[str, Any]] = []
    orientation: list[dict[str, Any]] = []

    # CV22.DS10.TS4: with the SQLite Workbench retired there are three shapes
    # left, not seven. The four removed ones (populated, story_without_cr,
    # captured_only, not_implemented) all described Workbench-derived content
    # that no read can produce anymore.
    refinement_states = {
        "canonical": _refinement(canonical_index="docs/project/refinement/index.md"),
        "not_started": _refinement(),
    }

    candidate_reports = {
        "recommended": _report(CANDIDATE, CANDIDATE_LONG),
        "none": _report(),
        "other_cv": _report(CANDIDATE_OTHER_CV),
        "long_title": _report(CANDIDATE_LONG),
    }

    for refinement_name, refinement in refinement_states.items():
        for report_name, report in candidate_reports.items():
            home.append(
                {
                    "name": f"home__{refinement_name}__{report_name}",
                    "refinement": _snapshot_dump(refinement),
                    "candidates": report_name,
                    "journey": "mirror-ts-core",
                    "method": "ariad",
                    "expected": render_builder_home_surface(
                        journey="mirror-ts-core",
                        method="ariad",
                        candidates_report=report,
                        refinement=refinement,
                    ),
                }
            )
            orientation.append(
                {
                    "name": f"orientation__{refinement_name}__{report_name}",
                    "refinement": _snapshot_dump(refinement),
                    "candidates": report_name,
                    "expected": render_builder_orientation_surface(
                        roadmap=SNAPSHOT,
                        candidates_report=report,
                        refinement=refinement,
                    ),
                }
            )

    home.append(
        {
            "name": "home__unicode_journey",
            "refinement": _snapshot_dump(refinement_states["not_started"]),
            "candidates": "recommended",
            "journey": UNICODE,
            "method": "ariad",
            "expected": render_builder_home_surface(
                journey=UNICODE,
                method="ariad",
                candidates_report=candidate_reports["recommended"],
                refinement=refinement_states["not_started"],
            ),
        }
    )

    # The filesystem half of `inspect_refinement_field`, with no store.
    field: list[dict[str, Any]] = []
    for project in [*REFINEMENT_PROJECTS, "missing_entirely"]:
        path = None if project == "missing_entirely" else FIXTURES / project
        field.append(
            {
                "name": f"field__{project}",
                "project": project,
                "canonical_index": find_canonical_refinement_index(path),
                "expected": _snapshot_dump(inspect_refinement_field(path)),
            }
        )

    return {
        "action_tuples": {
            "no_active_item": list(NO_ACTIVE_ITEM_ACTIONS),
            "active_item": list(ACTIVE_ITEM_ACTIONS),
            "pending_confirmation": list(PENDING_CONFIRMATION_ACTIONS),
        },
        "roadmap_snapshot": {
            "journey": SNAPSHOT.journey,
            "method": SNAPSHOT.method,
            "items": [
                {"code": item.code, "title": item.title, "status": item.status}
                for item in SNAPSHOT.items
            ],
            "source": SNAPSHOT.source,
        },
        "candidate_reports": {
            name: {
                "journey": report.journey,
                "method": report.method,
                "candidates": [
                    {
                        "code": candidate.code,
                        "title": candidate.title,
                        "level": candidate.level,
                        "status": candidate.status,
                        "path": candidate.path,
                    }
                    for candidate in report.candidates
                ],
                "recommended": None
                if report.recommended is None
                else {
                    "code": report.recommended.code,
                    "title": report.recommended.title,
                    "level": report.recommended.level,
                    "status": report.recommended.status,
                    "path": report.recommended.path,
                },
            }
            for name, report in candidate_reports.items()
        },
        "resume": resume,
        "home": home,
        "orientation": orientation,
        "refinement_field": field,
    }


def main() -> None:
    write_fixtures()
    payload = build_payload()
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    for marker in (str(FIXTURES.resolve()), str(FIXTURES), str(HERE.parent.parent)):
        if marker in text:
            raise SystemExit(f"refusing to write a machine-dependent golden: it contains {marker}")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")
    print(
        f"resume: {len(payload['resume'])}  home: {len(payload['home'])}  "
        f"orientation: {len(payload['orientation'])}  field: {len(payload['refinement_field'])}"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")
    print(f"wrote {FIXTURES.relative_to(HERE.parent.parent)}/")


if __name__ == "__main__":
    main()
