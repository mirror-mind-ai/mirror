"""Retrieval relevance eval: does the ranker surface the RIGHT memories?
(CV9.E2.S28 / AI-14)

Distinct from evals/retrieval.py, which verifies the scoring *math* is
internally consistent (deterministic contracts, no corpus). This eval asks a
different question: given a real corpus and real queries, does the hybrid
ranker (semantic + recency + reinforcement + relevance + lexical + MMR)
surface memories a human would call relevant? Answered with hit@k and MRR
against a corpus + labeled queries authored independently of the ranker's
output (see evals/_fixtures/retrieval_relevance/authoring.py's rubric) — never
against the ranker's own output, which would be circular.

Frozen, not live (CV9.E2.S28 team decision, ai-engineer + devops-engineer):
corpus and query embeddings were generated once (real embedding model, keyed;
see _fixtures/retrieval_relevance/generate_fixtures.py) and committed. This
run is deterministic and keyless — regenerate the fixture deliberately on an
embedding-model change, the same discipline as the ts-search-parity spike's
golden.json. This eval does NOT tune SEARCH_WEIGHTS — it measures, so a future
weight change becomes a diff, not a guess.

Run with:
    uv run python -m memory eval retrieval_relevance

Free to run — no API calls (frozen embeddings).
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

import numpy as np

import memory.intelligence.search as search_mod
from evals.types import EvalProbe
from memory.db.schema import SCHEMA
from memory.intelligence.embeddings import embedding_to_bytes
from memory.intelligence.search import MemorySearch
from memory.models import Memory
from memory.storage.store import Store

# Measured baseline (2026-07-18, current SEARCH_WEIGHTS): 18/18 hit@k, MRR
# 0.9074, probe score 19/19=1.0 (the always-passing MRR-aggregate probe counts
# toward the denominator). Fully deterministic (frozen embeddings + frozen
# clock) — no sampling noise to buffer against, unlike the live evals. Set
# just below a perfect score so ANY single hit@k regression (18/19=0.947)
# trips it — not loose slack, an exact regression detector.
THRESHOLD = 0.95
# Frozen fixture: no live model call at eval time (see module docstring).
EVAL_MODEL: str | None = None
EVAL_PROMPTS: tuple[str, ...] = ()

_FIXTURES_DIR = Path(__file__).parent / "_fixtures" / "retrieval_relevance"
_SEARCH_LIMIT = 10  # generous window so MRR can see beyond a strict top-k cutoff


def _load_fixture(name: str) -> dict:
    return json.loads((_FIXTURES_DIR / name).read_text())


_CORPUS = _load_fixture("corpus.json")
_QUERIES_DATA = _load_fixture("queries.json")
_FROZEN_NOW = datetime.fromisoformat(_CORPUS["provenance"]["frozen_now"].replace("Z", "+00:00"))


def _build_store() -> Store:
    """Hydrate the frozen corpus into an in-memory store, once, shared
    read-only across every probe (log_access=False in every search call below
    means zero writes — safe to reuse, matching AI-12's discipline).
    """
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    store = Store(conn)
    for mem in _CORPUS["memories"]:
        store.create_memory(
            Memory(
                id=mem["id"],
                title=mem["title"],
                content=mem["content"],
                memory_type=mem["memory_type"],
                layer=mem["layer"],
                created_at=mem["created_at"],
                relevance_score=mem["relevance_score"],
                use_count=mem["use_count"],
                embedding=embedding_to_bytes(np.array(mem["embedding"], dtype=np.float32)),
            )
        )
        for _ in range(mem["access_count"]):
            conn.execute(
                "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) "
                "VALUES (?, ?, ?)",
                (mem["id"], mem["last_accessed_at"], "fixture"),
            )
        if mem["last_accessed_at"]:
            conn.execute(
                "UPDATE memories SET last_accessed_at = ? WHERE id = ?",
                (mem["last_accessed_at"], mem["id"]),
            )
    conn.commit()
    return store


_STORE = _build_store()
_SEARCH_ENGINE = MemorySearch(_STORE)


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return _FROZEN_NOW if tz else _FROZEN_NOW.replace(tzinfo=None)


@contextmanager
def _frozen_clock_and_embedding(query_vec: np.ndarray) -> Iterator[None]:
    """Freeze search.py's datetime + embedding call for exactly one search,
    then restore both — required so this eval never leaks frozen state into
    other eval modules sharing the same process under `eval --all`.
    """
    original_datetime = search_mod.datetime
    original_generate_embedding = search_mod.generate_embedding
    search_mod.datetime = _FrozenDateTime  # type: ignore[assignment]
    search_mod.generate_embedding = lambda _q, **_kw: query_vec  # type: ignore[assignment]
    try:
        yield
    finally:
        search_mod.datetime = original_datetime
        search_mod.generate_embedding = original_generate_embedding


def _search_ids(query: dict) -> list[str]:
    """Run one frozen search for a labeled query; return ranked memory ids."""
    vec = np.array(query["embedding"], dtype=np.float32)
    with _frozen_clock_and_embedding(vec):
        outcome = _SEARCH_ENGINE.search_with_status(
            query["text"], limit=_SEARCH_LIMIT, log_access=False
        )
    return [sr.memory.id for sr in outcome.results]


def _reciprocal_rank(returned_ids: list[str], relevant_ids: list[str]) -> float:
    for i, rid in enumerate(returned_ids):
        if rid in relevant_ids:
            return 1.0 / (i + 1)
    return 0.0


# ---------------------------------------------------------------------------
# Probes: one per labeled query (hit@top_k), plus one aggregate MRR note
# ---------------------------------------------------------------------------


def _make_hit_at_k_probe(query: dict):
    def _run() -> tuple[bool, str]:
        returned = _search_ids(query)
        top_k_ids = returned[: query["top_k"]]
        relevant = query["relevant_ids"]
        hit = any(rid in relevant for rid in top_k_ids)
        rr = _reciprocal_rank(returned, relevant)
        return (
            hit,
            f"relevant={relevant} top_{query['top_k']}={top_k_ids} rr={rr:.3f}",
        )

    return _run


def _mrr_aggregate() -> tuple[bool, str]:
    """Informational only (always passes) — MRR across every labeled query,
    reported so a weight change's effect on ranking position is visible even
    when hit@k alone doesn't move (ai-engineer/devops: report, don't gate).
    """
    rrs = [_reciprocal_rank(_search_ids(q), q["relevant_ids"]) for q in _QUERIES_DATA["queries"]]
    mrr = sum(rrs) / len(rrs) if rrs else 0.0
    return True, f"MRR={mrr:.4f} over {len(rrs)} queries"


PROBES: list[EvalProbe] = [
    EvalProbe(
        id=q["id"],
        description=f"hit@{q['top_k']}: {q['text']!r}",
        run=_make_hit_at_k_probe(q),
    )
    for q in _QUERIES_DATA["queries"]
] + [
    EvalProbe(
        id="mrr-aggregate",
        description="Mean Reciprocal Rank across all labeled queries (informational)",
        run=_mrr_aggregate,
    ),
]
