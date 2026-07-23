"""Generate the committed `tasks import`/`tasks sync` golden fixture
(CV22.DS7.US2 slice 3c).

Ports `TaskService.import_tasks_from_journey_path` / `sync_tasks_from_file`
(`src/memory/services/tasks.py`), which are NOT pure -- each created/completed
task gets a fresh `uuid4()` id and `datetime.now()` timestamp, so the golden
compares STRUCTURAL fields (title, journey, stage, source, status), not exact
ids or timestamps, exactly like `generate_task_store_golden.py` does not need
to for its own oracle (that one avoids the problem by constructing `Task`
objects with explicit fields directly; this one can't, because the oracle
itself is what generates the ids).

Two identity layers matter here, seeded independently to mirror their real
independence:
  - "journey" layer: enumerated by `tasks import`/`sync` with no explicit
    journey argument, and where `sync_file` lives (in `metadata`).
  - "journey_path" layer: the DB-fallback content `get_journey_path` reads
    when no sync file is configured (or the sync file is unreadable).

Run:  uv run python ts/parity/generate_task_import_sync_golden.py
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from memory.db.connection import get_connection
from memory.models import Task
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.services.journey import JOURNEY_LAYER, JOURNEY_PATH_LAYER, JourneyService
from memory.services.tasks import TaskService
from memory.storage.store import Store

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "task-import-sync.golden.json"


def _task_summary(t: Task) -> dict:
    return {"title": t.title, "journey": t.journey, "stage": t.stage, "source": t.source, "status": t.status}


def _seed_journey_and_path(
    identity: IdentityService, journey: str, path_content: str, sync_file: str | None = None
) -> None:
    metadata = json.dumps({"sync_file": sync_file}) if sync_file else None
    identity.set_identity(layer=JOURNEY_LAYER, key=journey, content=f"# {journey}", metadata=metadata)
    identity.set_identity(layer=JOURNEY_PATH_LAYER, key=journey, content=path_content)


def _scenario_import_db_backed_with_dedup(tmp: Path) -> dict:
    """Explicit journey, DB-backed journey_path (no sync file). One title
    already exists for THIS journey (dedup skips it); a same-titled task under
    a DIFFERENT journey does NOT block creation (find_tasks_by_title filters
    by journey)."""
    conn = get_connection(tmp / "s1.db")
    store = Store(conn)
    identity = IdentityService(store, AttachmentService(store))
    journeys = JourneyService(store, identity)
    tasks = TaskService(store, journeys)

    _seed_journey_and_path(
        identity,
        "alpha",
        "\n### Etapa 1: Início\n- [ ] Existing Task\n- [ ] New Task\n",
    )
    # Pre-existing task for THIS journey, matching one of the two -- dedup skip.
    store.create_task(
        Task(id="existing-1", journey="alpha", title="Existing Task", status="todo", source="manual")
    )
    # Same title, DIFFERENT journey -- must NOT block creation under "alpha".
    store.create_task(
        Task(id="other-1", journey="beta", title="New Task", status="todo", source="manual")
    )

    created = tasks.import_tasks_from_journey_path("alpha")
    conn.close()
    return {
        "name": "import_db_backed_with_dedup",
        "journey_arg": "alpha",
        "created": [_task_summary(t) for t in created],
    }


def _scenario_import_sync_file_wins_over_db(tmp: Path) -> dict:
    """A configured, readable sync file's content wins over the DB
    journey_path content entirely."""
    sync_file_path = tmp / "external-journey-path.md"
    sync_file_path.write_text("\n### Etapa 1\n- [ ] From External File\n", encoding="utf-8")

    conn = get_connection(tmp / "s2.db")
    store = Store(conn)
    identity = IdentityService(store, AttachmentService(store))
    journeys = JourneyService(store, identity)
    tasks = TaskService(store, journeys)

    _seed_journey_and_path(
        identity,
        "gamma",
        "\n### Etapa 1\n- [ ] From DB (should be ignored)\n",
        sync_file=str(sync_file_path),
    )

    created = tasks.import_tasks_from_journey_path("gamma")
    conn.close()
    return {
        "name": "import_sync_file_wins_over_db",
        "journey_arg": "gamma",
        "created": [_task_summary(t) for t in created],
    }


def _scenario_import_all_journeys(tmp: Path) -> dict:
    """No explicit journey -> enumerate every 'journey'-layer row (key order)."""
    conn = get_connection(tmp / "s3.db")
    store = Store(conn)
    identity = IdentityService(store, AttachmentService(store))
    journeys = JourneyService(store, identity)
    tasks = TaskService(store, journeys)

    _seed_journey_and_path(identity, "zed", "\n### Etapa 1\n- [ ] Zed Task\n")
    _seed_journey_and_path(identity, "alpha", "\n### Etapa 1\n- [ ] Alpha Task\n")

    all_journeys = [t.key for t in store.get_identity_by_layer("journey")]
    per_journey = {j: [_task_summary(t) for t in tasks.import_tasks_from_journey_path(j)] for j in all_journeys}
    conn.close()
    return {
        "name": "import_all_journeys",
        "journey_arg": None,
        "journey_order": all_journeys,
        "per_journey_created": per_journey,
    }


def _scenario_sync_reconciliation(tmp: Path) -> dict:
    """Exercises created/unchanged/completed counts AND the stale-snapshot
    semantic: 'Both New And Done' is absent from the pre-sync snapshot, gets
    CREATED by the pending loop, but the done loop (working off the SAME
    snapshot taken before either loop ran) does NOT see it and does NOT
    complete it in this call -- Python's real, deliberate behavior."""
    sync_file_path = tmp / "sync-source.md"
    sync_file_path.write_text(
        "\n### Etapa 1: Sprint\n"
        "- [ ] Brand New Task\n"
        "- [ ] Already Have This\n"
        "- [ ] Both New And Done\n"
        "- [x] Already Have This\n"
        "- [x] Already Done Already\n"
        "- [x] Both New And Done\n"
        "- [x] Unknown Done Item\n",
        encoding="utf-8",
    )

    conn = get_connection(tmp / "s4.db")
    store = Store(conn)
    identity = IdentityService(store, AttachmentService(store))
    journeys = JourneyService(store, identity)
    tasks = TaskService(store, journeys)

    _seed_journey_and_path(
        identity, "delta", "\n### Etapa 1\n- [ ] unused DB content\n", sync_file=str(sync_file_path)
    )
    store.create_task(
        Task(id="e1", journey="delta", title="Already Have This", status="todo", source="manual")
    )
    store.create_task(
        Task(id="e2", journey="delta", title="Already Done Already", status="done", source="manual")
    )

    result = tasks.sync_tasks_from_file("delta")
    final_tasks = sorted(
        (_task_summary(t) for t in store.get_tasks_by_journey("delta")),
        key=lambda d: d["title"],
    )
    conn.close()
    return {
        "name": "sync_reconciliation",
        "journey_arg": "delta",
        "result": result,
        "final_tasks_by_title": final_tasks,
    }


def _scenario_sync_no_file_configured_raises(tmp: Path) -> dict:
    conn = get_connection(tmp / "s5.db")
    store = Store(conn)
    identity = IdentityService(store, AttachmentService(store))
    journeys = JourneyService(store, identity)
    tasks = TaskService(store, journeys)
    identity.set_identity(layer=JOURNEY_LAYER, key="epsilon", content="# epsilon")

    error_message = None
    try:
        tasks.sync_tasks_from_file("epsilon")
    except ValueError as e:
        error_message = str(e)
    conn.close()
    return {
        "name": "sync_no_file_configured_raises",
        "journey_arg": "epsilon",
        "error_message": error_message,
    }


def _scenario_sync_file_missing_on_disk_raises(tmp: Path) -> dict:
    conn = get_connection(tmp / "s6.db")
    store = Store(conn)
    identity = IdentityService(store, AttachmentService(store))
    journeys = JourneyService(store, identity)
    tasks = TaskService(store, journeys)
    missing_path = tmp / "does-not-exist.md"
    identity.set_identity(
        layer=JOURNEY_LAYER,
        key="zeta",
        content="# zeta",
        metadata=json.dumps({"sync_file": str(missing_path)}),
    )

    error_message = None
    try:
        tasks.sync_tasks_from_file("zeta")
    except FileNotFoundError as e:
        error_message = str(e)
    conn.close()
    return {
        "name": "sync_file_missing_on_disk_raises",
        "journey_arg": "zeta",
        "error_message": error_message,
    }


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)
        scenarios = [
            _scenario_import_db_backed_with_dedup(tmp),
            _scenario_import_sync_file_wins_over_db(tmp),
            _scenario_import_all_journeys(tmp),
            _scenario_sync_reconciliation(tmp),
            _scenario_sync_no_file_configured_raises(tmp),
            _scenario_sync_file_missing_on_disk_raises(tmp),
        ]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"scenarios": scenarios}, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    for s in scenarios:
        print(f"--- {s['name']} ---")
        print(json.dumps({k: v for k, v in s.items() if k != "name"}, indent=2, ensure_ascii=False))
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
