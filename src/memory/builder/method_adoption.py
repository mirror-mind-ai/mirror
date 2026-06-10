"""Runtime state helpers for Builder method adoption."""

from __future__ import annotations

import json
from dataclasses import dataclass

from memory.storage.store import Store

_ADOPTION_SESSION_PREFIX = "__builder_method_adoption__:"


@dataclass(frozen=True)
class BuilderMethodAdoption:
    journey: str
    method: str


def get_adopted_method(store: Store, journey: str) -> str | None:
    """Return the Builder method adopted by a journey, if one exists."""
    normalized_journey = _normalize_journey(journey)
    session = store.get_runtime_session(_session_id(normalized_journey))
    if not session or not session.active or not session.metadata:
        return None
    try:
        data = json.loads(session.metadata)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    method = data.get("method")
    return method.strip() if isinstance(method, str) and method.strip() else None


def set_adopted_method(store: Store, journey: str, method: str) -> BuilderMethodAdoption:
    """Persist the Builder method adopted by a journey."""
    normalized_journey = _normalize_journey(journey)
    normalized_method = _normalize_method(method)
    adoption = BuilderMethodAdoption(journey=normalized_journey, method=normalized_method)
    store.upsert_runtime_session(
        _session_id(normalized_journey),
        interface="builder_method_adoption",
        journey=normalized_journey,
        active=True,
        metadata=json.dumps({"method": normalized_method}, ensure_ascii=False),
    )
    return adoption


def clear_adopted_method(store: Store, journey: str) -> None:
    """Clear the Builder method adoption state for a journey."""
    normalized_journey = _normalize_journey(journey)
    store.upsert_runtime_session(
        _session_id(normalized_journey),
        interface="builder_method_adoption",
        journey=normalized_journey,
        active=False,
        metadata=None,
    )


def _session_id(journey: str) -> str:
    return f"{_ADOPTION_SESSION_PREFIX}{journey}"


def _normalize_journey(journey: str) -> str:
    normalized = journey.strip() if isinstance(journey, str) else ""
    if not normalized:
        raise ValueError("journey must not be empty")
    return normalized


def _normalize_method(method: str) -> str:
    normalized = method.strip() if isinstance(method, str) else ""
    if not normalized:
        raise ValueError("method must not be empty")
    return normalized
