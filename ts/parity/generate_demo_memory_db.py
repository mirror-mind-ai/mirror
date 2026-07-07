"""Generate a public synthetic Mirror memory.db for parity validation.

The generated DB uses the real Mirror schema and storage path, but every row is
fictional. It is intended as a portable source DB for the real-DB-copy parity
harness: the harness still copies a SQLite database before reading it, without
requiring any private local mirror.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from memory.db.connection import get_connection
from memory.intelligence.embeddings import embedding_to_bytes
from memory.models import Memory
from memory.services.attachment import AttachmentService
from memory.services.identity import IdentityService
from memory.storage.store import Store

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
    ),
)

# Synthetic persona routing rows for the portable `detect-persona` parity route.
DEMO_PERSONAS = (
    ("demo-code-reviewer", ["code", "pull request", "refactor", "bug"]),
    ("demo-finance-coach", ["budget", "savings-plan", "investment", "cash flow"]),
    ("demo-garden-planner", ["garden", "soil", "compost bin", "seedling"]),
)


def generate_demo_db(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    for candidate in (path, path.with_suffix(path.suffix + "-wal"), path.with_suffix(path.suffix + "-shm")):
        if candidate.exists():
            candidate.unlink()

    conn = get_connection(path)
    store = Store(conn)
    for mid, title, content, created_at, use_count, relevance, vector, access_count, last_accessed in DEMO_MEMORIES:
        store.create_memory(
            Memory(
                id=mid,
                memory_type="insight",
                layer="ego",
                title=title,
                content=content,
                created_at=created_at,
                relevance_score=relevance,
                use_count=use_count,
                journey="demo-parity",
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
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    generate_demo_db(args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
