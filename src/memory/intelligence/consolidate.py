"""Consolidation intelligence: clustering similar memories and generating proposals.

CV7.E4.S3 — Consolidation as integration.

The consolidation pipeline has two steps:
1. cluster_memories(): group semantically similar memories using cosine similarity
2. propose_consolidation(): call an LLM to propose a merge, identity update, or shadow candidate

The results are stored as Consolidation rows (status='pending') and reviewed by the user
via the mm-consolidate skill.
"""

from __future__ import annotations

import json
from collections.abc import Callable

import numpy as np

from memory.config import EXTRACTION_MODEL
from memory.intelligence.embeddings import bytes_to_embedding
from memory.intelligence.llm_router import LLMResponse, send_to_model
from memory.intelligence.prompts import CONSOLIDATION_PROMPT, fence_untrusted
from memory.intelligence.search import cosine_similarity
from memory.models import Consolidation, Memory

# Minimum cosine similarity to include two memories in the same cluster.
DEFAULT_CLUSTER_THRESHOLD = 0.75

# Maximum memories per cluster (prevents unwieldy LLM prompts).
MAX_CLUSTER_SIZE = 5

# Readiness states that are considered "already done" — skip for clustering.
_TERMINAL_STATES = {"integrated"}


def cluster_memories(
    memories: list[Memory],
    threshold: float = DEFAULT_CLUSTER_THRESHOLD,
) -> list[list[Memory]]:
    """Group semantically similar memories into clusters.

    Uses greedy single-linkage: a memory joins an existing cluster when its
    cosine similarity to the cluster seed (first member) meets the threshold.
    A memory can only belong to one cluster (first match wins).

    Memories with no embedding or in a terminal readiness state are skipped.
    Singleton groups (clusters of one) are not returned.

    Args:
        memories: Candidate pool to cluster.
        threshold: Minimum cosine similarity to the cluster seed.

    Returns:
        List of clusters, each a list of ≥2 Memory objects.
    """
    # Filter to memories worth clustering: have an embedding, not terminal.
    eligible = [
        m for m in memories if m.embedding is not None and m.readiness_state not in _TERMINAL_STATES
    ]

    if len(eligible) < 2:
        return []

    # Pre-compute embeddings.
    embeddings: dict[str, np.ndarray] = {}
    for mem in eligible:
        emb = bytes_to_embedding(mem.embedding)  # type: ignore[arg-type]
        if emb is not None:
            embeddings[mem.id] = emb

    eligible = [m for m in eligible if m.id in embeddings]

    assigned: set[str] = set()
    clusters: list[list[Memory]] = []

    for seed in eligible:
        if seed.id in assigned:
            continue
        cluster = [seed]
        assigned.add(seed.id)
        seed_emb = embeddings[seed.id]

        for candidate in eligible:
            if candidate.id in assigned:
                continue
            if len(cluster) >= MAX_CLUSTER_SIZE:
                break
            sim = cosine_similarity(seed_emb, embeddings[candidate.id])
            if sim >= threshold:
                cluster.append(candidate)
                assigned.add(candidate.id)

        if len(cluster) >= 2:
            clusters.append(cluster)

    return clusters


def _format_cluster(cluster: list[Memory]) -> str:
    """Format a memory cluster as readable text for the LLM prompt."""
    lines = []
    for i, mem in enumerate(cluster, 1):
        lines.append(f"### Memory {i}")
        lines.append(f"**Type:** {mem.memory_type} | **Layer:** {mem.layer}")
        if mem.journey:
            lines.append(f"**Journey:** {mem.journey}")
        lines.append(f"**Created:** {mem.created_at[:10]}")
        lines.append(f"**Title:** {mem.title}")
        lines.append(f"**Content:** {mem.content}")
        if mem.context:
            lines.append(f"**Context:** {mem.context}")
        lines.append("")
    return "\n".join(lines)


def propose_consolidation(
    cluster: list[Memory],
    user_name: str,
    identity_context: str,
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> Consolidation | None:
    """Call the LLM to propose a consolidation action for a memory cluster.

    Returns a Consolidation with status='pending', or None if the LLM fails.
    The caller is responsible for persisting the returned Consolidation.

    Args:
        cluster: The group of related memories to consolidate.
        user_name: Used to personalize the prompt.
        identity_context: The current ego/behavior + ego/identity text (for IDENTITY_UPDATE context).
        on_llm_call: Optional observability callback.

    Returns:
        A Consolidation instance (not yet persisted), or None on failure.
    """
    # AI-23 pattern (CV9.E2.S23), applied proactively: an identity_update
    # proposal can target structural identity, so this surface is fenced
    # before it ever ships red. Only the user-derived cluster is fenced --
    # identity_context is system-side, not user-injected.
    cluster_text = fence_untrusted("cluster", _format_cluster(cluster))
    prompt = CONSOLIDATION_PROMPT.format(
        user_name=user_name,
        identity_context=identity_context,
        cluster_text=cluster_text,
    )

    try:
        response = send_to_model(
            model=EXTRACTION_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
    except Exception:
        return None

    if on_llm_call:
        on_llm_call(response)

    raw = response.content.strip()
    # Strip optional markdown fencing.
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    action = data.get("action", "").lower()
    if action not in {"merge", "identity_update", "shadow_candidate"}:
        return None

    proposed_content = data.get("proposed_content", "").strip()
    if not proposed_content:
        return None

    return Consolidation(
        action=action,
        proposal=proposed_content,
        source_memory_ids=json.dumps([m.id for m in cluster]),
        target_layer=data.get("target_layer") or None,
        target_key=data.get("target_key") or None,
        rationale=data.get("rationale", "").strip() or None,
        status="pending",
    )
