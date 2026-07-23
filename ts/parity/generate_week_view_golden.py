"""Generate the committed `week view` golden fixture (CV22.DS7.US2 slice 3b).

`cmd_view` (`src/memory/cli/week.py`) is not pure -- it calls `datetime.now()`
directly and prints its result rather than returning data -- so this generator
uses the SAME frozen-datetime monkeypatch technique as
`generate_golden.py` (search ranker parity): a `_FrozenDateTime` subclass is
installed as `week_mod.datetime`, so every `datetime.now()` call inside
`cmd_view` returns one fixed instant, and the oracle's full rendered STDOUT is
captured (via `redirect_stdout`) as the golden -- this is a `transport=verbatim`
surface (DS7's own discipline: rendered-surface parity is string-exact, not a
re-derivation of the underlying data).

`FROZEN_NOW` is a NAIVE local datetime (no tzinfo), exactly like Python's own
`datetime.now()` -- both Python's naive datetime and JS's local `Date`
constructor store literal calendar/clock fields with no timezone conversion, so
using the same numeric fields in TS reproduces this instant identically
regardless of the machine's actual system timezone.

Run:  uv run python ts/parity/generate_week_view_golden.py
"""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
from datetime import datetime
from pathlib import Path

import memory.cli.week as week_mod
from memory.db.connection import get_connection
from memory.models import Task
from memory.storage.store import Store

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "week-view.golden.json"

# Wednesday, so the week (Mon 2026-03-02 .. Sun 2026-03-08) has both past and
# future days relative to "today", exercising the (today) marker and overdue
# logic meaningfully.
FROZEN_NOW = datetime(2026, 3, 4, 10, 30, 0)


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):  # noqa: ARG003 - matches the datetime.now(tz) signature
        return FROZEN_NOW


def _seed(store: Store, tasks: tuple[dict, ...]) -> None:
    for fields in tasks:
        store.create_task(Task(**fields))


def _task(
    id: str,
    title: str,
    *,
    status: str = "todo",
    due_date: str | None = None,
    scheduled_at: str | None = None,
    time_hint: str | None = None,
    journey: str | None = None,
) -> dict:
    return dict(
        id=id,
        journey=journey,
        title=title,
        status=status,
        due_date=due_date,
        scheduled_at=scheduled_at,
        time_hint=time_hint,
        stage=None,
        context=None,
        source="manual",
        created_at="2026-03-01T00:00:00.000000Z",
        updated_at="2026-03-01T00:00:00.000000Z",
        completed_at=None,
        metadata=None,
    )


# The full multi-branch scenario, seeded across the frozen week
# (Mon 2026-03-02 .. Sun 2026-03-08; "today" = Wed 2026-03-04 10:30).
FULL_WEEK_TASKS: tuple[dict, ...] = (
    # Monday (past day): a done task due today-2 (must NOT show overdue, done
    # is exempt) and a todo task due today-2 (MUST show overdue).
    _task("t-mon-done", "Monday Done Task", status="done", due_date="2026-03-02"),
    _task("t-mon-overdue", "Monday Overdue Task", status="todo", due_date="2026-03-02"),
    # Tuesday (past day): scheduled in the past, still todo -> EXCLUDED
    # entirely by the visible-tasks filter (scheduled + not done + sched < now).
    _task(
        "t-tue-past-scheduled",
        "Tuesday Past Scheduled (excluded)",
        status="todo",
        scheduled_at="2026-03-03T09:00",
    ),
    # Wednesday (TODAY): three tasks to prove the (scheduled_at, time_hint,
    # title) sort key, plus a due-today task proving due_date == today is NOT
    # overdue (only strictly < today counts).
    _task(
        "t-wed-scheduled",
        "Wednesday Scheduled Afternoon",
        status="doing",
        scheduled_at="2026-03-04T14:00",
    ),
    # NOTE: a task needs due_date OR scheduled_at to be selected by
    # get_tasks_for_week's WHERE clause at all -- time_hint alone (with
    # neither) is invisible to the query, not merely unsorted. These three
    # share due_date=today so they land in Wednesday's group alongside the
    # scheduled task, exercising the (scheduled_at, time_hint, title) sort key.
    _task(
        "t-wed-time-hint",
        "Wednesday Time Hint",
        status="blocked",
        due_date="2026-03-04",
        time_hint="afternoon",
    ),
    _task("t-wed-bare-a", "Wednesday Bare Alpha", status="todo", due_date="2026-03-04"),
    _task("t-wed-bare-b", "Wednesday Bare Beta", status="todo", due_date="2026-03-04"),
    _task("t-wed-due-today", "Wednesday Due Today Not Overdue", status="todo", due_date="2026-03-04"),
    # Thursday: a plain due-date done task -> the (done, no scheduled_at) icon.
    _task("t-thu-done", "Thursday Done Task", status="done", due_date="2026-03-05"),
    # Friday: scheduled_at present AND done -> icon is STILL the scheduled
    # pin (scheduled_at takes priority over status in Python's icon ternary),
    # plus a journey to exercise the journey suffix.
    _task(
        "t-fri-scheduled-done",
        "Friday Scheduled Done",
        status="done",
        scheduled_at="2026-03-06T08:00",
        journey="cv22",
    ),
    # Saturday: deliberately no tasks (the day must be skipped entirely, not
    # printed with an empty header).
    # Sunday (last day of the week, the end boundary): a plain todo.
    _task("t-sun-plain", "Sunday Plain Task", status="todo", due_date="2026-03-08"),
)


def _run_view_capturing_stdout(store: Store) -> str:
    class _FakeMemoryClient:
        def __init__(self, s: Store) -> None:
            self.store = s

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        week_mod.cmd_view(_FakeMemoryClient(store))
    return buf.getvalue()


def _scenario(name: str, tasks: tuple[dict, ...]) -> dict:
    original_datetime = week_mod.datetime
    week_mod.datetime = _FrozenDateTime
    try:
        with tempfile.TemporaryDirectory() as tmp:
            conn = get_connection(Path(tmp) / "fixture.db")
            store = Store(conn)
            _seed(store, tasks)
            stdout = _run_view_capturing_stdout(store)
            conn.close()
    finally:
        week_mod.datetime = original_datetime
    return {
        "name": name,
        "frozen_now": FROZEN_NOW.isoformat(),
        "seed_tasks": [dict(t) for t in tasks],
        "expected_stdout": stdout,
    }


def main() -> None:
    scenarios = [
        _scenario("full_week", FULL_WEEK_TASKS),
        _scenario("empty_week", ()),
        _scenario(
            "all_filtered_out",
            (
                _task(
                    "t-only-past-scheduled",
                    "Only Past Scheduled",
                    status="todo",
                    scheduled_at="2026-03-03T09:00",
                ),
            ),
        ),
    ]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"scenarios": scenarios}, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    for s in scenarios:
        print(f"--- {s['name']} ---")
        print(s["expected_stdout"])
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
