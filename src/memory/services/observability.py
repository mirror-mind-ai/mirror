"""One fail-soft seam for LLM call observability logging (AI-09 / CV9.E2.S13).

Every model-in-the-loop call site builds its ``on_llm_call`` callback here
instead of hand-rolling a near-identical closure. This is the single place that
owns the metadata-vs-full body policy and computes cost, and it is deliberately
fail-soft: a logging or pricing error is swallowed, because since CV9.E2.S7 an
exception raised through the extraction callback would quarantine a real
conversation. Observability must never break the pipeline it observes.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import TYPE_CHECKING

from memory.config import LOG_LLM_BODIES, LOG_LLM_CALLS
from memory.intelligence.cost import compute_cost

if TYPE_CHECKING:
    from memory.intelligence.llm_router import LLMResponse
    from memory.storage.store import Store

logger = logging.getLogger(__name__)


def build_llm_logger(
    store: Store,
    *,
    role: str,
    conversation_id: str | None = None,
    session_id: str | None = None,
    cost_usd: float | None = None,
    commit: bool = True,
) -> Callable[[LLMResponse], None] | None:
    """Return an ``on_llm_call`` callback, or ``None`` when logging is off.

    In ``metadata`` mode (the default) the prompt and response bodies are stored
    as empty strings; only ``full`` mode persists them. Cost is estimated from
    the response's token usage via the cost authority, unless ``cost_usd`` is
    provided — callers holding a truer figure (e.g. consult's fetched generation
    cost) pass it to override the static estimate.
    """
    if not LOG_LLM_CALLS:
        return None

    def _log(response: LLMResponse) -> None:
        try:
            store.log_llm_call(
                role=role,
                model=response.model,
                prompt=(response.prompt or "") if LOG_LLM_BODIES else "",
                response_text=response.content if LOG_LLM_BODIES else "",
                prompt_tokens=response.prompt_tokens,
                completion_tokens=response.completion_tokens,
                latency_ms=response.latency_ms,
                cost_usd=cost_usd
                if cost_usd is not None
                else compute_cost(
                    response.model, response.prompt_tokens, response.completion_tokens
                ),
                conversation_id=conversation_id,
                session_id=session_id,
                commit=commit,
            )
        except Exception:  # observability must never break the pipeline it observes
            logger.warning("llm_call logging failed for role=%s", role, exc_info=True)

    return _log
