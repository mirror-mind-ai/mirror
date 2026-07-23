"""Generate the committed cluster_memories golden fixture (CV22.DS7.US3).

`cluster_memories` is pure (no DB, no clock, no provider) -- greedy
single-linkage cosine clustering over a candidate pool. This script drives the
REAL oracle (`memory.intelligence.consolidate.cluster_memories`) over a fully
synthetic, low-dimensional embedding corpus designed to exercise every real
branch:

  - a 3-member cluster (m1 seed, m2/m3 close to the seed, m3 NOT close enough
    to m2 alone -- proving clustering is seed-relative, not centroid/transitive)
  - a 2-member cluster (m4/m5)
  - a singleton that never gets close enough to any seed (m6, dropped)
  - a memory with `readiness_state='integrated'` (m7, terminal, skipped even
    though its embedding is close to m1's cluster)
  - a memory with NO embedding (m8, skipped defensively -- the real
    `consolidate scan` read path never actually supplies this via the
    `embedding IS NOT NULL` SQL filter, but the ported function's defensive
    skip is still graded)
  - a MAX_CLUSTER_SIZE-exhausting seed (m9..m14, all mutually close, six
    candidates so the cluster caps at 5 and one is left over as a dropped
    singleton)

Run:  uv run python ts/parity/generate_cluster_golden.py
"""

from __future__ import annotations

import json
from pathlib import Path

from memory.intelligence.consolidate import DEFAULT_CLUSTER_THRESHOLD, cluster_memories
from memory.intelligence.embeddings import embedding_to_bytes
import numpy as np
from memory.models import Memory

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "cluster.golden.json"


def _vec(*values: float) -> np.ndarray:
    # Pad to a small fixed dimensionality; direction matters, not magnitude
    # (cosine similarity is scale-invariant) or real embedding dimensionality
    # (cluster_memories has no dimension check -- that guard lives in
    # generateEmbeddingSafely, a different seam).
    return np.array(values, dtype=np.float32)


def _mem(
    id_: str,
    vec: np.ndarray | None,
    readiness_state: str = "observed",
    created_at: str = "2026-01-01T00:00:00.000000Z",
) -> Memory:
    return Memory(
        id=id_,
        memory_type="insight",
        layer="ego",
        title=f"Memory {id_}",
        content=f"Synthetic content for {id_}.",
        created_at=created_at,
        embedding=embedding_to_bytes(vec) if vec is not None else None,
        readiness_state=readiness_state,
    )


def _build_corpus() -> list[Memory]:
    return [
        # 3-member cluster: m1 is the seed; m2 and m3 are both close to m1,
        # but m3 is NOT close enough to m2 alone (proves seed-relative, not
        # transitive/centroid clustering).
        _mem("m1", _vec(1.0, 0.0, 0.0, 0.0)),
        _mem("m2", _vec(0.95, 0.05, 0.0, 0.0)),
        _mem("m3", _vec(0.9, 0.0, 0.05, 0.0)),
        # 2-member cluster, orthogonal-ish to the first.
        _mem("m4", _vec(0.0, 1.0, 0.0, 0.0)),
        _mem("m5", _vec(0.0, 0.95, 0.05, 0.0)),
        # Singleton: not close enough to any other seed.
        _mem("m6", _vec(0.0, 0.0, 1.0, 0.0)),
        # Terminal readiness state: close to m1's cluster, but must be
        # excluded from clustering entirely (never appears in any cluster,
        # and does not consume one of m1's cluster slots).
        _mem("m7", _vec(0.99, 0.0, 0.0, 0.0), readiness_state="integrated"),
        # No embedding at all: must be excluded defensively.
        _mem("m8", None),
        # MAX_CLUSTER_SIZE=5 saturation: m9 is the seed, m10-m14 (5 more, all
        # mutually close) so the cluster caps at 5 members and m14 is left
        # over as a dropped singleton.
        _mem("m9", _vec(0.0, 0.0, 0.0, 1.0)),
        _mem("m10", _vec(0.02, 0.0, 0.0, 0.98)),
        _mem("m11", _vec(0.0, 0.02, 0.0, 0.97)),
        _mem("m12", _vec(0.0, 0.0, 0.02, 0.96)),
        _mem("m13", _vec(0.01, 0.01, 0.0, 0.95)),
        _mem("m14", _vec(0.0, 0.01, 0.01, 0.94)),
    ]


def main() -> None:
    corpus = _build_corpus()
    clusters = cluster_memories(corpus, threshold=DEFAULT_CLUSTER_THRESHOLD)

    golden = {
        "meta": {"threshold": DEFAULT_CLUSTER_THRESHOLD},
        "memories": [
            {
                "id": mem.id,
                "embedding": None if mem.embedding is None else list(np.frombuffer(mem.embedding, dtype=np.float32).astype(float)),
                "readiness_state": mem.readiness_state,
            }
            for mem in corpus
        ],
        "expected_clusters": [[mem.id for mem in cluster] for cluster in clusters],
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"threshold: {DEFAULT_CLUSTER_THRESHOLD}")
    for cluster in clusters:
        print(f"  cluster: {[m.id for m in cluster]}")
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
