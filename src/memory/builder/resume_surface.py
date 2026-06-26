"""Builder resume surface rendering."""

from __future__ import annotations

from memory.builder.lifecycle_ribbon import render_lifecycle_ribbon
from memory.builder.resume_state import BuilderResumeState
from memory.builder.roadmap_position import RoadmapPosition
from memory.builder.surface_protocol import wrap_ariad_surface


def render_builder_resume_surface(
    state: BuilderResumeState,
    *,
    roadmap_position: RoadmapPosition | None = None,
) -> str:
    """Render the Builder resume surface for an Ariad-governed journey."""
    cursor = state.cursor
    lines = [
        "Delivery",
        render_lifecycle_ribbon(_resume_phase(cursor.last_delivery_event if cursor else None)),
        "",
        "╭────────────────────────────────────────────────────────╮",
        "│        ■  BUILDER RESUME                               │",
        "│                                                        │",
        _card_text("journey"),
        _card_text(state.journey),
        "│                                                        │",
        _card_text("adopted method"),
        _card_text(state.adopted_method or "none"),
        "│                                                        │",
        _card_text("resumable"),
        _card_text("yes" if state.resumable else "no"),
    ]
    if state.reason:
        lines.extend(
            [
                "│                                                        │",
                _card_text("reason"),
                *_card_wrapped(state.reason),
            ]
        )
    lines.extend(
        [
            "│                                                        │",
            _card_text("roadmap position"),
            *_card_wrapped(_format_roadmap_position(roadmap_position)),
            "│                                                        │",
            _card_text("active item"),
            _card_text(cursor.active_item if cursor and cursor.active_item else "none"),
            "│                                                        │",
            _card_text("active checkpoint"),
            _card_text(cursor.active_checkpoint if cursor and cursor.active_checkpoint else "none"),
            "│                                                        │",
            _card_text("pending confirmation"),
            _card_text(
                cursor.pending_confirmation if cursor and cursor.pending_confirmation else "none"
            ),
            "│                                                        │",
            _card_text("last delivery event"),
            _card_text(
                cursor.last_delivery_event if cursor and cursor.last_delivery_event else "none"
            ),
            "│                                                        │",
            _card_text("allowed next actions"),
            *_card_prefixed(state.allowed_next_actions, "-"),
            "│                                                        │",
            _card_text("boundary"),
            *_card_wrapped("Builder resumes context only; no story lifecycle work was executed."),
            "╰────────────────────────────────────────────────────────╯",
        ]
    )
    return wrap_ariad_surface("builder_resume", "\n".join(lines) + "\n")


def _resume_phase(last_delivery_event: str | None) -> str:
    if not last_delivery_event:
        return "pull"
    if "done" in last_delivery_event:
        return "done"
    if "coherence" in last_delivery_event:
        return "coherence"
    if "review" in last_delivery_event:
        return "review"
    if "validation" in last_delivery_event:
        return "validate"
    if "plan" in last_delivery_event:
        return "plan"
    if "prepare" in last_delivery_event or "template" in last_delivery_event:
        return "prepare"
    return "pull"


def _card_text(text: str) -> str:
    width = 54
    return f"│ {text[:width]:<{width}} │"


def _card_prefixed(items: tuple[str, ...], prefix: str) -> list[str]:
    if not items:
        return [_card_text("none")]
    lines: list[str] = []
    for item in items:
        wrapped = _wrap_plain_text(item, width=52)
        for index, line in enumerate(wrapped):
            marker = prefix if index == 0 else " "
            lines.append(_card_text(f"{marker} {line}"))
    return lines


def _card_wrapped(text: str) -> list[str]:
    return [_card_text(line) for line in _wrap_plain_text(text, width=54)]


def _wrap_plain_text(text: str, *, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        if len(word) > width:
            if current:
                lines.append(current)
                current = ""
            for start in range(0, len(word), width):
                lines.append(word[start : start + width])
            continue
        candidate = f"{current} {word}".strip()
        if len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or ["none"]


def _format_roadmap_position(position: RoadmapPosition | None) -> str:
    if position is None:
        return "none"
    return f"{position.code} — {position.title} ({position.status}) [{position.path}]"
