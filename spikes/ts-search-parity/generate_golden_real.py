"""Spike: real-DB parity golden generator.

Snapshots a COPY of the real memory.db (read-only source, via SQLite's backup
API — the live file is never opened for write), then drives the REAL ranker over
the copy with real 1536-dim query vectors to produce the golden corpus.

Probes use existing memories' own embeddings as the (frozen) query vector. For
parity the SOURCE of the vector is irrelevant: both Python and TS score the same
frozen 1536-dim vector against the same real embeddings. limit=10 stresses the
tail, where scores cluster and near-tie ordering is most fragile.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

import memory.intelligence.search as search_mod
from memory.db.connection import get_connection
from memory.intelligence.embeddings import bytes_to_embedding
from memory.intelligence.search import MemorySearch
from memory.storage.store import Store

HERE = Path(__file__).parent
REAL = Path.home() / ".mirror-minds" / "vinicius" / "memory.db"
COPY = HERE / "real_copy.db"
FROZEN_NOW = datetime(2026, 6, 23, 12, 0, 0, tzinfo=timezone.utc)
LIMIT = 10
N_PROBES = 8


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):  # noqa: ANN001
        return FROZEN_NOW if tz else FROZEN_NOW.replace(tzinfo=None)


def snapshot() -> None:
    for suffix in ("", "-wal", "-shm"):
        p = Path(str(COPY) + suffix)
        if p.exists():
            p.unlink()
    src = sqlite3.connect(f"file:{REAL}?mode=ro", uri=True)  # read-only, live file untouched
    dst = sqlite3.connect(str(COPY))
    src.backup(dst)
    src.close()
    dst.close()


def main() -> None:
    snapshot()
    conn = get_connection(COPY)
    store = Store(conn)

    rows = conn.execute(
        "SELECT id, title, embedding FROM memories WHERE embedding IS NOT NULL ORDER BY id"
    ).fetchall()
    step = max(1, len(rows) // N_PROBES)
    probe_rows = rows[::step][:N_PROBES]

    search_mod.datetime = _FrozenDateTime
    store.log_access = lambda *a, **k: None  # type: ignore[assignment]

    probes, goldens = [], []
    for r in probe_rows:
        vec = bytes_to_embedding(r["embedding"]).astype(np.float32)
        search_mod.generate_embedding = lambda _q, v=vec: v
        query = r["title"] or r["id"]
        results = MemorySearch(store).search(query, limit=LIMIT)
        probes.append(
            {"probe_id": r["id"], "query": query, "query_embedding": [float(x) for x in vec]}
        )
        goldens.append(
            {
                "probe_id": r["id"],
                "ordered_results": [{"id": sr.memory.id, "score": sr.score} for sr in results],
            }
        )

    inputs = {
        "frozen_now": FROZEN_NOW.isoformat().replace("+00:00", "Z"),
        "limit": LIMIT,
        "weights": dict(search_mod.SEARCH_WEIGHTS),
        "mmr_threshold": search_mod.MMR_DEDUP_THRESHOLD,
        "recency_half_life_days": search_mod.RECENCY_HALF_LIFE_DAYS,
        "reinforcement_decay_days": search_mod.REINFORCEMENT_DECAY_DAYS,
        "reinforcement_use_weight": search_mod.REINFORCEMENT_USE_WEIGHT,
        "reinforcement_retrieval_weight": search_mod.REINFORCEMENT_RETRIEVAL_WEIGHT,
        "probes": probes,
    }
    (HERE / "inputs_real.json").write_text(json.dumps(inputs))
    (HERE / "golden_real.json").write_text(json.dumps({"goldens": goldens}, indent=2))

    print(f"snapshot: {len(rows)} memories | {len(probe_rows)} probes | limit={LIMIT}")
    for p, g in zip(probes, goldens):
        head = ", ".join(x["id"][:8] for x in g["ordered_results"][:5])
        print(f"  probe {p['probe_id'][:8]} ({p['query'][:34]!r:36}) -> {head} ...")


if __name__ == "__main__":
    main()
