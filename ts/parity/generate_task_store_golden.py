"""Generate the committed task-store golden fixture (CV22.DS7.US2).

This is the Python side of the task read-model parity contract
(`src/memory/storage/tasks.py` + `TaskService.list_tasks`). It seeds a real
database copy with fully synthetic, explicitly-timestamped tasks (no frozen-clock
patching needed — every `Task` is constructed with explicit `created_at` so the
oracle is deterministic by construction), drives the REAL Store/TaskService
methods, and records each read's output — including SQLite's `NULLS LAST`
ordering behavior and the week-range date-boundary filter — so the TypeScript
port can be graded without re-deriving the answer.

`resolveTaskByIdOrPrefix` is not a Python function (each CLI command inlines its
own prefix scan) — its behavior is specified directly in the plan and covered by
hand-written TS tests, not this golden.

Run:  uv run python ts/parity/generate_task_store_golden.py
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from memory.db.connection import get_connection
from memory.models import Task
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.services.tasks import TaskService
from memory.storage.store import Store

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "task-store.golden.json"

# Explicit, deterministic fields for every seeded task -- no clock patching
# needed. Covers: NULLS LAST ordering (some due_date/scheduled_at null), status
# variety (todo/doing/blocked/done), journey variety (incl. no-journey tasks),
# and a week-range boundary case (task exactly at the range edge).
SEED_TASKS: tuple[dict, ...] = (
    dict(
        id="t-alpha1",
        journey="cv22",
        title="Alpha One",
        status="todo",
        due_date="2026-01-05",
        scheduled_at=None,
        time_hint=None,
        stage="S1",
        context=None,
        source="manual",
        created_at="2026-01-01T00:00:00.000000Z",
        updated_at="2026-01-01T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
    dict(
        id="t-alpha2",
        journey="cv22",
        title="Alpha Two",
        status="doing",
        due_date=None,  # sorts LAST under NULLS LAST
        scheduled_at="2026-01-02T09:00",
        time_hint=None,
        stage="S1",
        context=None,
        source="manual",
        created_at="2026-01-02T00:00:00.000000Z",
        updated_at="2026-01-02T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
    dict(
        id="t-beta1",
        journey="other-journey",
        title="Beta One",
        status="blocked",
        due_date="2026-01-03",
        scheduled_at=None,
        time_hint="morning",
        stage=None,
        context=None,
        source="manual",
        created_at="2026-01-03T00:00:00.000000Z",
        updated_at="2026-01-03T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
    dict(
        id="t-beta2",
        journey="other-journey",
        title="Beta Two Done",
        status="done",
        due_date="2026-01-04",
        scheduled_at=None,
        time_hint=None,
        stage=None,
        context=None,
        source="manual",
        created_at="2026-01-04T00:00:00.000000Z",
        updated_at="2026-01-04T00:00:00.000000Z",
        completed_at="2026-01-04T01:00:00.000000Z",
        metadata=None,
    ),
    dict(
        id="t-noj1",
        journey=None,
        title="No Journey Task",
        status="todo",
        due_date="2026-01-06",
        scheduled_at=None,
        time_hint=None,
        stage=None,
        context=None,
        source="week_plan",
        created_at="2026-01-05T00:00:00.000000Z",
        updated_at="2026-01-05T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
    dict(
        id="t-week-edge-start",
        journey="cv22",
        # Exactly at the week-range start boundary (inclusive).
        title="Week Edge Start",
        status="todo",
        due_date="2026-02-02",
        scheduled_at=None,
        time_hint=None,
        stage=None,
        context=None,
        source="manual",
        created_at="2026-01-10T00:00:00.000000Z",
        updated_at="2026-01-10T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
    dict(
        id="t-week-edge-end",
        journey="cv22",
        # Exactly at the week-range end boundary (inclusive), via scheduled_at.
        title="Week Edge End",
        status="todo",
        due_date=None,
        scheduled_at="2026-02-08T23:59",
        time_hint=None,
        stage=None,
        context=None,
        source="manual",
        created_at="2026-01-11T00:00:00.000000Z",
        updated_at="2026-01-11T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
    dict(
        id="t-week-outside",
        journey="cv22",
        # Just outside the week range on both fields -- must NOT appear.
        title="Week Outside",
        status="todo",
        due_date="2026-02-09",
        scheduled_at=None,
        time_hint=None,
        stage=None,
        context=None,
        source="manual",
        created_at="2026-01-12T00:00:00.000000Z",
        updated_at="2026-01-12T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
    dict(
        id="t-title-fragment-a",
        journey="cv22",
        title="Findable Fragment Task",
        status="todo",
        due_date=None,
        scheduled_at=None,
        time_hint=None,
        stage=None,
        context=None,
        source="manual",
        created_at="2026-01-06T00:00:00.000000Z",
        updated_at="2026-01-06T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
    dict(
        id="t-title-fragment-b",
        journey="other-journey",
        title="Another Findable Fragment",
        status="todo",
        due_date=None,
        scheduled_at=None,
        time_hint=None,
        stage=None,
        context=None,
        source="manual",
        created_at="2026-01-07T00:00:00.000000Z",
        updated_at="2026-01-07T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    ),
)

WEEK_START = "2026-02-02"
WEEK_END = "2026-02-08"


def _seed(store: Store) -> None:
    for fields in SEED_TASKS:
        store.create_task(Task(**fields))


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "fixture.db")
        store = Store(conn)
        _seed(store)

        identity = IdentityService(store, AttachmentService(store))
        journeys = JourneyService(store, identity)
        tasks = TaskService(store, journeys)

        golden = {
            "seed_tasks": [dict(fields) for fields in SEED_TASKS],
            "get_all_tasks": [t.model_dump() for t in store.get_all_tasks()],
            "get_open_tasks_no_journey": [t.model_dump() for t in store.get_open_tasks()],
            "get_open_tasks_journey_cv22": [
                t.model_dump() for t in store.get_open_tasks("cv22")
            ],
            "get_tasks_by_status_todo": [
                t.model_dump() for t in store.get_tasks_by_status("todo")
            ],
            "get_tasks_by_journey_cv22": [
                t.model_dump() for t in store.get_tasks_by_journey("cv22")
            ],
            "find_tasks_by_title_fragment_no_journey": [
                t.model_dump() for t in store.find_tasks_by_title("Findable")
            ],
            "find_tasks_by_title_fragment_journey_other": [
                t.model_dump()
                for t in store.find_tasks_by_title("Findable", "other-journey")
            ],
            "get_tasks_for_week": [
                t.model_dump() for t in store.get_tasks_for_week(WEEK_START, WEEK_END)
            ],
            "week_range": {"start_date": WEEK_START, "end_date": WEEK_END},
            "list_tasks_open_only": [t.model_dump() for t in tasks.list_tasks(open_only=True)],
            "list_tasks_status_todo_journey_cv22": [
                t.model_dump() for t in tasks.list_tasks(journey="cv22", status="todo")
            ],
            "list_tasks_journey_other_no_status": [
                t.model_dump() for t in tasks.list_tasks(journey="other-journey")
            ],
            "list_tasks_all": [t.model_dump() for t in tasks.list_tasks()],
        }

        conn.close()

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"seeded {len(SEED_TASKS)} tasks")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
