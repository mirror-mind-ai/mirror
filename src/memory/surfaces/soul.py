"""Plain-text Soul Mode surfaces."""

from __future__ import annotations

from dataclasses import dataclass

WIDTH = 40

VOICE_ICONS = {
    "self": "✦",
    "shadow": "◐",
    "wisdom": "♢",
    "beauty": "✺",
}

VOICE_LABELS = {
    "self": "Self Voice",
    "shadow": "Shadow Voice",
    "wisdom": "Wisdom Voice",
    "beauty": "Beauty Voice",
}

PSYCHE_LAYER_ICONS = {
    "self": "✦",
    "shadow": "◐",
    "ego": "◇",
    "persona": "◈",
}

PSYCHE_LAYER_LABELS = {
    "self": "SELF",
    "shadow": "SHADOW",
    "ego": "EGO",
    "persona": "PERSONA",
}

ACTIVE_RITE_DEFAULTS = {
    "self": {
        "title": "SELF VOICE LISTENING",
        "utterance": "usefulness can remain a gift only when it stops being payment for belonging",
        "listening_for": "what remains true without proof",
    },
    "shadow": {
        "title": "SHADOW VOICE LISTENING",
        "utterance": "if they depend on me, they cannot forget me",
        "listening_for": "the protection inside control",
    },
    "wisdom": {
        "title": "WISDOM VOICE LISTENING",
        "utterance": "this already knows the difference between urgency and truth",
        "listening_for": "the lesson already present",
    },
    "beauty": {
        "title": "BEAUTY VOICE LISTENING",
        "utterance": "there is still care in the way this hurts",
        "listening_for": "the form of aliveness",
    },
}


@dataclass(frozen=True)
class SoulListeningOption:
    voice: str
    description: str

    @property
    def icon(self) -> str:
        return VOICE_ICONS[self.voice]

    @property
    def label(self) -> str:
        return VOICE_LABELS[self.voice]


def render_possible_listenings(options: list[SoulListeningOption]) -> str:
    """Render a situated Possible Listenings Soul Mode surface."""
    if not options:
        raise ValueError("at least one listening option is required")
    for option in options:
        if option.voice not in VOICE_ICONS:
            raise ValueError(f"unknown listening voice: {option.voice}")
        if not option.description.strip():
            raise ValueError("listening option descriptions must not be empty")

    lines = ["Soul Mode", "╭" + "─" * WIDTH + "╮", _line("   ✧  POSSIBLE LISTENINGS")]
    for option in options:
        lines.append(_line(""))
        lines.append(_line(f"   {option.icon} {option.label}"))
        for wrapped in _wrap(option.description.strip(), indent="     "):
            lines.append(_line(wrapped))
    lines.append(_line(""))
    for wrapped in _wrap(
        "Say if you want to hear one of these voices now, or just continue the conversation.",
        indent="   ",
    ):
        lines.append(_line(wrapped))
    lines.append("╰" + "─" * WIDTH + "╯")
    return "\n".join(lines)


def render_fruit_in_maturation(fruit: str) -> str:
    """Render a provisional Fruit In Maturation surface."""
    normalized_fruit = fruit.strip()
    if not normalized_fruit:
        raise ValueError("fruit must not be empty")

    lines = ["Soul Mode", "╭" + "─" * WIDTH + "╮", _line("   ❦  FRUIT IN MATURATION")]
    lines.append(_line(""))
    for wrapped in _wrap(normalized_fruit, indent="   "):
        lines.append(_line(wrapped))
    lines.append(_line(""))
    lines.append(_line("   continue if you want to mature more"))
    lines.append(_line("   or say you wish to harvest"))
    lines.append("╰" + "─" * WIDTH + "╯")
    return "\n".join(lines)


def render_harvested_fruit(fruit: str) -> str:
    """Render a final Harvested Fruit surface."""
    normalized_fruit = fruit.strip()
    if not normalized_fruit:
        raise ValueError("fruit must not be empty")

    lines = ["Soul Mode", "╭" + "─" * WIDTH + "╮", _line("   ❦  HARVESTED FRUIT")]
    lines.append(_line(""))
    for wrapped in _wrap(normalized_fruit, indent="   "):
        lines.append(_line(wrapped))
    lines.append(_line(""))
    lines.append(_line("   save to journal as it is"))
    lines.append(_line("   or change anything first?"))
    lines.append("╰" + "─" * WIDTH + "╯")
    return "\n".join(lines)


def render_closing_rite(
    *,
    harvested: str | None = None,
    echoes: str | None = None,
    remains_open: str | None = None,
    integration: str | None = None,
) -> str:
    """Render a Soul Mode Closing Rite surface."""
    return _render_section_card(
        title="☾  CLOSING RITE",
        sections=[
            ("what was harvested", harvested),
            ("what still echoes", echoes),
            ("what remains open", remains_open),
            ("what may want integration", integration),
        ],
        empty_error="at least one closing section is required",
    )


def render_integration_review(
    *,
    journal: str | None = None,
    self_material: str | None = None,
    shadow: str | None = None,
    ego: str | None = None,
    persona: str | None = None,
    leave_open: str | None = None,
) -> str:
    """Render a review-only Soul Mode integration surface."""
    return _render_section_card(
        title="☾  INTEGRATION PROPOSAL",
        sections=[
            ("origin", journal),
            ("self", self_material),
            ("shadow", shadow),
            ("ego behavior", ego),
            ("persona", persona),
            ("leave open", leave_open),
        ],
        empty_error="at least one integration review section is required",
        footer="proposal only — nothing changed",
    )


def render_enrichment_proposal(
    layer: str,
    *,
    key: str,
    origin: str,
    current: str | None,
    proposed: str,
    why: str,
) -> str:
    """Render a proposal-only psyche enrichment surface."""
    if layer not in PSYCHE_LAYER_ICONS:
        raise ValueError(f"unsupported psyche layer: {layer}")
    if not key.strip():
        raise ValueError("proposal key must not be empty")
    if not origin.strip():
        raise ValueError("proposal origin must not be empty")
    if not proposed.strip():
        raise ValueError("proposal content must not be empty")
    if not why.strip():
        raise ValueError("proposal rationale must not be empty")

    icon = PSYCHE_LAYER_ICONS[layer]
    label = PSYCHE_LAYER_LABELS[layer]
    current_text = (
        current.strip() if isinstance(current, str) and current.strip() else "none loaded"
    )
    return _render_section_card(
        title=f"{icon}  {label} ENRICHMENT PROPOSAL",
        sections=[
            ("target", f"{layer}/{key.strip()}"),
            ("origin", origin),
            ("current", current_text),
            ("proposed", proposed),
            ("why this may belong", why),
        ],
        empty_error="enrichment proposal requires content",
        footer="proposal only — no identity changed",
    )


def render_identity_change_applied(layer: str, *, key: str, content: str) -> str:
    """Render a confirmed identity mutation surface."""
    if layer not in PSYCHE_LAYER_ICONS:
        raise ValueError(f"unsupported psyche layer: {layer}")
    if not key.strip():
        raise ValueError("identity key must not be empty")
    if not content.strip():
        raise ValueError("identity content must not be empty")

    icon = PSYCHE_LAYER_ICONS[layer]
    label = PSYCHE_LAYER_LABELS[layer]
    return _render_section_card(
        title=f"{icon}  {label} IDENTITY UPDATED",
        sections=[
            ("target", f"{layer}/{key.strip()}"),
            ("applied", content),
        ],
        empty_error="identity update requires content",
    )


def render_active_rite(
    voice: str,
    *,
    utterance: str | None = None,
    listening_for: str | None = None,
    question: str | None = None,
) -> str:
    """Render the listening surface for a minimal Soul Mode voice."""
    if voice not in ACTIVE_RITE_DEFAULTS:
        raise ValueError(f"unsupported active rite voice: {voice}")

    defaults = ACTIVE_RITE_DEFAULTS[voice]
    if question and not utterance:
        utterance = question
    if voice in {"wisdom", "beauty"} and not utterance:
        raise ValueError(f"{VOICE_LABELS[voice]} requires a situated --says response")
    voice_says = _normalize_voice_text(utterance or defaults["utterance"])
    if not voice_says:
        raise ValueError("active rite voice utterance must not be empty")

    icon = VOICE_ICONS[voice]
    lines = [
        "Soul Mode",
        "╭" + "─" * WIDTH + "╮",
        _line(f"   {icon}  {defaults['title']}"),
        _line(""),
        _line("   the voice says"),
        _line(""),
    ]
    for wrapped in _wrap_blocks(voice_says, indent="   "):
        lines.append(_line(wrapped))
    lines.append("╰" + "─" * WIDTH + "╯")
    return "\n".join(lines)


def _line(text: str) -> str:
    content = text[:WIDTH]
    return "│" + content.ljust(WIDTH) + "│"


def _render_section_card(
    *,
    title: str,
    sections: list[tuple[str, str | None]],
    empty_error: str,
    footer: str | None = None,
) -> str:
    normalized_sections = [
        (label, _normalize_voice_text(value))
        for label, value in sections
        if isinstance(value, str) and value.strip()
    ]
    if not normalized_sections:
        raise ValueError(empty_error)

    lines = ["Soul Mode", "╭" + "─" * WIDTH + "╮", _line(f"   {title}")]
    for label, text in normalized_sections:
        lines.append(_line(""))
        lines.append(_line(f"   {label}"))
        for wrapped in _wrap_blocks(text, indent="   "):
            lines.append(_line(wrapped))
    if footer:
        lines.append(_line(""))
        for wrapped in _wrap_blocks(footer, indent="   "):
            lines.append(_line(wrapped))
    lines.append("╰" + "─" * WIDTH + "╯")
    return "\n".join(lines)


def _normalize_voice_text(text: str) -> str:
    return text.replace("\\n", "\n").strip()


def _wrap(text: str, *, indent: str) -> list[str]:
    max_width = WIDTH - len(indent)
    words = text.split()
    if not words:
        return [indent.rstrip()]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        if len(current) + 1 + len(word) <= max_width:
            current += " " + word
        else:
            lines.append(indent + current)
            current = word
    lines.append(indent + current)
    return lines


def _wrap_blocks(text: str, *, indent: str) -> list[str]:
    """Wrap text while preserving paragraph breaks inside ritual cards."""
    paragraphs = [paragraph.strip() for paragraph in text.splitlines()]
    lines: list[str] = []
    previous_had_content = False
    for paragraph in paragraphs:
        if not paragraph:
            if previous_had_content and (not lines or lines[-1] != ""):
                lines.append("")
            previous_had_content = False
            continue
        lines.extend(_wrap(paragraph, indent=indent))
        previous_had_content = True
    return lines or [indent.rstrip()]
