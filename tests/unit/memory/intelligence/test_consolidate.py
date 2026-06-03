"""Unit tests for cluster_memories() — the pure clustering step of consolidation.

These complement the existing tests/test_consolidation.py integration suite
by exercising cluster_memories() in isolation: no SQLite, no LLM, no fixtures.
Only the pure-function behaviour is checked here.

CV7.E4.S3 — Consolidation as integration.
"""

from __future__ import annotations

import numpy as np

from memory.intelligence.consolidate import (
    DEFAULT_CLUSTER_THRESHOLD,
    MAX_CLUSTER_SIZE,
    cluster_memories,
)
from memory.intelligence.embeddings import embedding_to_bytes
from memory.models import Memory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _memory(embedding: np.ndarray | None, *, readiness: str = "open", mid: str | None = None) -> Memory:
    """Build a Memory with the given embedding and readiness_state.

    All other fields are filled with placeholders sufficient for cluster_memories().
    """
    kwargs: dict = {
        "memory_type": "decision",
        "layer": "ego",
        "title": "test",
        "content": "test",
    }
    if mid is not None:
        kwargs["id"] = mid
    if embedding is not None:
        kwargs["embedding"] = embedding_to_bytes(embedding)
    mem = Memory(**kwargs)
    # readiness_state is set after construction (not always in the model signature).
    mem.readiness_state = readiness
    return mem


def _vec(*components: float) -> np.ndarray:
    return np.array(components, dtype=np.float32)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestClusterMemoriesBasic:
    def test_two_similar_memories_form_one_cluster(self):
        a = _memory(_vec(1.0, 0.0, 0.0), mid="a")
        b = _memory(_vec(1.0, 0.01, 0.0), mid="b")  # cosine ~ 1.0
        clusters = cluster_memories([a, b])
        assert len(clusters) == 1
        assert {m.id for m in clusters[0]} == {"a", "b"}

    def test_two_orthogonal_memories_form_zero_clusters(self):
        a = _memory(_vec(1.0, 0.0, 0.0), mid="a")
        b = _memory(_vec(0.0, 1.0, 0.0), mid="b")
        clusters = cluster_memories([a, b])
        assert clusters == []

    def test_singleton_cluster_is_not_returned(self):
        # Only one eligible memory (the other has no embedding).
        a = _memory(_vec(1.0, 0.0, 0.0), mid="a")
        b = _memory(None, mid="b")
        clusters = cluster_memories([a, b])
        assert clusters == []


class TestClusterMemoriesThreshold:
    def test_higher_threshold_yields_no_clusters(self):
        # cosine ~ 0.5 — below default 0.75.
        a = _memory(_vec(1.0, 1.0, 0.0), mid="a")
        b = _memory(_vec(1.0, 0.0, 0.0), mid="b")
        clusters = cluster_memories([a, b], threshold=0.9)
        assert clusters == []

    def test_lower_threshold_yields_cluster(self):
        # cosine ~ 0.5 — above 0.4 but below default 0.75.
        a = _memory(_vec(1.0, 1.0, 0.0), mid="a")
        b = _memory(_vec(1.0, 0.0, 0.0), mid="b")
        clusters = cluster_memories([a, b], threshold=0.4)
        assert len(clusters) == 1
        assert {m.id for m in clusters[0]} == {"a", "b"}


class TestClusterMemoriesSize:
    def test_cluster_size_capped_at_max(self):
        # 6 highly similar memories — cluster should be capped at MAX_CLUSTER_SIZE.
        vecs = [_vec(1.0, t * 0.001, 0.0) for t in range(6)]
        mems = [_memory(v, mid=f"m{i}") for i, v in enumerate(vecs)]
        clusters = cluster_memories(mems, threshold=0.99)
        assert len(clusters) == 1
        assert len(clusters[0]) == MAX_CLUSTER_SIZE

    def test_oversize_pool_forms_multiple_clusters(self):
        # 7 memories in two visual sub-groups, threshold tuned so each sub-group clusters.
        # Sub-group A: direction (1, 0, 0)
        # Sub-group B: direction (0, 1, 0)
        # Within a sub-group, the second memory is mildly similar to the first.
        group_a = [_memory(_vec(1.0, 0.01, 0.0), mid=f"a{i}") for i in range(3)]
        group_b = [_memory(_vec(0.0, 1.0, 0.01), mid=f"b{i}") for i in range(3)]
        clusters = cluster_memories(group_a + group_b)
        # Each sub-group is a cluster, and no cross-group clustering happens.
        assert len(clusters) == 2
        for c in clusters:
            assert len(c) >= 2


class TestClusterMemoriesFiltering:
    def test_terminal_state_memory_is_skipped(self):
        # 'integrated' is a terminal state per consolidate._TERMINAL_STATES.
        a = _memory(_vec(1.0, 0.0, 0.0), mid="a", readiness="integrated")
        b = _memory(_vec(1.0, 0.01, 0.0), mid="b", readiness="open")
        clusters = cluster_memories([a, b])
        # Only b is eligible, so no cluster.
        assert clusters == []

    def test_memory_without_embedding_is_skipped(self):
        a = _memory(None, mid="a")
        b = _memory(_vec(1.0, 0.0, 0.0), mid="b")
        c = _memory(_vec(1.0, 0.01, 0.0), mid="c")
        clusters = cluster_memories([a, b, c])
        assert len(clusters) == 1
        assert {m.id for m in clusters[0]} == {"b", "c"}

    def test_first_match_wins_per_memory(self):
        # Memory 'c' is similar to both 'a' and 'b', but should only join the first cluster.
        a = _memory(_vec(1.0, 0.0, 0.0), mid="a")
        b = _memory(_vec(0.99, 0.01, 0.0), mid="b")  # similar to a
        c = _memory(_vec(1.0, 0.0, 0.0), mid="c")  # identical to a
        clusters = cluster_memories([a, b, c], threshold=0.9)
        # c should be in only one cluster (a or b's), not both.
        cluster_ids = [{m.id for m in c} for c in clusters]
        c_appears = sum("c" in ids for ids in cluster_ids)
        assert c_appears == 1


class TestClusterMemoriesDefaults:
    def test_default_threshold_is_seventy_five_percent(self):
        # Sanity check on the module-level constant — protects against silent regression.
        assert DEFAULT_CLUSTER_THRESHOLD == 0.75

    def test_max_cluster_size_is_five(self):
        # Sanity check on the module-level constant — protects against silent regression.
        assert MAX_CLUSTER_SIZE == 5
