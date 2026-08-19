"""Generate deterministic Mirror Mode core parity fixtures (CV22.DS7.US4).

The corpus is synthetic and exercises the exact Python context order, selected-journey
isolation, Mirror transition rendering, active-journey listing, and summary-title rules.
No production Mirror home or provider is read.

Run: uv run python ts/parity/generate_mirror_mode_golden.py
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from memory.db.connection import get_connection
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.skills.mirror import title_from_summary
from memory.storage.store import Store
from memory.surfaces.mode_transition import render_mirror_mode_transition

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "mirror-mode.golden.json"

IDENTITIES = (
    ("ego", "constraints", "Never invent"),
    ("self", "soul", "Soul"),
    ("ego", "behavior", "Behavior"),
    ("user", "identity", "User"),
    ("ego", "identity", "Ego"),
    ("persona", "engineer", "Engineer"),
    ("persona", "writer", "Writer"),
    ("knowledge", "a", "Knowledge A"),
    (
        "journey",
        "parent",
        "# Parent\n**Status:** active\n\n## Description\nParent context\n\n## End",
    ),
    (
        "journey",
        "selected",
        "# Selected\n**Status:** active\n\n## Description\nSelected context\n\n## End",
    ),
    ("journey", "child", "# Child\n**Status:** planned\n\n## Description\nChild context\n\n## End"),
    ("shadow", "one", "Shadow pattern"),
)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        conn = get_connection(Path(tmp) / "fixture.db")
        store = Store(conn)
        identity = IdentityService(store, AttachmentService(store))
        for layer, key, content in IDENTITIES:
            identity.set_identity(layer, key, content)
        context = identity.load_mirror_context(
            persona="engineer",
            journey="selected",
            touches_identity=True,
            touches_shadow=True,
        )
        active = JourneyService(store, identity).list_active_journeys()
        conn.close()

    golden = {
        "identities": [
            {"layer": layer, "key": key, "content": content} for layer, key, content in IDENTITIES
        ],
        "context": context,
        "transition": render_mirror_mode_transition(
            identity="mirror-dev",
            journey="selected",
            personas=["writer", "engineer"],
        ),
        "active_journeys": active,
        "titles": [
            {
                "summary": "First sentence. More detail.",
                "expected": title_from_summary("First sentence. More detail."),
            },
            {
                "summary": "word " * 20 + ". ignored",
                "expected": title_from_summary("word " * 20 + ". ignored"),
            },
        ],
    }
    OUT_PATH.write_text(
        json.dumps(golden, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
