"""Soul Mode provisional session state."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from memory.models import IdentityIntegration, _now
from memory.storage.store import Store

SOUL_STATE_SESSION_ID = "__global_soul_mode__"
SOUL_METADATA_KEY = "soul"
FRUIT_METADATA_KEY = "fruit_in_maturation"
HARVEST_METADATA_KEY = "harvested_fruit"

IDENTITY_INTEGRATION_SECTION_TITLES = {
    "self": "New Incorporated Principles",
    "shadow": "New Hidden Needs Recognized",
    "ego": "New Operational Patterns Identified",
    "persona": "New Participation Patterns Revealed",
}


@dataclass(frozen=True)
class SoulFruitState:
    session_id: str
    fruit: str | None = None


def resolve_soul_session_id(explicit_session_id: str | None = None) -> str:
    if explicit_session_id and explicit_session_id.strip():
        return explicit_session_id.strip()
    env_session = os.environ.get("MIRROR_SESSION_ID", "").strip()
    return env_session or SOUL_STATE_SESSION_ID


def get_fruit_in_maturation(
    store: Store,
    *,
    session_id: str | None = None,
) -> SoulFruitState:
    resolved_session_id = resolve_soul_session_id(session_id)
    session = store.get_runtime_session(resolved_session_id)
    metadata = _decode_metadata(session.metadata if session else None)
    soul = metadata.get(SOUL_METADATA_KEY)
    fruit = soul.get(FRUIT_METADATA_KEY) if isinstance(soul, dict) else None
    return SoulFruitState(
        session_id=resolved_session_id,
        fruit=fruit.strip() if isinstance(fruit, str) and fruit.strip() else None,
    )


def set_fruit_in_maturation(
    store: Store,
    fruit: str,
    *,
    session_id: str | None = None,
) -> SoulFruitState:
    normalized_fruit = fruit.strip()
    if not normalized_fruit:
        raise ValueError("fruit must not be empty")

    resolved_session_id = resolve_soul_session_id(session_id)
    session = store.get_runtime_session(resolved_session_id)
    metadata = _decode_metadata(session.metadata if session else None)
    soul = metadata.get(SOUL_METADATA_KEY)
    if not isinstance(soul, dict):
        soul = {}
    soul[FRUIT_METADATA_KEY] = normalized_fruit
    metadata[SOUL_METADATA_KEY] = soul
    store.upsert_runtime_session(
        resolved_session_id,
        metadata=json.dumps(metadata, ensure_ascii=False),
        active=True,
    )
    return SoulFruitState(session_id=resolved_session_id, fruit=normalized_fruit)


def clear_fruit_in_maturation(
    store: Store,
    *,
    session_id: str | None = None,
) -> None:
    _clear_soul_key(store, key=FRUIT_METADATA_KEY, session_id=session_id)


def get_harvested_fruit(
    store: Store,
    *,
    session_id: str | None = None,
) -> SoulFruitState:
    resolved_session_id = resolve_soul_session_id(session_id)
    session = store.get_runtime_session(resolved_session_id)
    metadata = _decode_metadata(session.metadata if session else None)
    soul = metadata.get(SOUL_METADATA_KEY)
    fruit = soul.get(HARVEST_METADATA_KEY) if isinstance(soul, dict) else None
    return SoulFruitState(
        session_id=resolved_session_id,
        fruit=fruit.strip() if isinstance(fruit, str) and fruit.strip() else None,
    )


def harvest_fruit(
    store: Store,
    *,
    fruit: str | None = None,
    session_id: str | None = None,
) -> SoulFruitState:
    resolved_session_id = resolve_soul_session_id(session_id)
    final_fruit = fruit.strip() if isinstance(fruit, str) and fruit.strip() else None
    if final_fruit is None:
        final_fruit = get_fruit_in_maturation(store, session_id=resolved_session_id).fruit
    if not final_fruit:
        raise ValueError("harvested fruit must not be empty")

    session = store.get_runtime_session(resolved_session_id)
    metadata = _decode_metadata(session.metadata if session else None)
    soul = metadata.get(SOUL_METADATA_KEY)
    if not isinstance(soul, dict):
        soul = {}
    soul[HARVEST_METADATA_KEY] = final_fruit
    soul.pop(FRUIT_METADATA_KEY, None)
    metadata[SOUL_METADATA_KEY] = soul
    store.upsert_runtime_session(
        resolved_session_id,
        metadata=json.dumps(metadata, ensure_ascii=False),
        active=True,
    )
    return SoulFruitState(session_id=resolved_session_id, fruit=final_fruit)


def clear_harvested_fruit(
    store: Store,
    *,
    session_id: str | None = None,
) -> None:
    _clear_soul_key(store, key=HARVEST_METADATA_KEY, session_id=session_id)


def apply_identity_integration(
    store: Store,
    *,
    layer: str,
    key: str,
    content: str,
    origin: str | None = None,
    conversation_id: str | None = None,
    journal_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> tuple[IdentityIntegration, str]:
    """Record an atomic Soul integration and append it to identity content.

    The identity row remains the prompt-facing synthesized document. The
    integration row preserves the individual confirmed material for audit and
    future re-synthesis.
    """
    normalized = content.strip()
    if not normalized:
        raise ValueError("identity content must not be empty")
    if layer not in IDENTITY_INTEGRATION_SECTION_TITLES:
        raise ValueError(f"unsupported psyche layer: {layer}")

    integration = IdentityIntegration(
        layer=layer,
        key=key,
        content=normalized,
        origin=origin.strip() if isinstance(origin, str) and origin.strip() else None,
        conversation_id=(
            conversation_id.strip()
            if isinstance(conversation_id, str) and conversation_id.strip()
            else None
        ),
        journal_id=journal_id.strip()
        if isinstance(journal_id, str) and journal_id.strip()
        else None,
        metadata=json.dumps(metadata or {}, ensure_ascii=False, sort_keys=True),
    )
    store.add_identity_integration(integration)

    existing = store.get_identity(layer, key)
    updated_content = append_identity_integration_to_content(
        existing.content if existing else "",
        layer=layer,
        integration=integration,
    )
    store.upsert_identity(
        existing.model_copy(update={"content": updated_content})
        if existing
        else _identity_for_integration(layer=layer, key=key, content=updated_content)
    )
    return integration, updated_content


def append_identity_integration_to_content(
    current_content: str,
    *,
    layer: str,
    integration: IdentityIntegration,
) -> str:
    title = IDENTITY_INTEGRATION_SECTION_TITLES[layer]
    date = integration.created_at[:10]
    bullet = f"- [{date}] {integration.content.strip()}"
    base = current_content.strip()
    heading = f"## {title}"
    if not base:
        return f"{heading}\n\n{bullet}"
    if heading not in base:
        return f"{base}\n\n{heading}\n\n{bullet}"

    heading_index = base.index(heading)
    after_heading_index = heading_index + len(heading)
    next_section_index = base.find("\n## ", after_heading_index)
    insert_at = len(base) if next_section_index == -1 else next_section_index
    before = base[:insert_at].rstrip()
    after = base[insert_at:].lstrip("\n")
    updated = f"{before}\n{bullet}"
    if after:
        updated = f"{updated}\n\n{after}"
    return updated


def _identity_for_integration(*, layer: str, key: str, content: str):
    from memory.models import Identity

    now = _now()
    return Identity(layer=layer, key=key, content=content, created_at=now, updated_at=now)


def _clear_soul_key(store: Store, *, key: str, session_id: str | None) -> None:
    resolved_session_id = resolve_soul_session_id(session_id)
    session = store.get_runtime_session(resolved_session_id)
    if not session:
        return
    metadata = _decode_metadata(session.metadata)
    soul = metadata.get(SOUL_METADATA_KEY)
    if isinstance(soul, dict):
        soul.pop(key, None)
        if soul:
            metadata[SOUL_METADATA_KEY] = soul
        else:
            metadata.pop(SOUL_METADATA_KEY, None)
    store.upsert_runtime_session(
        resolved_session_id,
        metadata=json.dumps(metadata, ensure_ascii=False) if metadata else None,
    )


def _decode_metadata(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}
