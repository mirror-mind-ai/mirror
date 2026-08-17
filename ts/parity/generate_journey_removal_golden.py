"""Generate the committed conservative journey-removal golden (CR053).

Each case uses a fresh temporary database and drives the real released Python
JourneyService.remove_journey path. The golden records the typed association
inventory, exact outcome/error, and postcondition without exposing user data.

Run: uv run python ts/parity/generate_journey_removal_golden.py
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from memory.db.connection import get_connection
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.storage.store import Store

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "journey-removal.golden.json"
NOW = "2026-06-25T12:00:00.000000Z"

CASES = (
    {"name": "missing", "journey": "missing", "journeys": (), "associations": ()},
    {
        "name": "child_blocked",
        "journey": "parent",
        "journeys": (("parent", None), ("child", "parent")),
        "associations": (),
    },
    {
        "name": "task_blocked",
        "journey": "leaf",
        "journeys": (("leaf", None),),
        "associations": ("tasks",),
    },
    {
        "name": "multi_association_order",
        "journey": "leaf",
        "journeys": (("leaf", None),),
        "associations": ("attachments", "journey_paths", "tasks"),
    },
    {
        "name": "empty_leaf_removed",
        "journey": "leaf",
        "journeys": (("leaf", None), ("other", None)),
        "associations": (),
    },
)


def _seed_association(conn, identity: IdentityService, name: str, journey: str) -> None:
    if name == "journey_paths":
        identity.set_identity("journey_path", journey, "# Path")
    elif name == "tasks":
        conn.execute(
            "INSERT INTO tasks (id, journey, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (f"task-{journey}", journey, "Keep", NOW, NOW),
        )
    elif name == "attachments":
        conn.execute(
            """INSERT INTO attachments
               (id, journey_id, name, content, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (f"attachment-{journey}", journey, "keep.md", "Keep", NOW, NOW),
        )
    else:  # pragma: no cover - generator corpus is closed above
        raise AssertionError(f"unsupported association seed: {name}")
    conn.commit()


def _run_case(case: dict) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "fixture.db")
        store = Store(conn)
        identity = IdentityService(store, AttachmentService(store))
        journeys = JourneyService(store, identity)
        for key, parent in case["journeys"]:
            metadata = json.dumps({"parent_journey": parent}) if parent else None
            identity.set_identity("journey", key, f"# {key}", metadata=metadata)
        for association in case["associations"]:
            _seed_association(conn, identity, association, case["journey"])

        associations = store.count_journey_associations(case["journey"])
        try:
            removed = journeys.remove_journey(case["journey"])
            outcome = "ok"
            error = None
        except ValueError as exc:
            removed = False
            outcome = "error"
            error = str(exc)
        exists_after = store.get_identity("journey", case["journey"]) is not None
        conn.close()

    return {
        "name": case["name"],
        "journey": case["journey"],
        "journeys": [{"key": key, "parent_journey": parent} for key, parent in case["journeys"]],
        "associations": list(case["associations"]),
        "expected_counts": associations,
        "outcome": outcome,
        "error": error,
        "removed": removed,
        "exists_after": exists_after,
    }


def main() -> None:
    cases = [_run_case(case) for case in CASES]
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({"cases": cases}, indent=2, sort_keys=True) + "\n")
    print(f"cases: {len(cases)}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
