"""Builder resume surface rendering."""

from __future__ import annotations

from memory.builder.resume_state import BuilderResumeState
from memory.builder.roadmap_position import RoadmapPosition


def render_builder_resume_surface(
    state: BuilderResumeState,
    *,
    roadmap_position: RoadmapPosition | None = None,
) -> str:
    """Render the Builder resume surface for an Ariad-governed journey."""
    cursor = state.cursor
    lines = [
        "■ BUILDER RESUME",
        "",
        "journey",
        state.journey,
        "",
        "adopted method",
        state.adopted_method or "none",
        "",
        "resumable",
        "yes" if state.resumable else "no",
    ]
    if state.reason:
        lines.extend(["", "reason", state.reason])
    lines.extend(
        [
            "",
            "roadmap position",
            _format_roadmap_position(roadmap_position),
            "",
            "active item",
            cursor.active_item if cursor and cursor.active_item else "none",
            "",
            "active checkpoint",
            cursor.active_checkpoint if cursor and cursor.active_checkpoint else "none",
            "",
            "pending confirmation",
            cursor.pending_confirmation if cursor and cursor.pending_confirmation else "none",
            "",
            "last delivery event",
            cursor.last_delivery_event if cursor and cursor.last_delivery_event else "none",
            "",
            "allowed next actions",
            *_format_actions(state.allowed_next_actions),
            "",
            "boundary",
            "Builder resumes context only; no story lifecycle work was executed.",
        ]
    )
    return "\n".join(lines) + "\n"


def _format_roadmap_position(position: RoadmapPosition | None) -> str:
    if position is None:
        return "none"
    return f"{position.code} — {position.title} ({position.status}) [{position.path}]"


def _format_actions(actions: tuple[str, ...]) -> list[str]:
    return [f"- {action}" for action in actions] if actions else ["none"]
