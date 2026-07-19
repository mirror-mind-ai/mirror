"""Journal classification eval: layer criteria contract (CV9.E2.S25 / AI-11).

Tests `classify_journal_entry()` against the Jungian layer criteria stated in
JOURNAL_CLASSIFICATION_PROMPT. Layer classification (self/ego/shadow) is the
delicate quality surface here — the three layer probes are pre-registered n=10,
not sampled.

Run with:
    uv run python -m memory eval journal

Costs a few cents — hits EXTRACTION_MODEL.
"""

from __future__ import annotations

from evals.types import EvalProbe
from memory.config import EXTRACTION_MODEL
from memory.intelligence.extraction import classify_journal_entry
from memory.intelligence.prompts import JOURNAL_CLASSIFICATION_PROMPT
from memory.models import VALID_MEMORY_LAYERS

THRESHOLD = 0.8
EVAL_MODEL = EXTRACTION_MODEL
EVAL_PROMPTS = (JOURNAL_CLASSIFICATION_PROMPT,)


# ---------------------------------------------------------------------------
# Layer Probes (pre-registered n=10 each)
# ---------------------------------------------------------------------------


def _journal_layer_self() -> tuple[bool, str]:
    """Deep identity / core values / meaning of life → self layer."""
    # Unambiguous exemplar (prompt-engineer): unmistakable self-reflection.
    content = """
    I've been thinking about what actually matters to me. Not the day-to-day
    frustrations or work — but the core of who I am. I realized that freedom
    and autonomy aren't just preferences; they're fundamental to my sense of
    purpose. If I'm not navigating my own path, I'm not myself.
    """
    result = classify_journal_entry(content.strip())
    passed = result["layer"] == "self"
    return passed, f"layer={result['layer']!r} (expected 'self')"


def _journal_layer_ego() -> tuple[bool, str]:
    """Day-to-day operational state / practical frustrations → ego layer."""
    content = """
    Spent the morning fighting a flaky test that only fails in CI. Frustrating
    but not deep — just the usual friction of getting work done. Need to fix
    the test harness and move on.
    """
    result = classify_journal_entry(content.strip())
    passed = result["layer"] == "ego"
    return passed, f"layer={result['layer']!r} (expected 'ego')"


def _journal_layer_shadow() -> tuple[bool, str]:
    """Unresolved tension / avoided theme / recurring fear → shadow layer."""
    content = """
    I keep postponing the difficult conversation with my collaborator. It's
    the third time this month I've found a reason to delay. I tell myself it's
    timing, but I know I'm avoiding the confrontation. This pattern is familiar
    and I don't like what it says about me.
    """
    result = classify_journal_entry(content.strip())
    passed = result["layer"] == "shadow"
    return passed, f"layer={result['layer']!r} (expected 'shadow')"


# ---------------------------------------------------------------------------
# Structural Contract Probes
# ---------------------------------------------------------------------------


def _journal_layer_valid() -> tuple[bool, str]:
    """Layer is always in VALID_MEMORY_LAYERS (the AI-24-adjacent probe)."""
    # This probe exercises the AI-24 fix (CV9.E2.S25): the coercion to 'ego'
    # when the model returns an invalid layer. Use a neutral entry so the model
    # picks naturally rather than being steered.
    content = "Worked on the project today. Made some progress."
    result = classify_journal_entry(content)
    layer = result["layer"]
    # Import the single source of truth (prompt-engineer).
    passed = layer in VALID_MEMORY_LAYERS
    return passed, f"layer={layer!r} valid={passed}"


def _journal_well_formed() -> tuple[bool, str]:
    """Result is dict with title/layer/tags, title bounded."""
    content = "A test journal entry."
    result = classify_journal_entry(content)
    has_keys = all(k in result for k in ("title", "layer", "tags"))
    title_bounded = len(result.get("title", "")) <= 100  # reasonable bound
    passed = has_keys and title_bounded
    return (
        passed,
        f"keys={list(result.keys())} title_len={len(result.get('title', ''))}",
    )


# ---------------------------------------------------------------------------
# Probe List
# ---------------------------------------------------------------------------

PROBES: list[EvalProbe] = [
    EvalProbe(
        id="journal-layer-self",
        description="deep identity / core values → self layer",
        run=_journal_layer_self,
    ),
    EvalProbe(
        id="journal-layer-ego",
        description="day-to-day operational / practical frustrations → ego layer",
        run=_journal_layer_ego,
    ),
    EvalProbe(
        id="journal-layer-shadow",
        description="unresolved tension / avoided theme → shadow layer",
        run=_journal_layer_shadow,
    ),
    EvalProbe(
        id="journal-layer-valid",
        description="layer ∈ VALID_MEMORY_LAYERS (AI-24 invariant)",
        run=_journal_layer_valid,
    ),
    EvalProbe(
        id="journal-well-formed",
        description="dict with title/layer/tags, title bounded",
        run=_journal_well_formed,
    ),
]
