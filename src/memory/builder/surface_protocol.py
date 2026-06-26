"""Deterministic surface protocol for Ariad Builder runtime output."""

from __future__ import annotations


def wrap_ariad_surface(surface_id: str, body: str) -> str:
    """Wrap a rendered Ariad surface in explicit transport boundaries."""
    normalized = surface_id.strip().upper().replace(" ", "_")
    content = body.rstrip()
    return f"<<<ARIAD:{normalized}>>>\n{content}\n<<<END:{normalized}>>>\n"
