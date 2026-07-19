"""Reception eval: LLM-based turn classifier on canned queries.

Tests reception() against fixed queries using the production persona/journey
database. Covers four probe categories: clear domain matching, ambiguous
intent-wins-over-topic, identity-touch detection, and shadow-touch detection.

Run with:
    uv run python -m memory eval reception

Requires OPENROUTER_API_KEY and a seeded database with personas and journeys.
Costs a few cents per run.
"""

from __future__ import annotations

import json

from evals.types import EvalProbe
from memory.client import MemoryClient
from memory.config import EXTRACTION_MODEL
from memory.intelligence.prompts import RECEPTION_PROMPT
from memory.intelligence.reception import reception
from memory.models import ReceptionResult

THRESHOLD = 0.80
# CV9.E2.S19 (AI-11): reception() pins EXTRACTION_MODEL (a shorter timeout,
# same model) and exercises RECEPTION_PROMPT.
EVAL_MODEL = EXTRACTION_MODEL
EVAL_PROMPTS = (RECEPTION_PROMPT,)


# ---------------------------------------------------------------------------
# Shared metadata (loaded once, reused across probes)
# ---------------------------------------------------------------------------


def _load_metadata() -> tuple[list[dict], list[dict]]:
    """Load persona and journey metadata from the production database."""
    mem = MemoryClient()
    raw_personas = mem.store.get_identity_by_layer("persona")
    personas = []
    for ident in raw_personas:
        try:
            meta = json.loads(ident.metadata) if ident.metadata else {}
        except (json.JSONDecodeError, TypeError):
            meta = {}
        personas.append(
            {
                "slug": ident.key,
                "description": (ident.content or "")[:200],
                "routing_keywords": meta.get("routing_keywords") or [],
            }
        )

    raw_journeys = mem.store.get_identity_by_layer("journey")
    journeys = [{"slug": j.key, "description": (j.content or "")[:200]} for j in raw_journeys]
    return personas, journeys


# ---------------------------------------------------------------------------
# Probe helpers
# ---------------------------------------------------------------------------


def _classify(query: str) -> ReceptionResult:
    personas, journeys = _load_metadata()
    return reception(query, personas, journeys)


def _probe_persona(
    probe_id: str,
    description: str,
    query: str,
    expected_persona: str | None,
) -> EvalProbe:
    """Build a probe that checks the top persona returned by reception."""

    def _run() -> tuple[bool, str]:
        result = _classify(query)
        got = result.personas[0] if result.personas else None
        passed = got == expected_persona
        return passed, f"expected {expected_persona!r}, got {got!r}"

    return EvalProbe(id=probe_id, description=description, run=_run)


def _probe_no_persona(probe_id: str, description: str, query: str) -> EvalProbe:
    """Build a probe that expects an empty personas list (ego responds alone)."""

    def _run() -> tuple[bool, str]:
        result = _classify(query)
        passed = len(result.personas) == 0
        return passed, f"expected [], got {result.personas!r}"

    return EvalProbe(id=probe_id, description=description, run=_run)


def _probe_identity_touch(
    probe_id: str,
    description: str,
    query: str,
    expected: bool,
) -> EvalProbe:
    """Build a probe that checks touches_identity."""

    def _run() -> tuple[bool, str]:
        result = _classify(query)
        passed = result.touches_identity == expected
        return passed, f"touches_identity: expected {expected}, got {result.touches_identity}"

    return EvalProbe(id=probe_id, description=description, run=_run)


def _probe_shadow_touch(
    probe_id: str,
    description: str,
    query: str,
    expected: bool,
) -> EvalProbe:
    """Build a probe that checks touches_shadow."""

    def _run() -> tuple[bool, str]:
        result = _classify(query)
        passed = result.touches_shadow == expected
        return passed, f"touches_shadow: expected {expected}, got {result.touches_shadow}"

    return EvalProbe(id=probe_id, description=description, run=_run)


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

PROBES: list[EvalProbe] = [
    # --- Clear domain: persona match ---
    _probe_persona(
        "clear-engineer",
        "code/software query → engineer",
        "I have a bug in my Python code and I can't figure out what's wrong",
        "engineer",
    ),
    _probe_persona(
        "clear-writer",
        "article/writing query → writer",
        "I want to write an article about the freedom of working remotely",
        "writer",
    ),
    _probe_persona(
        "clear-doctor",
        "health/symptom query → doctor",
        "I've been having headaches every morning for the past week",
        "doctor",
    ),
    _probe_persona(
        "clear-traveler",
        "trip planning query → traveler",
        "I'm planning a two-week trip through Southeast Asia next month",
        "traveler",
    ),
    # --- Ambiguous: intent and action verb dominate topic ---
    _probe_persona(
        "action-verb-writer",
        "'write a post about X' → writer, not X-domain persona",
        "write a post about the psychological benefits of digital nomadism",
        "writer",
    ),
    _probe_persona(
        "action-verb-engineer",
        "'help me think through this code structure' → engineer over thinker",
        "help me think through the architecture of this Python module",
        "engineer",
    ),
    _probe_no_persona(
        "open-existential-no-persona",
        "open existential question → ego responds alone",
        "what does it mean to live a life that is truly your own",
    ),
    # --- Identity touch ---
    _probe_identity_touch(
        "identity-touch-purpose",
        "explicit purpose/values reflection → touches_identity=True",
        "I keep questioning whether the work I'm doing actually aligns with who I am and what I value",
        True,
    ),
    _probe_identity_touch(
        "identity-touch-operational",
        "operational task → touches_identity=False",
        "can you review this pull request description and suggest improvements",
        False,
    ),
    # --- Shadow touch ---
    _probe_shadow_touch(
        "shadow-touch-avoidance",
        "explicit avoidance pattern → touches_shadow=True",
        "I keep postponing a conversation with my business partner about our direction "
        "and I realize I've been doing this for months — I know I'm avoiding something",
        True,
    ),
    _probe_shadow_touch(
        "shadow-touch-vague-discomfort",
        "vague discomfort without named pattern → touches_shadow=False",
        "I'm feeling a bit off today, not sure why, just not in the best mood",
        False,
    ),
    # --- Journey detection ---
    _probe_persona(
        "mirror-journey-context",
        "mirror/infrastructure query → engineer (journey detection secondary check)",
        "I want to work on the mirror mind codebase and add a new feature",
        "engineer",
    ),
]
