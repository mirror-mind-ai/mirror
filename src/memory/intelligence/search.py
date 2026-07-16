"""Hybrid search: semantic similarity + recency + reinforcement + relevance."""

import math
from datetime import datetime, timezone

import numpy as np

from memory.config import (
    MMR_DEDUP_THRESHOLD,
    RECENCY_HALF_LIFE_DAYS,
    REINFORCEMENT_DECAY_DAYS,
    REINFORCEMENT_RETRIEVAL_WEIGHT,
    REINFORCEMENT_USE_WEIGHT,
    SEARCH_WEIGHTS,
)
from memory.intelligence.embeddings import bytes_to_embedding, generate_embedding
from memory.models import Memory, SearchOutcome, SearchResult
from memory.storage.store import Store


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 0.0
    return float(dot / norm)


def _parse_datetime_utc(value: str) -> datetime | None:
    """Parse an ISO timestamp as an aware UTC datetime.

    Mirror historically stores timestamps in a few ISO-compatible shapes:
    naive strings (``2026-01-01T00:00:00``), Z-suffixed UTC strings, and
    offset-aware strings produced by ``datetime.isoformat()``. Search scoring
    must normalize all of them before subtraction; mixing naive and aware
    datetimes raises ``TypeError`` during Builder/Mirror context loading.
    """
    try:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def recency_score(created_at: str) -> float:
    """Exponential decay with configurable half-life."""
    created = _parse_datetime_utc(created_at)
    if created is None:
        return 0.5
    now = datetime.now(timezone.utc)
    days_ago = max(0.0, (now - created).total_seconds() / 86400)
    return math.exp(-math.log(2) * days_ago / RECENCY_HALF_LIFE_DAYS)


def reinforcement_score(
    access_count: int,
    use_count: int,
    last_accessed_at: str | None,
) -> float:
    """Honest reinforcement: use vs retrieval with time decay.

    Distinguishes two signals:
    - use_count: how many times the model explicitly drew on this memory in a
      response. Stronger signal, no decay (a used memory remains relevant).
    - access_count: how many times the memory was retrieved (injected into
      context). Weaker signal, decayed by time since last access — a memory
      retrieved once in 2024 should not stay reinforced forever.

    Weights are configurable via REINFORCEMENT_USE_WEIGHT and
    REINFORCEMENT_RETRIEVAL_WEIGHT (see config.py).
    """
    use_signal = min(1.0, use_count / 5.0)

    retrieval_raw = min(1.0, math.log1p(access_count) / 3.0)
    if access_count > 0 and last_accessed_at:
        last = _parse_datetime_utc(last_accessed_at)
    else:
        last = None

    if last is not None:
        now = datetime.now(timezone.utc)
        days = max(0.0, (now - last).total_seconds() / 86400)
        decay = math.exp(-math.log(2) * days / REINFORCEMENT_DECAY_DAYS)
        retrieval_signal = retrieval_raw * decay
    else:
        # access_count == 0 → retrieval_raw == 0; no last_accessed_at → no decay applied.
        retrieval_signal = retrieval_raw

    return REINFORCEMENT_USE_WEIGHT * use_signal + REINFORCEMENT_RETRIEVAL_WEIGHT * retrieval_signal


def hybrid_score(
    semantic: float,
    recency: float,
    reinforcement: float,
    relevance: float,
) -> float:
    """Combine signals with configurable weights."""
    w = SEARCH_WEIGHTS
    return (
        w["semantic"] * semantic
        + w["recency"] * recency
        + w["reinforcement"] * reinforcement
        + w["relevance"] * relevance
    )


def mmr_dedupe(
    candidates: list[tuple[Memory, float, np.ndarray]],
    limit: int,
    threshold: float,
) -> list[SearchResult]:
    """Maximal Marginal Relevance deduplication.

    Iterates candidates in score order. A candidate is suppressed when its
    cosine similarity to any already-selected result meets or exceeds `threshold`.
    Returns up to `limit` SearchResult values.
    """
    selected: list[SearchResult] = []
    selected_embeddings: list[np.ndarray] = []

    for mem, score, emb in candidates:
        if selected_embeddings:
            max_sim = max(cosine_similarity(emb, s) for s in selected_embeddings)
            if max_sim >= threshold:
                continue
        selected.append(SearchResult(mem, score))
        selected_embeddings.append(emb)
        if len(selected) >= limit:
            break

    return selected


class MemorySearch:
    def __init__(self, store: Store):
        self.store = store

    def search(
        self,
        query: str,
        limit: int = 5,
        memory_type: str | None = None,
        layer: str | None = None,
        journey: str | None = None,
        log_access: bool = True,
    ) -> list[SearchResult]:
        """Hybrid search (semantic + lexical + recency + reinforcement) with MMR dedup.

        Thin wrapper over ``search_with_status`` returning only the results.
        """
        return self.search_with_status(
            query,
            limit=limit,
            memory_type=memory_type,
            layer=layer,
            journey=journey,
            log_access=log_access,
        ).results

    def search_with_status(
        self,
        query: str,
        limit: int = 5,
        memory_type: str | None = None,
        layer: str | None = None,
        journey: str | None = None,
        log_access: bool = True,
    ) -> SearchOutcome:
        """Hybrid search that also reports whether it ran degraded (lexical-only).

        When the query embedding cannot be generated (offline, missing key,
        timeout) the search falls back to the local FTS5 index: the semantic term
        is dropped and only FTS-matched memories are ranked. MMR dedup is
        unaffected — it ranks on the stored memory embeddings, not the query.
        """
        degraded = False
        try:
            query_embedding: np.ndarray | None = generate_embedding(query)
        except Exception:
            query_embedding = None
            degraded = True

        # Load all memories with embeddings and apply filters.
        all_memories = self.store.get_all_memories_with_embeddings()
        if memory_type:
            all_memories = [m for m in all_memories if m.memory_type == memory_type]
        if layer:
            all_memories = [m for m in all_memories if m.layer == layer]
        if journey:
            all_memories = [m for m in all_memories if m.journey == journey]

        # Lexical pass: FTS5 rank scores keyed by memory id.
        fts_lookup = dict(
            self.store.fts_search(query, memory_type=memory_type, layer=layer, journey=journey)
        )

        # Score every candidate. In degraded mode drop the semantic term and keep
        # only FTS matches so results stay lexically relevant (not recency noise).
        lexical_weight = SEARCH_WEIGHTS.get("lexical", 0.0)
        candidates: list[tuple] = []
        for mem in all_memories:
            if mem.embedding is None:
                continue
            if degraded and mem.id not in fts_lookup:
                continue
            emb = bytes_to_embedding(mem.embedding)
            sem = 0.0 if query_embedding is None else cosine_similarity(query_embedding, emb)
            rec = recency_score(mem.created_at)
            access_count = self.store.get_access_count(mem.id)
            reinf = reinforcement_score(access_count, mem.use_count, mem.last_accessed_at)
            score = hybrid_score(sem, rec, reinf, mem.relevance_score)
            score += lexical_weight * fts_lookup.get(mem.id, 0.0)
            candidates.append((mem, score, emb))

        candidates.sort(key=lambda x: x[1], reverse=True)

        # MMR deduplication (ranks on stored embeddings — degraded-safe).
        results = mmr_dedupe(candidates, limit=limit, threshold=MMR_DEDUP_THRESHOLD)

        # Reinforce only on genuine context loads; internal machinery (curation,
        # MCP agent search, exploratory CLI) passes log_access=False (AI-12).
        if log_access:
            for sr in results:
                self.store.log_access(sr.memory.id, context=query[:200])

        return SearchOutcome(results=results, degraded=degraded)
