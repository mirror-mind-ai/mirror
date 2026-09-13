"""Generate the Builder resume-state / implementation-guard golden.

CV22.DS7.US8 plateau 2, second slice. Three things the delivery cursor unblocked:

  * `read_builder_resume_state` -- the DB composition deferred from plateau 1,
    which needs the adoption row AND the cursor;
  * `get_workbench_snapshot` -- the read-only Workbench query D1 could not
    retire, because every `build load` on a project with no
    `docs/project/refinement/index.md` renders its Refinement field from it;
  * `assert_implementation_allowed` plus the two `IMPLEMENTATION_GUARD` surfaces,
    which is why `check-implementation` was moved out of plateau 1.

Two behaviors here are easy to port wrongly and hard to notice:

**The Workbench read must survive a database that has no Workbench tables.**
`_safe_workbench_snapshot` catches `sqlite3.OperationalError` and returns `None`.
That is not defensive decoration: an install that predates CV20.DS6 has no
`builder_refinement_stories`, and without the catch every `build load` on it
raises instead of rendering. The `missing_tables` case below drops the tables to
prove the path.

**The guard's four outcomes are not a boolean.** No cursor, a pending
confirmation, `plan_approved`, and the delivery-story combination
(`delivery_story_plan_approved` AND level `delivery_story` AND flow unit
`delivery_story` AND `plan:approved` in the aggregate status) each produce a
different result, and three of the four ways to fail the last one produce the
generic refusal. Every combination is enumerated.

Run:  uv run python ts/parity/generate_builder_resume_state_golden.py
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from memory.builder.delivery_cursor import set_delivery_cursor
from memory.builder.lifecycle import (
    assert_implementation_allowed,
    render_implementation_guard_allowed,
    render_implementation_guard_blocked,
)
from memory.builder.lifecycle_ribbon import (
    render_change_request_lifecycle_ribbon,
    render_lifecycle_ribbon,
    render_refinement_lifecycle_ribbon,
)
from memory.builder.method_adoption import set_adopted_method
from memory.builder.resume_state import read_builder_resume_state
from memory.builder.workbench import get_workbench_snapshot
from memory.db.schema import SCHEMA
from memory.storage.store import Store

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "builder-resume-state.golden.json"

FROZEN_NOW = "2026-01-01T00:00:00+00:00"
JOURNEY = "demo"


def _freeze_now() -> None:
    from memory import models

    models._now = lambda: FROZEN_NOW


def _store() -> Store:
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.executescript(SCHEMA)
    store = Store(connection)
    store.configure_projection_refresh(lambda journey: None)
    return store


def _story_dump(record: Any) -> dict[str, Any] | None:
    if record is None:
        return None
    return {"display_code": record.display_code, "title": record.title, "status": record.status}


def _snapshot_dump(snapshot: Any) -> dict[str, Any] | None:
    if snapshot is None:
        return None
    return {
        "storage_state": snapshot.storage_state,
        "active_refinement_story": _story_dump(snapshot.active_refinement_story),
        "active_change_request": _story_dump(snapshot.active_change_request),
        "last_refinement_event": snapshot.last_refinement_event,
        "refinement_story_count": snapshot.refinement_story_count,
        "change_request_count": snapshot.change_request_count,
        "unassigned_change_request_count": snapshot.unassigned_change_request_count,
    }


def _state_dump(state: Any) -> dict[str, Any]:
    return {
        "journey": state.journey,
        "adopted_method": state.adopted_method,
        "cursor_active_item": None if state.cursor is None else state.cursor.active_item,
        "cursor_present": state.cursor is not None,
        "resumable": state.resumable,
        "reason": state.reason,
        "allowed_next_actions": list(state.allowed_next_actions),
        "refinement": _snapshot_dump(state.refinement),
    }


def _seed_workbench(store: Store, *, stories: int, crs: int, unassigned: int, active: bool) -> None:
    """Insert Workbench rows directly, which is all the read needs."""
    for index in range(stories):
        store.conn.execute(
            """INSERT INTO builder_refinement_stories
               (id, journey, display_code, title, description, status, position, source,
                provenance, created_at, updated_at, pulled_at, closed_at)
               VALUES (?, ?, ?, ?, NULL, 'active', ?, 'manual', NULL, ?, ?, NULL, NULL)""",
            (
                f"rs-{index}",
                JOURNEY,
                f"RS-{index + 1:03d}",
                f"Refinement story {index + 1}",
                index,
                FROZEN_NOW,
                FROZEN_NOW,
            ),
        )
    for index in range(crs):
        assigned = None if index < unassigned else "rs-0"
        store.conn.execute(
            """INSERT INTO builder_change_requests
               (id, journey, display_code, refinement_story_id, title, body, status, position,
                source, provenance, outcome_notes, created_at, updated_at, completed_at)
               VALUES (?, ?, ?, ?, ?, 'body', 'captured', ?, 'manual', NULL, NULL, ?, ?, NULL)""",
            (
                f"cr-{index}",
                JOURNEY,
                f"CR-{index + 1:03d}",
                assigned,
                f"Change request {index + 1}",
                index,
                FROZEN_NOW,
                FROZEN_NOW,
            ),
        )
    if active:
        store.conn.execute(
            """INSERT INTO builder_refinement_cursors
               (journey, active_refinement_story_id, active_change_request_id,
                last_refinement_event, updated_at)
               VALUES (?, 'rs-0', 'cr-0', 'change_request_selected', ?)""",
            (JOURNEY, FROZEN_NOW),
        )
    store.conn.commit()


WORKBENCH_CASES: list[tuple[str, dict[str, Any]]] = [
    ("empty", {"stories": 0, "crs": 0, "unassigned": 0, "active": False}),
    ("rows_without_cursor", {"stories": 2, "crs": 5, "unassigned": 2, "active": False}),
    ("rows_with_cursor", {"stories": 3, "crs": 7, "unassigned": 3, "active": True}),
    ("all_unassigned", {"stories": 1, "crs": 4, "unassigned": 4, "active": False}),
]

GUARD_CASES: list[tuple[str, dict[str, Any] | None]] = [
    ("no_cursor", None),
    ("plan_approved", {"active_item": "CV1.US1", "last_delivery_event": "plan_approved"}),
    (
        "pending_confirmation_blocks_even_when_approved",
        {
            "active_item": "CV1.US1",
            "last_delivery_event": "plan_approved",
            "pending_confirmation": "navigator_approval",
        },
    ),
    ("no_approved_plan", {"active_item": "CV1.US1", "last_delivery_event": "prepared"}),
    ("no_event_at_all", {"active_item": "CV1.US1"}),
    # The delivery-story combination needs all four conditions.
    (
        "ds_plan_approved_complete",
        {
            "active_item": "CV1.DS1",
            "active_item_level": "delivery_story",
            "navigator_flow_unit": "delivery_story",
            "aggregate_checkpoint_status": ("plan:approved",),
            "last_delivery_event": "delivery_story_plan_approved",
        },
    ),
    (
        "ds_plan_wrong_level",
        {
            "active_item": "CV1.DS1",
            "active_item_level": "user_story",
            "navigator_flow_unit": "delivery_story",
            "aggregate_checkpoint_status": ("plan:approved",),
            "last_delivery_event": "delivery_story_plan_approved",
        },
    ),
    (
        "ds_plan_wrong_flow_unit",
        {
            "active_item": "CV1.DS1",
            "active_item_level": "delivery_story",
            "navigator_flow_unit": "story_by_story",
            "aggregate_checkpoint_status": ("plan:approved",),
            "last_delivery_event": "delivery_story_plan_approved",
        },
    ),
    (
        "ds_plan_without_aggregate_status",
        {
            "active_item": "CV1.DS1",
            "active_item_level": "delivery_story",
            "navigator_flow_unit": "delivery_story",
            "aggregate_checkpoint_status": (),
            "last_delivery_event": "delivery_story_plan_approved",
        },
    ),
    (
        "ds_plan_other_aggregate_status",
        {
            "active_item": "CV1.DS1",
            "active_item_level": "delivery_story",
            "navigator_flow_unit": "delivery_story",
            "aggregate_checkpoint_status": ("validation:passed",),
            "last_delivery_event": "delivery_story_plan_approved",
        },
    ),
    # An active item is not required for the guard to allow implementation.
    ("plan_approved_without_active_item", {"last_delivery_event": "plan_approved"}),
]

RESUME_CASES: list[tuple[str, dict[str, Any]]] = [
    (
        "not_adopted",
        {"adopt": False, "cursor": None, "workbench": None, "include_refinement": True},
    ),
    (
        "not_adopted_without_refinement",
        {"adopt": False, "cursor": None, "workbench": None, "include_refinement": False},
    ),
    (
        "adopted_without_cursor",
        {"adopt": True, "cursor": None, "workbench": None, "include_refinement": True},
    ),
    (
        "adopted_with_cursor_no_active_item",
        {"adopt": True, "cursor": {}, "workbench": None, "include_refinement": True},
    ),
    (
        "active_item",
        {
            "adopt": True,
            "cursor": {"active_item": "CV1.US1", "last_delivery_event": "pulled"},
            "workbench": None,
            "include_refinement": True,
        },
    ),
    (
        "pending_confirmation",
        {
            "adopt": True,
            "cursor": {
                "active_item": "CV1.US1",
                "active_checkpoint": "after_plan",
                "pending_confirmation": "navigator_approval",
            },
            "workbench": None,
            "include_refinement": True,
        },
    ),
    (
        "pending_confirmation_without_active_item",
        {
            "adopt": True,
            "cursor": {"pending_confirmation": "navigator_approval"},
            "workbench": None,
            "include_refinement": True,
        },
    ),
    (
        "with_workbench_rows",
        {
            "adopt": True,
            "cursor": {"active_item": "CV1.US1"},
            "workbench": {"stories": 2, "crs": 5, "unassigned": 1, "active": True},
            "include_refinement": True,
        },
    ),
    (
        "workbench_excluded",
        {
            "adopt": True,
            "cursor": {"active_item": "CV1.US1"},
            "workbench": {"stories": 2, "crs": 5, "unassigned": 1, "active": True},
            "include_refinement": False,
        },
    ),
]


def build_payload() -> dict[str, Any]:
    _freeze_now()

    ribbons = {
        "delivery": {
            stage: render_lifecycle_ribbon(stage)
            for stage in (
                "pull",
                "prepare",
                "expand",
                "plan",
                "implement",
                "validate",
                "debt_review",
                "done",
            )
        },
        "refinement": {
            stage: render_refinement_lifecycle_ribbon(stage)
            for stage in ("pull", "select_cr", "cr_cycle", "review", "coherence", "close")
        },
        "change_request": {
            stage: render_change_request_lifecycle_ribbon(stage)
            for stage in ("confirm", "plan", "implement", "validate", "done_note")
        },
    }

    ribbon_refusals = []
    for kind, renderer in (
        ("delivery", render_lifecycle_ribbon),
        ("refinement", render_refinement_lifecycle_ribbon),
        ("change_request", render_change_request_lifecycle_ribbon),
    ):
        try:
            renderer("bogus")
            ribbon_refusals.append({"kind": kind, "expected": "ok"})
        except Exception as exc:
            ribbon_refusals.append({"kind": kind, "expected_error": f"{type(exc).__name__}: {exc}"})

    workbench: list[dict[str, Any]] = []
    for name, seed in WORKBENCH_CASES:
        store = _store()
        _seed_workbench(store, **seed)
        workbench.append(
            {
                "name": name,
                "seed": seed,
                "expected": _snapshot_dump(get_workbench_snapshot(store, JOURNEY)),
            }
        )

    # A database with no Workbench tables at all: the pre-CV20.DS6 shape.
    store = _store()
    for table in (
        "builder_refinement_cursors",
        "builder_change_requests",
        "builder_refinement_stories",
    ):
        store.conn.execute(f"DROP TABLE IF EXISTS {table}")
    store.conn.commit()
    try:
        get_workbench_snapshot(store, JOURNEY)
        missing_tables: dict[str, Any] = {"expected": "ok"}
    except Exception as exc:
        missing_tables = {"expected_error": type(exc).__name__}

    guards: list[dict[str, Any]] = []
    for name, cursor_changes in GUARD_CASES:
        store = _store()
        if cursor_changes is not None:
            set_delivery_cursor(store, journey=JOURNEY, method="ariad", **cursor_changes)
        entry: dict[str, Any] = {"name": name, "cursor": _jsonable(cursor_changes)}
        try:
            cursor = assert_implementation_allowed(store, journey=JOURNEY)
            entry["outcome"] = "allowed"
            entry["surface"] = render_implementation_guard_allowed(cursor)
        except PermissionError as exc:
            entry["outcome"] = "blocked"
            entry["reason"] = str(exc)
            entry["surface"] = render_implementation_guard_blocked(str(exc))
        guards.append(entry)

    resume: list[dict[str, Any]] = []
    for name, seed in RESUME_CASES:
        store = _store()
        if seed["adopt"]:
            set_adopted_method(store, JOURNEY, "ariad")
        if seed["cursor"] is not None:
            set_delivery_cursor(store, journey=JOURNEY, method="ariad", **seed["cursor"])
        if seed["workbench"] is not None:
            _seed_workbench(store, **seed["workbench"])
        resume.append(
            {
                "name": name,
                "seed": _jsonable(seed),
                "expected": _state_dump(
                    read_builder_resume_state(
                        store, JOURNEY, include_refinement=seed["include_refinement"]
                    )
                ),
            }
        )

    # `read_builder_resume_state` refuses an empty journey.
    store = _store()
    try:
        read_builder_resume_state(store, "   ")
        empty_journey: dict[str, Any] = {"expected": "ok"}
    except Exception as exc:
        empty_journey = {"expected_error": f"{type(exc).__name__}: {exc}"}

    # An asymmetry worth recording rather than smoothing: `home_surface`
    # wraps the Workbench read in `_safe_workbench_snapshot`, which swallows
    # `sqlite3.OperationalError`, but `read_builder_resume_state` calls
    # `get_workbench_snapshot` DIRECTLY. So on a database predating CV20.DS6 the
    # Home path degrades and the Resume path raises. The port must reproduce both
    # halves; the inconsistency is Python's and becomes a CR.
    store = _store()
    set_adopted_method(store, JOURNEY, "ariad")
    set_delivery_cursor(store, journey=JOURNEY, method="ariad", active_item="CV1")
    for table in (
        "builder_refinement_cursors",
        "builder_change_requests",
        "builder_refinement_stories",
    ):
        store.conn.execute(f"DROP TABLE IF EXISTS {table}")
    store.conn.commit()
    try:
        read_builder_resume_state(store, JOURNEY)
        resume_missing_tables: dict[str, Any] = {"expected": "ok"}
    except Exception as exc:
        resume_missing_tables = {"expected_error": type(exc).__name__}
    # Excluding refinement avoids the read entirely, which is how `build load`
    # dodges this on a file-first project.
    try:
        excluded = _state_dump(read_builder_resume_state(store, JOURNEY, include_refinement=False))
        resume_missing_tables["excluded_ok"] = excluded
    except Exception as exc:
        resume_missing_tables["excluded_error"] = type(exc).__name__

    return {
        "frozen_now": FROZEN_NOW,
        "journey": JOURNEY,
        "ribbons": ribbons,
        "ribbon_refusals": ribbon_refusals,
        "workbench": workbench,
        "workbench_missing_tables": missing_tables,
        "guards": guards,
        "resume": resume,
        "resume_empty_journey": empty_journey,
        "resume_missing_tables": resume_missing_tables,
    }


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def main() -> None:
    payload = build_payload()
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    for marker in ("/Users/", "/home/runner", "/private/var"):
        if marker in text:
            raise SystemExit(f"refusing to write a machine-dependent golden: contains {marker!r}")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(text + "\n", encoding="utf-8")
    allowed = sum(1 for entry in payload["guards"] if entry["outcome"] == "allowed")
    print(
        f"ribbons: {sum(len(group) for group in payload['ribbons'].values())}  "
        f"workbench: {len(payload['workbench'])}  "
        f"guards: {len(payload['guards'])} ({allowed} allowed)  "
        f"resume: {len(payload['resume'])}"
    )
    print(f"workbench with no tables: {payload['workbench_missing_tables']}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
