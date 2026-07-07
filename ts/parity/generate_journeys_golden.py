"""Generate the committed journey-listing golden fixture (CV22.DS2.US3).

This is the Python side of the journey-listing parity contract. It seeds a
temporary database with fully synthetic `journey` identity rows, drives the REAL
`JourneyService.list_journey_options` oracle, and records the ordered options, so
the TypeScript core can be graded against Python without re-deriving the answer.

Like `detect-persona`, journey listing is pure and deterministic (it reads only
identity rows), so nothing needs to be frozen. The synthetic journeys exercise
every ordering branch:

  - two roots with different statuses (active sorts before non-active),
  - roots at the same status ordered by lowercased name,
  - children grouped under their root and sorted the same way,
  - an orphan whose declared parent is absent (treated as a root),
  - name derived from a `#`-prefixed first line, status from `**Status:**`.

Run:  uv run python ts/parity/generate_journeys_golden.py
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
OUT_PATH = HERE.parent / "test" / "goldens" / "journeys.golden.json"

# key, content (first line -> name, **Status:** -> status), parent_journey
SEED_JOURNEYS: tuple[tuple[str, str, str | None], ...] = (
    ("zed-root-active", "# Zed Root Active\n**Status:** active", None),
    ("alpha-root-active", "# Alpha Root Active\n**Status:** active", None),
    ("beta-root-done", "# Beta Root Done\n**Status:** completed", None),
    ("child-paused", "# Child Paused\n**Status:** paused", "alpha-root-active"),
    ("child-active", "# Child Active\n**Status:** active", "alpha-root-active"),
    ("orphan-child", "# Orphan Child\n**Status:** active", "missing-parent"),
)


def _seed_journeys(store: Store) -> None:
    identity = IdentityService(store, AttachmentService(store))
    for key, content, parent in SEED_JOURNEYS:
        metadata = json.dumps({"parent_journey": parent}) if parent else None
        identity.set_identity(layer="journey", key=key, content=content, metadata=metadata)


def _journey_rows(store: Store) -> list[dict]:
    """The journey identity rows exactly as the oracle reads them (ORDER BY key)."""
    return [
        {"key": ident.key, "content": ident.content or "", "metadata": ident.metadata}
        for ident in store.get_identity_by_layer("journey")
    ]


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "fixture.db")
        store = Store(conn)
        _seed_journeys(store)
        journeys = JourneyService(store, IdentityService(store, AttachmentService(store)))

        rows = _journey_rows(store)
        options = journeys.list_journey_options()
        conn.close()

    golden = {
        "journey_rows": rows,
        "expected": options,
        "expected_order": [option["id"] for option in options],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"journeys: {len(rows)}")
    print(f"expected order: {', '.join(golden['expected_order'])}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
