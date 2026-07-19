"""Proportionality eval: extraction should produce zero memories for trivial exchanges.

This is the watch probe described in draft-analysis.md §8.1. Short, casual,
lived-in messages should not produce memories. If this eval fails consistently,
the expression pass earns its way back into scope as focused CV8 work.

Run with:
    uv run python -m memory eval proportionality

Requires OPENROUTER_API_KEY. Costs a few cents per run.
"""

from __future__ import annotations

from evals.types import EvalProbe
from memory.config import EXTRACTION_MODEL
from memory.intelligence.extraction import extract_memories
from memory.intelligence.prompts import EXTRACTION_PROMPT
from memory.models import Message

THRESHOLD = 0.80
# CV9.E2.S19 (AI-11): this eval only calls extract_memories().
EVAL_MODEL = EXTRACTION_MODEL
EVAL_PROMPTS = (EXTRACTION_PROMPT,)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _msgs(*pairs: tuple[str, str]) -> list[Message]:
    return [Message(conversation_id="eval", role=r, content=c) for r, c in pairs]


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------


def _probe_casual_greeting() -> tuple[bool, str]:
    """Brief social exchange — nothing memorable."""
    messages = _msgs(
        ("user", "Hey, how are you?"),
        ("assistant", "Doing well, thanks for asking. What's on your mind?"),
        ("user", "Not much, just checking in. Have a good day!"),
    )
    memories = extract_memories(messages)
    passed = len(memories) == 0
    return passed, f"{len(memories)} memories extracted (expected 0)"


def _probe_logistical_question() -> tuple[bool, str]:
    """Logistical question with a factual answer — not identity-relevant."""
    messages = _msgs(
        ("user", "What's the best way to get from Lisbon to Porto?"),
        (
            "assistant",
            "The fastest option is the Alfa Pendular train — about 2h45m. "
            "There's also the AP Express which is slightly slower but cheaper. "
            "Driving takes about 3 hours depending on traffic.",
        ),
        ("user", "Great, I'll take the train. Thanks."),
    )
    memories = extract_memories(messages)
    passed = len(memories) == 0
    return passed, f"{len(memories)} memories extracted (expected 0)"


def _probe_quick_factual() -> tuple[bool, str]:
    """Quick factual lookup — no insight, decision, or reflection."""
    messages = _msgs(
        ("user", "What year was Python first released?"),
        ("assistant", "Python 0.9.0 was released in February 1991 by Guido van Rossum."),
        ("user", "Thanks, that's what I needed."),
    )
    memories = extract_memories(messages)
    passed = len(memories) == 0
    return passed, f"{len(memories)} memories extracted (expected 0)"


def _probe_status_check() -> tuple[bool, str]:
    """Vague status check with no substance — not worth remembering."""
    messages = _msgs(
        ("user", "How is the project going?"),
        ("assistant", "Steady progress. The core pieces are in place and we're moving forward."),
        ("user", "Great, keep it up."),
    )
    memories = extract_memories(messages)
    passed = len(memories) == 0
    return passed, f"{len(memories)} memories extracted (expected 0)"


def _probe_small_talk() -> tuple[bool, str]:
    """Pure small talk about weather and weekend plans — nothing to retain."""
    messages = _msgs(
        ("user", "Nice weather today, isn't it?"),
        ("assistant", "It does sound like a good day to be outside."),
        ("user", "Yeah I'm thinking of going for a walk this afternoon."),
        ("assistant", "That sounds like a good use of the afternoon."),
        ("user", "Agreed. Anyway, talk later."),
    )
    memories = extract_memories(messages)
    passed = len(memories) == 0
    return passed, f"{len(memories)} memories extracted (expected 0)"


# ---------------------------------------------------------------------------
# Probe registry
# ---------------------------------------------------------------------------

PROBES: list[EvalProbe] = [
    EvalProbe(
        id="casual-greeting",
        description="brief social exchange produces 0 memories",
        run=_probe_casual_greeting,
    ),
    EvalProbe(
        id="logistical-question",
        description="logistical travel question produces 0 memories",
        run=_probe_logistical_question,
    ),
    EvalProbe(
        id="quick-factual",
        description="quick factual lookup produces 0 memories",
        run=_probe_quick_factual,
    ),
    EvalProbe(
        id="status-check",
        description="vague status check produces 0 memories",
        run=_probe_status_check,
    ),
    EvalProbe(
        id="small-talk",
        description="small talk about weather and plans produces 0 memories",
        run=_probe_small_talk,
    ),
]
