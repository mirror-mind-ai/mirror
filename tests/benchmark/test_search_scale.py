"""CV9.E2.S27 (AI-13) — opt-in latency probe at 10k memories.

Not a CI gate: wall-clock timing is inherently flaky across machines/runners,
so this is informational only, per the devops-engineer review on this story.
The deterministic, CI-enforced regression guard for the actual N+1 fix lives in
``tests/unit/memory/services/test_search_reinforcement.py::TestSearchQueryCount``
(statement-count invariant, not timing).

This file lives outside tests/unit/ and tests/integration/, so it is never
collected by the documented verification command or by CI
(.github/workflows/tests.yml runs exactly those two paths). Run explicitly:

    uv run pytest tests/benchmark/ -v -s
"""

import time

import numpy as np
import pytest

from memory.intelligence.embeddings import embedding_to_bytes
from memory.intelligence.search import MemorySearch
from memory.models import Memory

pytestmark = pytest.mark.benchmark

_CORPUS_SIZE = 10_000
_SEED = 42
# Generous, not tight: catches a pathological regression (e.g. an accidental
# O(N^2)) without flaking on ordinary hardware/CI-runner variance.
_GENEROUS_UPPER_BOUND_SECONDS = 30.0


def _seeded_unit_vector(rng: np.random.Generator) -> np.ndarray:
    vec = rng.standard_normal(1536).astype(np.float32)
    return vec / np.linalg.norm(vec)


def _build_corpus(store, size: int, seed: int) -> None:
    """Insert `size` memories with distinct, deterministic embeddings, directly
    via storage (bypassing add_memory's embedding-generation call — this is a
    scale probe for the read path, not a test of embedding generation).
    """
    rng = np.random.default_rng(seed)
    for i in range(size):
        mem = Memory(
            memory_type="insight",
            layer="ego",
            title=f"Memory {i}",
            content=f"synthetic benchmark content {i}",
            embedding=embedding_to_bytes(_seeded_unit_vector(rng)),
        )
        store.create_memory(mem)
        if i % 7 == 0:  # a realistic minority with access history
            store.log_access(mem.id)


def test_search_latency_at_10k_memories(store, mocker):
    """Informational: prints search latency at 10k memories; only fails on a
    pathological (30s+) regression, never on ordinary timing variance.
    """
    rng = np.random.default_rng(_SEED)
    query_vec = _seeded_unit_vector(rng)
    mocker.patch("memory.intelligence.search.generate_embedding", return_value=query_vec)

    _build_corpus(store, _CORPUS_SIZE, _SEED)

    search_engine = MemorySearch(store)
    started = time.monotonic()
    outcome = search_engine.search_with_status("synthetic benchmark", log_access=False)
    elapsed = time.monotonic() - started

    print(f"\n[benchmark] search_with_status over {_CORPUS_SIZE} memories: {elapsed:.3f}s")
    assert len(outcome.results) > 0
    assert elapsed < _GENEROUS_UPPER_BOUND_SECONDS
