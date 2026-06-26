"""Spike: generate the golden parity corpus from the REAL Python ranker.

This is throwaway spike scaffolding, not core code. Its only job is to prove
one thing: a TypeScript reimplementation of Mirror's hybrid search, reading the
same SQLite file, can reproduce the Python ranker's ordered results.

Design (the two hazards the spike-read surfaced):
  1. The ranker is NOT pure — recency_score and reinforcement_score call
     datetime.now(). We freeze "now" so the oracle is deterministic.
  2. The query embedding comes from an external API. We freeze it.

We drive the REAL `MemorySearch.search` (not a re-derivation) so the golden is
trustworthy. log_access is stubbed to a no-op so the fixture DB stays in the
exact state the oracle scored against (read-only parity).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import memory.intelligence.search as search_mod
from memory.db.connection import get_connection
from memory.intelligence.embeddings import embedding_to_bytes
from memory.intelligence.search import MemorySearch
from memory.models import Memory
from memory.storage.store import Store

HERE = Path(__file__).parent
DB_PATH = HERE / "fixture.db"
FROZEN_NOW = datetime(2026, 6, 23, 12, 0, 0, tzinfo=timezone.utc)
QUERY = "freedom and digital nomad business"
QUERY_VEC = np.array([1.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)
LIMIT = 5

# id, content (lexical surface), created_at, use_count, relevance, embedding,
# access_log rows (count), last_accessed_at
SEED = [
    # high semantic + lexical, recent, lightly used
    ("m1", "Freedom and the digital nomad business model",
     "2026-06-20T12:00:00Z", 3, 0.8, [1.0, 0.45, 0.05, 0, 0, 0, 0, 0],
     2, "2026-06-22T12:00:00Z"),
    # near-duplicate of m1 (cosine >= MMR threshold) -> should be suppressed
    ("m2", "Freedom is a nomad lifestyle of independence",
     "2026-06-21T12:00:00Z", 0, 0.5, [0.99, 0.46, 0.05, 0.01, 0, 0, 0, 0],
     0, None),
    # lexical match but low semantic
    ("m3", "Building a digital business and finding freedom as a nomad",
     "2026-05-01T12:00:00Z", 1, 0.5, [0.0, 0.0, 1.0, 0.5, 0, 0, 0, 0],
     1, "2026-05-15T12:00:00Z"),
    # high semantic, no lexical (missing query words), very recent
    ("m4", "Living where I want and shaping my own time",
     "2026-06-23T11:00:00Z", 0, 0.5, [0.9, 0.5, 0.1, 0, 0, 0, 0, 0],
     0, None),
    # old, unrelated
    ("m5", "Notes on a rainy afternoon in an old cafe",
     "2025-01-01T12:00:00Z", 0, 0.5, [0, 0, 0, 0, 1.0, 0, 0, 0],
     0, None),
    # heavily reinforced (max use + many accesses, recent access)
    ("m6", "A reminder I keep returning to about discipline",
     "2026-03-01T12:00:00Z", 5, 0.5, [0.2, 0.1, 0, 0, 0, 1.0, 0, 0],
     10, "2026-06-23T10:00:00Z"),
    # high manual relevance only
    ("m7", "A pinned principle marked highly relevant",
     "2026-06-01T12:00:00Z", 0, 1.0, [0, 0, 0, 0, 0, 0, 1.0, 0],
     0, None),
    # unrelated
    ("m8", "Random grocery list for the week",
     "2026-06-10T12:00:00Z", 0, 0.5, [0, 0, 0, 0, 0, 0, 0, 1.0],
     0, None),
]


def build_fixture() -> Store:
    if DB_PATH.exists():
        for suffix in ("", "-wal", "-shm"):
            p = Path(str(DB_PATH) + suffix)
            if p.exists():
                p.unlink()
    conn = get_connection(DB_PATH)
    store = Store(conn)
    for (mid, content, created, use_count, relevance, vec, _acc, last_acc) in SEED:
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
    # Seed access log + cached last_accessed_at directly (controls reinforcement).
    for (mid, _c, _cr, _u, _r, _v, acc, last_acc) in SEED:
        for _ in range(acc):
            conn.execute(
                "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) "
                "VALUES (?, ?, ?)",
                (mid, last_acc, "seed"),
            )
        if last_acc is not None:
            conn.execute(
                "UPDATE memories SET last_accessed_at = ? WHERE id = ?", (last_acc, mid)
            )
    conn.commit()
    return store


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):  # noqa: ANN001
        return FROZEN_NOW if tz else FROZEN_NOW.replace(tzinfo=None)


def main() -> None:
    store = build_fixture()

    # Freeze the two non-deterministic inputs and the read-only side effect.
    search_mod.datetime = _FrozenDateTime
    search_mod.generate_embedding = lambda _q: QUERY_VEC
    store.log_access = lambda *a, **k: None  # type: ignore[assignment]

    results = MemorySearch(store).search(QUERY, limit=LIMIT)

    inputs = {
        "query": QUERY,
        "frozen_now": FROZEN_NOW.isoformat().replace("+00:00", "Z"),
        "query_embedding": [float(x) for x in QUERY_VEC],
        "limit": LIMIT,
        "weights": dict(search_mod.SEARCH_WEIGHTS),
        "mmr_threshold": search_mod.MMR_DEDUP_THRESHOLD,
        "recency_half_life_days": search_mod.RECENCY_HALF_LIFE_DAYS,
        "reinforcement_decay_days": search_mod.REINFORCEMENT_DECAY_DAYS,
        "reinforcement_use_weight": search_mod.REINFORCEMENT_USE_WEIGHT,
        "reinforcement_retrieval_weight": search_mod.REINFORCEMENT_RETRIEVAL_WEIGHT,
    }
    golden = {
        "ordered_results": [
            {"id": sr.memory.id, "score": sr.score} for sr in results
        ]
    }
    (HERE / "inputs.json").write_text(json.dumps(inputs, indent=2))
    (HERE / "golden.json").write_text(json.dumps(golden, indent=2))

    print("PY ORACLE (frozen now =", inputs["frozen_now"], ")")
    for i, sr in enumerate(results):
        print(f"  {i}. {sr.memory.id}  score={sr.score:.12f}")
    print("wrote fixture.db, inputs.json, golden.json")


if __name__ == "__main__":
    main()
