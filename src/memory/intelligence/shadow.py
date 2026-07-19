"""Shadow scan intelligence: surface candidate observations from shadow-layer memories.

CV7.E4.S4 — Shadow as structural cultivation.

propose_shadow_observations() takes a pool of shadow-candidate memories and
existing structural shadow content, clusters them, and calls the LLM to
propose grounded observations. The results are stored as Consolidation rows
(action='shadow_observation', status='pending') and reviewed by the user
via the mm-shadow skill.
"""

from __future__ import annotations

import json
from collections.abc import Callable

from memory.config import EXTRACTION_MODEL
from memory.intelligence.llm_router import LLMResponse, send_to_model
from memory.intelligence.prompts import SHADOW_SCAN_PROMPT, fence_untrusted
from memory.models import Consolidation, Memory

# Threshold for clustering shadow memories (looser than general consolidation
# — shadow patterns are often expressed differently across conversations).
SHADOW_CLUSTER_THRESHOLD = 0.65


def _format_shadow_memories(memories: list[Memory]) -> str:
    """Format shadow-candidate memories as readable text for the LLM prompt."""
    if not memories:
        return "(no shadow-candidate memories found)"
    lines = []
    for mem in memories:
        lines.append(f"### [{mem.id[:8]}] {mem.title}")
        lines.append(
            f"**Type:** {mem.memory_type} | **Layer:** {mem.layer} | "
            f"**State:** {mem.readiness_state} | **Date:** {mem.created_at[:10]}"
        )
        lines.append(f"**Content:** {mem.content}")
        if mem.context:
            lines.append(f"**Context:** {mem.context}")
        lines.append("")
    return "\n".join(lines)


def _format_shadow_structure(shadow_entries: list) -> str:
    """Format existing structural shadow identity entries as context."""
    if not shadow_entries:
        return "(no structural shadow content yet)"
    parts = []
    for entry in shadow_entries:
        parts.append(f"### {entry.key}\n{entry.content}")
    return "\n\n".join(parts)


def propose_shadow_observations(
    memories: list[Memory],
    shadow_entries: list,
    user_name: str,
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> list[Consolidation]:
    """Propose shadow observations from a pool of shadow-candidate memories.

    Clusters the memories by semantic similarity, then calls the LLM once
    with the full pool (not per cluster) to let it surface cross-cluster
    patterns. Returns a list of Consolidation instances (not yet persisted).

    Args:
        memories: Shadow-candidate memories (layer=shadow or type=tension/pattern).
        shadow_entries: Current structural shadow identity entries (for dedup context).
        user_name: Used to personalize the prompt.
        on_llm_call: Optional observability callback.

    Returns:
        List of Consolidation instances with action='shadow_observation', status='pending'.
        Empty list on LLM failure or when nothing new is supported.
    """
    if not memories:
        return []

    # AI-22 pattern (CV9.E2.S22), applied proactively: shadow output reaches
    # structural identity via mm-shadow review, so this surface is fenced
    # before it ever ships red, unlike scene's probe-first sequence. Only the
    # user-derived {shadow_memories} block is fenced — {shadow_structure} is
    # system-side identity content, not user-injected.
    shadow_memories_text = fence_untrusted("shadow_memories", _format_shadow_memories(memories))
    shadow_structure_text = _format_shadow_structure(shadow_entries)

    prompt = SHADOW_SCAN_PROMPT.format(
        user_name=user_name,
        shadow_structure=shadow_structure_text,
        shadow_memories=shadow_memories_text,
    )

    try:
        response = send_to_model(
            model=EXTRACTION_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
    except Exception:
        return []

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
        items = json.loads(raw)
    except json.JSONDecodeError:
        return []

    if not isinstance(items, list):
        return []

    results: list[Consolidation] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        observation = item.get("observation", "").strip()
        title = item.get("title", "Shadow observation").strip()
        memory_ids = item.get("memory_ids") or []
        evidence_note = item.get("evidence_note", "").strip()

        if not observation:
            continue
        if not isinstance(memory_ids, list):
            memory_ids = []

        # Build the full proposal content: title + observation + evidence.
        parts = [f"**{title}**\n\n{observation}"]
        if evidence_note:
            parts.append(f"*Evidence: {evidence_note}*")
        proposal_content = "\n\n".join(parts)

        results.append(
            Consolidation(
                action="shadow_observation",
                proposal=proposal_content,
                source_memory_ids=json.dumps(memory_ids),
                target_layer="shadow",
                target_key="profile",
                rationale=title,
                status="pending",
            )
        )

    return results
