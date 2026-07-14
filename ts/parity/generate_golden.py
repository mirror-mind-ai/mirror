"""Generate the committed golden-corpus parity fixture (CV22.DS2.TS2).

This is the Python side of the language-agnostic parity contract. It drives the
REAL hybrid ranker (`MemorySearch.search`) over a small synthetic corpus and
records what the oracle returned, so the TypeScript core can be graded against
Python without re-deriving the answer.

The ranker is not pure, so two inputs are frozen to make the oracle
deterministic and offline:

  1. `datetime.now()` (read inside recency/reinforcement scoring) -> FROZEN_NOW.
  2. the query embedding (normally an OpenAI call) -> QUERY_VEC.

`log_access` is stubbed to a no-op so the fixture stays in the exact state the
oracle scored against. The corpus is fully synthetic (no personal data) and the
output is committed, so CI can verify parity with no network and no real DB.

Run:  uv run python ts/parity/generate_golden.py
"""

from __future__ import annotations

import base64
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import memory.intelligence.search as search_mod
from memory.db.connection import get_connection
from memory.intelligence.embeddings import embedding_to_bytes
from memory.intelligence.search import MemorySearch, _parse_datetime_utc
from memory.models import Memory
from memory.storage.store import Store

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "hybrid-search.golden.json"

FROZEN_NOW = datetime(2026, 6, 23, 12, 0, 0, tzinfo=timezone.utc)
QUERY = "freedom and digital nomad business"
QUERY_VEC = np.array([1.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
LIMIT = 5

# id, content (lexical surface), created_at, use_count, relevance, embedding,
# access_log row count, last_accessed_at
SEED = [
    ("m1", "Freedom and the digital nomad business model",
     "2026-06-20T12:00:00Z", 3, 0.8, [1.0, 0.45, 0.05, 0, 0, 0, 0, 0],
     2, "2026-06-22T12:00:00Z"),
    ("m2", "Freedom is a nomad lifestyle of independence",
     "2026-06-21T12:00:00Z", 0, 0.5, [0.99, 0.46, 0.05, 0.01, 0, 0, 0, 0],
     0, None),
    ("m3", "Building a digital business and finding freedom as a nomad",
     "2026-05-01T12:00:00Z", 1, 0.5, [0.0, 0.0, 1.0, 0.5, 0, 0, 0, 0],
     1, "2026-05-15T12:00:00Z"),
    ("m4", "Living where I want and shaping my own time",
     "2026-06-23T11:00:00Z", 0, 0.5, [0.9, 0.5, 0.1, 0, 0, 0, 0, 0],
     0, None),
    ("m5", "Notes on a rainy afternoon in an old cafe",
     "2025-01-01T12:00:00Z", 0, 0.5, [0, 0, 0, 0, 1.0, 0, 0, 0],
     0, None),
    ("m6", "A reminder I keep returning to about discipline",
     "2026-03-01T12:00:00Z", 5, 0.5, [0.2, 0.1, 0, 0, 0, 1.0, 0, 0],
     10, "2026-06-23T10:00:00Z"),
    ("m7", "A pinned principle marked highly relevant",
     "2026-06-01T12:00:00Z", 0, 1.0, [0, 0, 0, 0, 0, 0, 1.0, 0],
     0, None),
    ("m8", "Random grocery list for the week",
     "2026-06-10T12:00:00Z", 0, 0.5, [0, 0, 0, 0, 0, 0, 0, 1.0],
     0, None),
]


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return FROZEN_NOW if tz else FROZEN_NOW.replace(tzinfo=None)


def _to_ms(value: str | None) -> int | None:
    parsed = _parse_datetime_utc(value) if value else None
    return int(parsed.timestamp() * 1000) if parsed else None


def _build_fixture(db_path: Path) -> Store:
    conn = get_connection(db_path)
    store = Store(conn)
    for mid, content, created, use_count, relevance, vec, _acc, _last in SEED:
        store.create_memory(
            Memory(
                id=mid,
                memory_type="insight",
                layer="ego",
                title=mid,
                content=content,
                created_at=created,
                relevance_score=relevance,
                use_count=use_count,
                embedding=embedding_to_bytes(np.array(vec, dtype=np.float32)),
            )
        )
    for mid, _c, _cr, _u, _r, _v, acc, last in SEED:
        for _ in range(acc):
            conn.execute(
                "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) "
                "VALUES (?, ?, ?)",
                (mid, last, "seed"),
            )
        if last is not None:
            conn.execute("UPDATE memories SET last_accessed_at = ? WHERE id = ?", (last, mid))
    conn.commit()
    return store


def _memory_entries(store: Store) -> list[dict]:
    lexical_scores = dict(store.fts_search(QUERY))
    entries: list[dict] = []
    for mid, content, created, use_count, relevance, vec, access_count, last_accessed in SEED:
        raw = embedding_to_bytes(np.array(vec, dtype=np.float32))
        decoded = [float(x) for x in np.frombuffer(raw, dtype=np.float32)]
        entries.append(
            {
                "id": mid,
                "content": content,
                "created_at": created,
                "created_at_ms": _to_ms(created),
                "last_accessed_at": last_accessed,
                "last_accessed_at_ms": _to_ms(last_accessed),
                "use_count": use_count,
                "relevance_score": relevance,
                "access_count": access_count,
                "lexical_score": lexical_scores.get(mid, 0.0),
                "embedding_b64": base64.b64encode(raw).decode("ascii"),
                "embedding": decoded,
            }
        )
    return entries


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = _build_fixture(Path(tmp) / "fixture.db")

        # Freeze the two impure inputs and the read-only side effect.
        search_mod.datetime = _FrozenDateTime
        search_mod.generate_embedding = lambda _q: QUERY_VEC
        store.log_access = lambda *a, **k: None  # type: ignore[assignment]

        results = MemorySearch(store).search(QUERY, limit=LIMIT)

    golden = {
        "meta": {
            "query": QUERY,
            "query_embedding": [float(x) for x in QUERY_VEC],
            "frozen_now": FROZEN_NOW.isoformat().replace("+00:00", "Z"),
            "frozen_now_ms": int(FROZEN_NOW.timestamp() * 1000),
            "limit": LIMIT,
            "weights": dict(search_mod.SEARCH_WEIGHTS),
            "mmr_threshold": search_mod.MMR_DEDUP_THRESHOLD,
            "recency_half_life_days": search_mod.RECENCY_HALF_LIFE_DAYS,
            "reinforcement_decay_days": search_mod.REINFORCEMENT_DECAY_DAYS,
            "reinforcement_use_weight": search_mod.REINFORCEMENT_USE_WEIGHT,
            "reinforcement_retrieval_weight": search_mod.REINFORCEMENT_RETRIEVAL_WEIGHT,
        },
        "memories": _memory_entries(store),
        "expected_order": [sr.memory.id for sr in results],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"frozen now: {golden['meta']['frozen_now']}")
    print(f"expected order: {', '.join(golden['expected_order'])}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
