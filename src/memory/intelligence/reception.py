"""Reception classifier: classifies a Mirror Mode turn in one LLM call.

reception() is storage-free: it takes the query and pre-fetched persona/journey
metadata from the caller. The caller (mirror.py) is responsible for fetching
that metadata from the store and for logging the LLM call if needed.

On any failure (LLM error, malformed JSON, missing fields), reception() returns
ReceptionResult.empty() so the caller falls back to keyword detection unchanged.
"""

from __future__ import annotations

from collections.abc import Callable

from memory.config import EXTRACTION_MODEL, LLM_TIMEOUT_RECEPTION
from memory.intelligence.extraction import _parse_json_response
from memory.intelligence.llm_router import LLMResponse, send_to_model
from memory.intelligence.prompts import RECEPTION_PROMPT
from memory.models import ReceptionResult


def _format_personas(personas: list[dict]) -> str:
    """Format persona metadata into a compact list for the prompt."""
    if not personas:
        return "(none available)"
    lines = []
    for p in personas:
        slug = p.get("slug", "?")
        desc = (p.get("description") or "")[:120]
        keywords = p.get("routing_keywords") or []
        kw_str = f" [keywords: {', '.join(keywords[:6])}]" if keywords else ""
        lines.append(f"- {slug}: {desc}{kw_str}")
    return "\n".join(lines)


def _format_journeys(journeys: list[dict]) -> str:
    """Format journey metadata into a compact list for the prompt."""
    if not journeys:
        return "(none available)"
    lines = []
    for j in journeys:
        slug = j.get("slug", "?")
        desc = (j.get("description") or "")[:120]
        lines.append(f"- {slug}: {desc}")
    return "\n".join(lines)


def reception(
    query: str,
    personas: list[dict],
    journeys: list[dict],
    on_llm_call: Callable[[LLMResponse], None] | None = None,
) -> ReceptionResult:
    """Classify a user message on four axes via one LLM call.

    Args:
        query: The user's message text.
        personas: List of dicts with keys: slug, description, routing_keywords.
        journeys: List of dicts with keys: slug, description.
        on_llm_call: Optional callback invoked with the LLMResponse after the call.

    Returns:
        ReceptionResult with four axes. Returns ReceptionResult.empty() on any failure.
    """
    if not query.strip():
        return ReceptionResult.empty()

    prompt = (
        RECEPTION_PROMPT.format(
            personas=_format_personas(personas),
            journeys=_format_journeys(journeys),
        )
        + query
    )

    try:
        response = send_to_model(
            EXTRACTION_MODEL,
            [{"role": "user", "content": prompt}],
            temperature=0.1,
            timeout=LLM_TIMEOUT_RECEPTION,
        )
    except Exception:
        return ReceptionResult.empty()

    if on_llm_call:
        on_llm_call(response)

    data = _parse_json_response(response.content)
    if not isinstance(data, dict):
        return ReceptionResult.empty()

    try:
        personas_out = data.get("personas") or []
        if not isinstance(personas_out, list):
            personas_out = []
        personas_out = [p for p in personas_out if isinstance(p, str)]

        journey_out = data.get("journey")
        if not isinstance(journey_out, str):
            journey_out = None

        touches_identity = bool(data.get("touches_identity", False))
        touches_shadow = bool(data.get("touches_shadow", False))

        return ReceptionResult(
            personas=personas_out,
            journey=journey_out,
            touches_identity=touches_identity,
            touches_shadow=touches_shadow,
        )
    except Exception:
        return ReceptionResult.empty()
