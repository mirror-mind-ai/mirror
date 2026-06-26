"""Ariad lifecycle ribbon rendering."""

from __future__ import annotations

LIFECYCLE_STAGES = (
    "pull",
    "prepare",
    "expand",
    "plan",
    "implement",
    "validate",
    "debt_review",
    "coherence",
    "done",
)

_STAGE_LABELS = {
    "pull": "Pull",
    "prepare": "Prepare",
    "expand": "Expand",
    "plan": "Plan",
    "implement": "Implement",
    "validate": "Validate",
    "debt_review": "Debt Review",
    "coherence": "Coherence",
    "done": "Done",
}


def render_lifecycle_ribbon(current: str = "pull") -> str:
    """Render a compact progress breadcrumb for the Ariad lifecycle."""
    if current not in LIFECYCLE_STAGES:
        raise ValueError(f"unknown Ariad lifecycle stage: {current}")
    current_index = LIFECYCLE_STAGES.index(current)
    parts: list[str] = []
    for index, stage in enumerate(LIFECYCLE_STAGES):
        if index < current_index:
            marker = "✓"
        elif index == current_index:
            marker = "◉"
        else:
            marker = "○"
        parts.append(f"{marker} {_STAGE_LABELS[stage]}")
    return "Ariad: " + " | ".join(parts)
