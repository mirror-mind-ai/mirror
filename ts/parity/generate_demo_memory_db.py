"""Generate a public synthetic Mirror memory.db for parity validation.

The generated DB uses the real Mirror schema and storage path, but every row is
fictional. It is intended as a portable source DB for the real-DB-copy parity
harness: the harness still copies a SQLite database before reading it, without
requiring any private local mirror.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from memory.db.connection import get_connection
from memory.intelligence.embeddings import embedding_to_bytes
from memory.models import Consolidation, Memory, Task
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.storage.store import Store

# id, title, content, created_at, use_count, relevance, vector, access_count,
# last_accessed, memory_type, layer, journey. Types/layers/journeys are varied so
# the listing filter probes demonstrably narrow the result set.
DEMO_MEMORIES = (
    (
        "demo-search-1",
        "Search parity foundation",
        "A synthetic memory about Mirror search parity and TypeScript ranker migration.",
        "2026-06-20T12:00:00Z",
        3,
        0.8,
        [1.0, 0.45, 0.05, 0.0, 0.0, 0.0, 0.0, 0.0],
        2,
        "2026-06-22T12:00:00Z",
        "insight",
        "ego",
        "demo-parity",
    ),
    (
        "demo-builder-1",
        "Builder validation route",
        "A synthetic memory about Builder Mode validation routes and redacted evidence.",
        "2026-06-21T12:00:00Z",
        2,
        0.7,
        [0.82, 0.5, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0],
        3,
        "2026-06-22T15:00:00Z",
        "decision",
        "ego",
        "demo-parity",
    ),
    (
        "demo-identity-1",
        "Identity context",
        "A synthetic memory about identity context, persona routing, and local-first continuity.",
        "2026-06-10T12:00:00Z",
        1,
        0.6,
        [0.1, 0.0, 1.0, 0.45, 0.0, 0.0, 0.0, 0.0],
        1,
        "2026-06-11T12:00:00Z",
        "insight",
        "self",
        "demo-identity",
    ),
    (
        "demo-runtime-1",
        "Runtime mode",
        "A synthetic memory about runtime modes, sessions, and thin interface contracts.",
        "2026-05-25T12:00:00Z",
        0,
        0.5,
        [0.0, 0.0, 0.7, 0.7, 0.1, 0.0, 0.0, 0.0],
        0,
        None,
        "pattern",
        "shadow",
        "demo-parity",
    ),
    (
        "demo-conversation-1",
        "Conversation search",
        "A synthetic memory about conversation search, memory listing, and deterministic read models.",
        "2026-05-20T12:00:00Z",
        5,
        0.5,
        [0.2, 0.1, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
        4,
        "2026-06-20T12:00:00Z",
        "insight",
        "ego",
        "demo-conversations",
    ),
    (
        "demo-journey-1",
        "Journey map",
        "A synthetic memory about journey maps, roadmap hierarchy, and baton handoff.",
        "2026-06-01T12:00:00Z",
        0,
        0.9,
        [0.0, 0.2, 0.0, 0.0, 0.0, 1.0, 0.1, 0.0],
        0,
        None,
        "idea",
        "ego",
        "demo-parity",
    ),
)


# Synthetic persona routing rows for the portable `detect-persona` parity route.
DEMO_PERSONAS = (
    ("demo-code-reviewer", ["code", "pull request", "refactor", "bug"]),
    ("demo-finance-coach", ["budget", "savings-plan", "investment", "cash flow"]),
    ("demo-garden-planner", ["garden", "soil", "compost bin", "seedling"]),
)

# Synthetic journey identity rows (with hierarchy) for the portable journey route.
# key, content (first line -> name, **Status:** -> status), parent_journey
DEMO_JOURNEYS = (
    ("demo-root-active", "# Demo Root Active\n**Status:** active", None),
    ("demo-root-done", "# Demo Root Done\n**Status:** completed", None),
    ("demo-child-beta", "# Demo Child Beta\n**Status:** active", "demo-root-active"),
    ("demo-child-alpha", "# Demo Child Alpha\n**Status:** paused", "demo-root-active"),
)


# Synthetic consolidation proposals (CV22.DS7.US3) for the portable
# `consolidate list`/`shadow list` real-DB-copy cluster/listing probes.
# `source_memory_ids` references real DEMO_MEMORIES ids so a Navigator running
# the harness by hand sees a coherent, inspectable fixture.
DEMO_CONSOLIDATIONS = (
    dict(
        id="demo-consolidation-pending",
        action="identity_update",
        proposal="A synthetic surfaced pattern about search parity, pending review.",
        source_memory_ids=json.dumps(["demo-search-1", "demo-builder-1"]),
        target_layer="ego",
        target_key="behavior",
        rationale="seen across two synthetic memories",
        status="pending",
        created_at="2026-06-23T09:00:00Z",
    ),
    dict(
        id="demo-consolidation-accepted",
        action="shadow_candidate",
        proposal="A synthetic shadow-candidate observation, already accepted.",
        source_memory_ids=json.dumps(["demo-runtime-1"]),
        target_layer=None,
        target_key=None,
        rationale="a synthetic recurring pattern",
        status="accepted",
        created_at="2026-06-22T09:00:00Z",
    ),
    dict(
        id="demo-consolidation-rejected",
        action="merge",
        proposal="A synthetic merge proposal, rejected by the demo Navigator.",
        source_memory_ids=json.dumps(["demo-journey-1"]),
        target_layer=None,
        target_key=None,
        rationale=None,
        status="rejected",
        created_at="2026-06-21T09:00:00Z",
    ),
)


def _demo_tasks() -> list[dict]:
    """Synthetic tasks (CV22.DS7.US2) for the portable `tasks list`/`week view`
    routes. Dates are computed RELATIVE to the current real week (not fixed
    historical dates, unlike DEMO_MEMORIES) so the week-view probe -- which
    reads the real current Monday..Sunday range, not a frozen one -- has
    tasks to find whenever the demo DB is generated and the harness is run
    shortly after (the documented, expected two-step workflow). Journey,
    status, and due/scheduled variety mirror DEMO_MEMORIES' filter-probe
    diversity intent.
    """
    today = date.today()
    monday = today - timedelta(days=today.weekday())

    def iso(offset_days: int) -> str:
        return (monday + timedelta(days=offset_days)).isoformat()

    return [
        dict(
            id="demo-task-mon",
            journey="demo-root-active",
            title="Demo Task Monday",
            status="todo",
            due_date=iso(0),
            stage="Setup",
            source="manual",
        ),
        dict(
            id="demo-task-wed-scheduled",
            journey="demo-root-active",
            title="Demo Task Wednesday Scheduled",
            status="doing",
            scheduled_at=f"{iso(2)}T14:00",
            source="manual",
        ),
        dict(
            id="demo-task-thu-done",
            journey="demo-child-beta",
            title="Demo Task Thursday Done",
            status="done",
            due_date=iso(3),
            source="manual",
        ),
        dict(
            id="demo-task-fri-blocked",
            journey=None,
            title="Demo Task Friday Blocked",
            status="blocked",
            due_date=iso(4),
            source="manual",
        ),
        dict(
            id="demo-task-next-week",
            journey="demo-root-active",
            title="Demo Task Next Week",
            status="todo",
            due_date=iso(7),
            source="manual",
        ),
        dict(
            id="demo-task-last-week-done",
            journey="demo-child-beta",
            title="Demo Task Last Week Done",
            status="done",
            due_date=iso(-6),
            source="manual",
        ),
    ]


def generate_demo_db(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    for candidate in (path, path.with_suffix(path.suffix + "-wal"), path.with_suffix(path.suffix + "-shm")):
        if candidate.exists():
            candidate.unlink()

    conn = get_connection(path)
    store = Store(conn)
    for (
        mid,
        title,
        content,
        created_at,
        use_count,
        relevance,
        vector,
        access_count,
        last_accessed,
        memory_type,
        layer,
        journey,
    ) in DEMO_MEMORIES:
        store.create_memory(
            Memory(
                id=mid,
                memory_type=memory_type,
                layer=layer,
                title=title,
                content=content,
                created_at=created_at,
                relevance_score=relevance,
                use_count=use_count,
                journey=journey,
                embedding=embedding_to_bytes(np.array(vector, dtype=np.float32)),
            )
        )
        for _ in range(access_count):
            conn.execute(
                "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
                (mid, last_accessed, "demo-parity"),
            )
        if last_accessed is not None:
            conn.execute("UPDATE memories SET last_accessed_at = ? WHERE id = ?", (last_accessed, mid))
    conn.commit()

    identity = IdentityService(store, AttachmentService(store))
    for key, keywords in DEMO_PERSONAS:
        identity.set_identity(
            layer="persona",
            key=key,
            content=f"Synthetic persona {key} for parity fixtures.",
            metadata=json.dumps({"routing_keywords": keywords}),
        )
    for key, content, parent in DEMO_JOURNEYS:
        identity.set_identity(
            layer="journey",
            key=key,
            content=content,
            metadata=json.dumps({"parent_journey": parent}) if parent else None,
        )
    for fields in _demo_tasks():
        store.create_task(Task(**fields))
    for fields in DEMO_CONSOLIDATIONS:
        store.create_consolidation(Consolidation(**fields))
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    generate_demo_db(args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
