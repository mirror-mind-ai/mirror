"""Routing eval: persona detection behavioral contract on canned queries.

Tests detect_persona() against fixed queries. Documents which messages should
route where — clear domain cases, ambiguous inputs, and null cases.

Today detect_persona() is keyword-based (deterministic, free to run). This eval
lives in evals/ rather than tests/ because CV7.E2 will replace keyword routing
with an LLM classifier; these fixtures become the regression net at that point.

Run with:
    uv run python -m memory eval routing

Requires a seeded database with persona routing metadata. Free to run — no LLM calls.
"""

from __future__ import annotations

from evals.types import EvalProbe
from memory.client import MemoryClient

THRESHOLD = 0.85
# CV9.E2.S19 (AI-11): keyword-based routing makes no LLM call (see module
# docstring) — genuinely prompt-free, not an omission.
EVAL_MODEL: str | None = None
EVAL_PROMPTS: tuple[str, ...] = ()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _top_persona(query: str) -> str | None:
    """Return the top-matched persona slug for query, or None."""
    mem = MemoryClient()
    matches = mem.detect_persona(query)
    return matches[0][0] if matches else None


def _probe(probe_id: str, description: str, query: str, expected: str | None) -> EvalProbe:
    """Build a routing probe from a query and expected persona (or None)."""

    def _run() -> tuple[bool, str]:
        result = _top_persona(query)
        passed = result == expected
        if expected is None:
            notes = f"expected None, got {result!r}"
        else:
            notes = f"expected {expected!r}, got {result!r}"
        return passed, notes

    return EvalProbe(id=probe_id, description=description, run=_run)


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

PROBES: list[EvalProbe] = [
    # --- Clear domain: engineer ---
    _probe(
        "engineer-code",
        "code keyword → engineer",
        "I need to write some code for this feature",
        "engineer",
    ),
    _probe(
        "engineer-bug",
        "bug/debugging query → engineer",
        "there is a bug in my software and I can't figure out what's wrong",
        "engineer",
    ),
    _probe(
        "engineer-programming",
        "programming keyword → engineer",
        "what's the best approach for this programming problem",
        "engineer",
    ),
    # --- Clear domain: writer ---
    _probe(
        "writer-article",
        "article/writing query → writer",
        "I want to write an article about digital nomadism",
        "writer",
    ),
    _probe(
        "writer-rewrite",
        "rewriting keyword → writer",
        "can you help me rewrite this paragraph",
        "writer",
    ),
    # --- Clear domain: therapist ---
    _probe(
        "therapist-feelings",
        "feelings keyword → therapist",
        "I've been having strong feelings about this situation and I'm not sure what they mean",
        "therapist",
    ),
    _probe(
        "therapist-therapy",
        "therapy keyword → therapist",
        "I'd like to do some therapy work today",
        "therapist",
    ),
    # --- Clear domain: treasurer ---
    _probe(
        "treasurer-finances",
        "finances keyword → treasurer",
        "let's review my finances for this month",
        "treasurer",
    ),
    # --- Clear domain: traveler ---
    _probe(
        "traveler-trip",
        "trip keyword → traveler",
        "I'm planning a trip to Japan next month",
        "traveler",
    ),
    # --- Ambiguous: highest-signal wins ---
    _probe(
        "ambiguous-code-over-thinking",
        "code + think → engineer over thinker",
        "I'm thinking about how to structure my code",
        "engineer",
    ),
    _probe(
        "ambiguous-writing-over-research",
        "writing + research → writer over researcher",
        "I'm writing a piece and need to frame the research clearly",
        "writer",
    ),
    _probe(
        "ambiguous-finance-over-research",
        "money + finances → treasurer over researcher",
        "I want to investigate my finances and see where the money is going",
        "treasurer",
    ),
    # --- Null: no persona expected ---
    _probe(
        "null-open-question",
        "broad open question with no domain keywords → None",
        "what is the meaning of freedom",
        None,
    ),
    _probe(
        "null-meta-question",
        "meta question about the mirror → None",
        "how do you work",
        None,
    ),
    _probe(
        "null-short-greeting",
        "greeting with no domain signal → None",
        "hello",
        None,
    ),
]
