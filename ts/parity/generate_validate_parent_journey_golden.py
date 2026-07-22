"""Generate the committed parent-journey validation golden (CV22.DS6.US3).

The Python side of the `_validate_parent_journey` parity contract. It seeds a
temporary database with fully synthetic `journey` rows, then drives the REAL
`JourneyService._validate_parent_journey` oracle across cases that cover every
branch, recording each outcome (ok, or the exact ValueError message) so the
TypeScript port can be graded against Python without re-deriving the answer.

Validation is pure over the journey rows (parent existence, the parent's own
parent, and whether the journey already has children), so nothing needs freezing.

Branches exercised:
  - empty parent -> ok (no-op);
  - parent equals the journey -> "cannot be the journey itself";
  - parent absent -> "Parent journey '...' not found";
  - parent already has a parent -> "Only one hierarchy level is supported";
  - the journey already has children -> "cannot also have a parent";
  - a plain valid attach, and a valid attach to an existing parent-of-others.

Run:  uv run python ts/parity/generate_validate_parent_journey_golden.py
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
OUT_PATH = HERE.parent / "test" / "goldens" / "validate-parent-journey.golden.json"

# key, content, parent_journey
SEED_JOURNEYS: tuple[tuple[str, str, str | None], ...] = (
    ("root", "# Root\n**Status:** active", None),
    ("parent-with-child", "# Parent With Child\n**Status:** active", None),
    ("only-child", "# Only Child\n**Status:** active", "parent-with-child"),
    ("grandparent", "# Grandparent\n**Status:** active", None),
    ("mid-level", "# Mid Level\n**Status:** active", "grandparent"),
)

# journey, proposed parent_journey
CASES: tuple[tuple[str, str], ...] = (
    ("solo", ""),                          # empty -> ok
    ("solo", "solo"),                      # self -> error
    ("solo", "ghost"),                     # missing parent -> error
    ("solo", "mid-level"),                 # parent has a parent -> error
    ("parent-with-child", "root"),         # journey has children -> error
    ("new-journey", "root"),               # valid attach to a childless root
    ("new-journey", "parent-with-child"),  # valid attach to an existing parent-of-others
)


def _seed(store: Store) -> None:
    identity = IdentityService(store, AttachmentService(store))
    for key, content, parent in SEED_JOURNEYS:
        metadata = json.dumps({"parent_journey": parent}) if parent else None
        identity.set_identity(layer="journey", key=key, content=content, metadata=metadata)


def _journey_rows(store: Store) -> list[dict]:
    return [
        {"key": ident.key, "content": ident.content or "", "metadata": ident.metadata}
        for ident in store.get_identity_by_layer("journey")
    ]


def _run_case(journeys: JourneyService, journey: str, parent: str) -> dict:
    try:
        journeys._validate_parent_journey(journey, parent)
        return {"journey": journey, "parent_journey": parent, "outcome": "ok", "error": None}
    except ValueError as exc:
        return {
            "journey": journey,
            "parent_journey": parent,
            "outcome": "error",
            "error": str(exc),
        }


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "fixture.db")
        store = Store(conn)
        _seed(store)
        journeys = JourneyService(store, IdentityService(store, AttachmentService(store)))

        rows = _journey_rows(store)
        cases = [_run_case(journeys, journey, parent) for journey, parent in CASES]
        conn.close()

    golden = {"journey_rows": rows, "cases": cases}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    ok = sum(1 for case in cases if case["outcome"] == "ok")
    print(f"journeys: {len(rows)}  cases: {len(cases)} ({ok} ok, {len(cases) - ok} error)")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
