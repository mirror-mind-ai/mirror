"""Explorer Mode story state and durable persistence."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from memory.storage.store import Store

EXPLORER_STORY_SESSION_PREFIX = "__explorer_story__:"
_UNSET = object()


@dataclass(frozen=True)
class ExplorerAttractor:
    label: str
    description: str | None = None
    status: str = "proposed"


@dataclass(frozen=True)
class ExplorerExperimentProposal:
    title: str
    description: str | None = None
    status: str = "proposed"


@dataclass(frozen=True)
class ExplorerBuilderHandoff:
    title: str
    summary: str | None = None
    readiness: str = "proposed"
    artifact_dir: str | None = None
    index_path: str | None = None
    exploratory_story_path: str | None = None
    handoff_info_path: str | None = None
    product_design_proposal_path: str | None = None
    full_conversation_path: str | None = None


@dataclass(frozen=True)
class ExplorerSourceConversation:
    conversation_id: str
    title: str | None = None
    role: str = "source evidence"


@dataclass(frozen=True)
class ExplorerStory:
    journey: str
    current_exploratory_story: str | None = None
    narrative_field_summary: str | None = None
    last_story_card: str | None = None
    attractors: tuple[ExplorerAttractor, ...] = ()
    experiment_proposal: ExplorerExperimentProposal | None = None
    builder_handoff: ExplorerBuilderHandoff | None = None
    source_conversations: tuple[ExplorerSourceConversation, ...] = ()
    id: str | None = None
    title: str | None = None
    status: str = "active"
    created_at: str | None = None
    updated_at: str | None = None
    promoted_at: str | None = None
    archived_at: str | None = None


def _session_id(journey: str) -> str:
    normalized = journey.strip()
    if not normalized:
        raise ValueError("journey must not be empty")
    return f"{EXPLORER_STORY_SESSION_PREFIX}{normalized}"


def _clean(value: str | None | object) -> str | None | object:
    if value is _UNSET:
        return _UNSET
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _resolve_scalar(
    value: str | None | object,
    existing_value: str | None,
    *,
    has_existing: bool,
) -> str | None:
    if value is _UNSET:
        return existing_value if has_existing else None
    return value if isinstance(value, str) else None


def get_explorer_story(store: Store, journey: str) -> ExplorerStory | None:
    """Return the active durable Explorer Story for a journey.

    Falls back to the pre-DS8 runtime-state payload so old in-session stories can
    still be read until they are next updated into durable storage.
    """
    normalized_journey = _normalize_journey(journey)
    record = store.get_active_explorer_story_record(normalized_journey)
    if record:
        return _story_from_record(record)
    return _get_runtime_explorer_story(store, normalized_journey)


def list_explorer_stories(store: Store, journey: str) -> list[ExplorerStory]:
    """List durable Exploratory Stories for a journey, active story first."""
    normalized_journey = _normalize_journey(journey)
    return [
        _story_from_record(record)
        for record in store.list_explorer_story_records(normalized_journey)
    ]


def update_explorer_story(
    store: Store,
    journey: str,
    *,
    current_exploratory_story: str | None | object = _UNSET,
    narrative_field_summary: str | None | object = _UNSET,
    last_story_card: str | None | object = _UNSET,
) -> ExplorerStory:
    """Create or update the durable Explorer Story for a journey.

    Omitted fields preserve existing values. Explicit empty strings or None clear
    the corresponding scalar.
    """
    normalized_journey = _normalize_journey(journey)
    existing = get_explorer_story(store, normalized_journey)

    story_value = _clean(current_exploratory_story)
    summary_value = _clean(narrative_field_summary)
    last_card_value = _clean(last_story_card)

    updated = ExplorerStory(
        journey=normalized_journey,
        current_exploratory_story=_resolve_scalar(
            story_value,
            existing.current_exploratory_story if existing else None,
            has_existing=existing is not None,
        ),
        narrative_field_summary=_resolve_scalar(
            summary_value,
            existing.narrative_field_summary if existing else None,
            has_existing=existing is not None,
        ),
        last_story_card=_resolve_scalar(
            last_card_value,
            existing.last_story_card if existing else None,
            has_existing=existing is not None,
        ),
        attractors=existing.attractors if existing else (),
        experiment_proposal=existing.experiment_proposal if existing else None,
        builder_handoff=existing.builder_handoff if existing else None,
        source_conversations=existing.source_conversations if existing else (),
        title=existing.title if existing else None,
    )

    return _store_story(store, updated)


def set_explorer_attractors(
    store: Store,
    journey: str,
    attractors: list[ExplorerAttractor],
) -> ExplorerStory:
    """Replace the visible attractors for the active Explorer Story."""
    normalized_journey = _normalize_journey(journey)
    existing = get_explorer_story(store, normalized_journey)
    updated = ExplorerStory(
        journey=normalized_journey,
        current_exploratory_story=existing.current_exploratory_story if existing else None,
        narrative_field_summary=existing.narrative_field_summary if existing else None,
        last_story_card=existing.last_story_card if existing else None,
        attractors=tuple(_normalize_attractor(attractor) for attractor in attractors),
        experiment_proposal=existing.experiment_proposal if existing else None,
        builder_handoff=existing.builder_handoff if existing else None,
        source_conversations=existing.source_conversations if existing else (),
        title=existing.title if existing else None,
    )
    return _store_story(store, updated)


def set_explorer_experiment_proposal(
    store: Store,
    journey: str,
    proposal: ExplorerExperimentProposal,
) -> ExplorerStory:
    """Replace the visible experiment proposal for the active Explorer Story."""
    normalized_journey = _normalize_journey(journey)
    existing = get_explorer_story(store, normalized_journey)
    updated = ExplorerStory(
        journey=normalized_journey,
        current_exploratory_story=existing.current_exploratory_story if existing else None,
        narrative_field_summary=existing.narrative_field_summary if existing else None,
        last_story_card=existing.last_story_card if existing else None,
        attractors=existing.attractors if existing else (),
        experiment_proposal=_normalize_experiment(proposal),
        builder_handoff=existing.builder_handoff if existing else None,
        source_conversations=existing.source_conversations if existing else (),
        title=existing.title if existing else None,
    )
    return _store_story(store, updated)


def set_explorer_builder_handoff(
    store: Store,
    journey: str,
    handoff: ExplorerBuilderHandoff,
) -> ExplorerStory:
    """Replace the visible Builder handoff proposal for the active story."""
    normalized_journey = _normalize_journey(journey)
    existing = get_explorer_story(store, normalized_journey)
    updated = ExplorerStory(
        journey=normalized_journey,
        current_exploratory_story=existing.current_exploratory_story if existing else None,
        narrative_field_summary=existing.narrative_field_summary if existing else None,
        last_story_card=existing.last_story_card if existing else None,
        attractors=existing.attractors if existing else (),
        experiment_proposal=existing.experiment_proposal if existing else None,
        builder_handoff=_normalize_handoff(handoff),
        source_conversations=existing.source_conversations if existing else (),
        title=existing.title if existing else None,
    )
    return _store_story(store, updated)


def set_explorer_source_conversations(
    store: Store,
    journey: str,
    source_conversations: list[ExplorerSourceConversation],
) -> ExplorerStory:
    """Replace source conversation evidence for the active Explorer Story."""
    normalized_journey = _normalize_journey(journey)
    existing = get_explorer_story(store, normalized_journey)
    updated = ExplorerStory(
        journey=normalized_journey,
        current_exploratory_story=existing.current_exploratory_story if existing else None,
        narrative_field_summary=existing.narrative_field_summary if existing else None,
        last_story_card=existing.last_story_card if existing else None,
        attractors=existing.attractors if existing else (),
        experiment_proposal=existing.experiment_proposal if existing else None,
        builder_handoff=existing.builder_handoff if existing else None,
        source_conversations=tuple(
            _normalize_source_conversation(source) for source in source_conversations
        ),
        title=existing.title if existing else None,
    )
    return _store_story(store, updated)


def archive_explorer_story(store: Store, journey: str) -> ExplorerStory | None:
    """Archive the active durable Explorer Story for a journey."""
    normalized_journey = _normalize_journey(journey)
    before = get_explorer_story(store, normalized_journey)
    record = store.archive_active_explorer_story_record(normalized_journey)
    if record:
        _clear_runtime_story(store, normalized_journey)
        archived = _story_from_record(record)
        if _projected_story(before) != _projected_story(archived):
            store.request_projection_refresh(normalized_journey)
        return archived
    _clear_runtime_story(store, normalized_journey)
    return None


def mark_explorer_story_promoted(store: Store, journey: str) -> ExplorerStory | None:
    """Mark the active durable Explorer Story as promoted."""
    normalized_journey = _normalize_journey(journey)
    before = get_explorer_story(store, normalized_journey)
    record = store.mark_active_explorer_story_promoted(normalized_journey)
    if record:
        _clear_runtime_story(store, normalized_journey)
        promoted = _story_from_record(record)
        if _projected_story(before) != _projected_story(promoted):
            store.request_projection_refresh(normalized_journey)
        return promoted
    _clear_runtime_story(store, normalized_journey)
    return None


def clear_explorer_story(store: Store, journey: str) -> None:
    """Clear the active Explorer Story by archiving it.

    This preserves historical evidence while removing the active story. The name
    is kept for backward compatibility with the pre-DS8 CLI command.
    """
    archive_explorer_story(store, journey)


def render_explorer_story_context(story: ExplorerStory) -> str:
    """Render Explorer Story context for prompt injection or CLI inspection."""
    lines = ["=== △ Exploratory Story ===", f"journey: {story.journey}"]
    if story.id:
        lines.append(f"id: {story.id}")
    if story.status:
        lines.append(f"status: {story.status}")
    if story.title:
        lines.append(f"title: {story.title}")
    if story.current_exploratory_story:
        lines.extend(["", "current exploratory story:", story.current_exploratory_story])
    if story.narrative_field_summary:
        lines.extend(["", "narrative field summary:", story.narrative_field_summary])
    if story.last_story_card:
        lines.extend(["", "last story card:", story.last_story_card])
    if story.attractors:
        lines.extend(["", "attractors:"])
        for attractor in story.attractors:
            lines.append(f"- {attractor.label} [{attractor.status}]")
            if attractor.description:
                lines.append(f"  {attractor.description}")
    if story.experiment_proposal:
        lines.extend(
            [
                "",
                "experiment proposal:",
                f"{story.experiment_proposal.title} [{story.experiment_proposal.status}]",
            ]
        )
        if story.experiment_proposal.description:
            lines.append(story.experiment_proposal.description)
    if story.source_conversations:
        lines.extend(["", "source conversations:"])
        for source in story.source_conversations:
            title = f" — {source.title}" if source.title else ""
            lines.append(f"- {source.conversation_id}{title} [{source.role}]")
    if story.builder_handoff:
        lines.extend(
            [
                "",
                "builder handoff:",
                f"{story.builder_handoff.title} [{story.builder_handoff.readiness}]",
            ]
        )
        if story.builder_handoff.artifact_dir:
            lines.append(f"artifact_dir: {story.builder_handoff.artifact_dir}")
        if story.builder_handoff.index_path:
            lines.append(f"index: {story.builder_handoff.index_path}")
        if story.builder_handoff.full_conversation_path:
            lines.append(f"full conversation: {story.builder_handoff.full_conversation_path}")
    return "\n".join(lines)


def _store_story(store: Store, story: ExplorerStory) -> ExplorerStory:
    before = get_explorer_story(store, story.journey)
    record = store.upsert_active_explorer_story_record(
        journey=story.journey,
        title=story.title or _derive_title(story),
        current_story=story.current_exploratory_story,
        narrative_summary=story.narrative_field_summary,
        last_story_card=story.last_story_card,
        attractors=[_attractor_to_dict(attractor) for attractor in story.attractors],
        experiment_proposal=_experiment_to_dict(story.experiment_proposal),
        builder_handoff=_handoff_to_dict(story.builder_handoff),
        source_conversations=[
            _source_conversation_to_dict(source) for source in story.source_conversations
        ],
    )
    persisted = _story_from_record(record)
    _store_runtime_story(store, persisted)
    if _projected_story(before) != _projected_story(persisted):
        store.request_projection_refresh(story.journey)
    return persisted


def _projected_story(story: ExplorerStory | None) -> object:
    if story is None:
        return None
    return (
        story.id,
        story.title,
        story.status,
        story.narrative_field_summary,
        tuple(_attractor_to_dict(value).items() for value in story.attractors),
        (
            tuple(_experiment_to_dict(story.experiment_proposal).items())
            if story.experiment_proposal is not None
            else None
        ),
        (
            tuple(_handoff_to_dict(story.builder_handoff).items())
            if story.builder_handoff is not None
            else None
        ),
    )


def _store_runtime_story(store: Store, story: ExplorerStory) -> None:
    store.upsert_runtime_session(
        _session_id(story.journey),
        interface="explorer_story",
        journey=story.journey,
        active=True,
        metadata=json.dumps(_story_payload(story), ensure_ascii=False),
    )


def _clear_runtime_story(store: Store, journey: str) -> None:
    store.upsert_runtime_session(
        _session_id(journey),
        interface="explorer_story",
        journey=journey,
        active=False,
        metadata=None,
    )


def _get_runtime_explorer_story(store: Store, journey: str) -> ExplorerStory | None:
    session = store.get_runtime_session(_session_id(journey))
    if not session or not session.active or not session.metadata:
        return None
    try:
        data = json.loads(session.metadata)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return ExplorerStory(
        journey=journey,
        current_exploratory_story=_string_or_none(data.get("current_exploratory_story")),
        narrative_field_summary=_string_or_none(data.get("narrative_field_summary")),
        last_story_card=_string_or_none(data.get("last_story_card")),
        attractors=_parse_attractors(data.get("attractors")),
        experiment_proposal=_parse_experiment(data.get("experiment_proposal")),
        builder_handoff=_parse_handoff(data.get("builder_handoff")),
        source_conversations=_parse_source_conversations(data.get("source_conversations")),
    )


def _story_from_record(record: dict[str, Any]) -> ExplorerStory:
    return ExplorerStory(
        journey=str(record["journey"]),
        current_exploratory_story=_string_or_none(record.get("current_story")),
        narrative_field_summary=_string_or_none(record.get("narrative_summary")),
        last_story_card=_string_or_none(record.get("last_story_card")),
        attractors=_parse_json_attractors(record.get("attractors_json")),
        experiment_proposal=_parse_json_experiment(record.get("experiment_proposal_json")),
        builder_handoff=_parse_json_handoff(record.get("builder_handoff_json")),
        source_conversations=_parse_json_source_conversations(
            record.get("source_conversations_json")
        ),
        id=_string_or_none(record.get("id")),
        title=_string_or_none(record.get("title")),
        status=_valid_story_status(record.get("status")),
        created_at=_string_or_none(record.get("created_at")),
        updated_at=_string_or_none(record.get("updated_at")),
        promoted_at=_string_or_none(record.get("promoted_at")),
        archived_at=_string_or_none(record.get("archived_at")),
    )


def _story_payload(story: ExplorerStory) -> dict[str, Any]:
    return {
        "id": story.id,
        "title": story.title,
        "status": story.status,
        "current_exploratory_story": story.current_exploratory_story,
        "narrative_field_summary": story.narrative_field_summary,
        "last_story_card": story.last_story_card,
        "attractors": [_attractor_to_dict(attractor) for attractor in story.attractors],
        "experiment_proposal": _experiment_to_dict(story.experiment_proposal),
        "builder_handoff": _handoff_to_dict(story.builder_handoff),
        "source_conversations": [
            _source_conversation_to_dict(source) for source in story.source_conversations
        ],
    }


def _parse_json_attractors(value: object) -> tuple[ExplorerAttractor, ...]:
    return _parse_attractors(_load_json(value, default=[]))


def _parse_json_experiment(value: object) -> ExplorerExperimentProposal | None:
    return _parse_experiment(_load_json(value, default=None))


def _parse_json_handoff(value: object) -> ExplorerBuilderHandoff | None:
    return _parse_handoff(_load_json(value, default=None))


def _parse_json_source_conversations(value: object) -> tuple[ExplorerSourceConversation, ...]:
    return _parse_source_conversations(_load_json(value, default=[]))


def _load_json(value: object, *, default: object) -> object:
    if not isinstance(value, str) or not value.strip():
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _parse_attractors(value: object) -> tuple[ExplorerAttractor, ...]:
    if not isinstance(value, list):
        return ()
    attractors = []
    for item in value:
        if not isinstance(item, dict):
            continue
        label = _string_or_none(item.get("label"))
        if not label:
            continue
        attractors.append(
            ExplorerAttractor(
                label=label,
                description=_string_or_none(item.get("description")),
                status=_valid_status(item.get("status")),
            )
        )
    return tuple(attractors)


def _parse_experiment(value: object) -> ExplorerExperimentProposal | None:
    if not isinstance(value, dict):
        return None
    title = _string_or_none(value.get("title"))
    if not title:
        return None
    return ExplorerExperimentProposal(
        title=title,
        description=_string_or_none(value.get("description")),
        status=_valid_status(value.get("status")),
    )


def _parse_source_conversations(value: object) -> tuple[ExplorerSourceConversation, ...]:
    if not isinstance(value, list):
        return ()
    sources = []
    for item in value:
        if not isinstance(item, dict):
            continue
        conversation_id = _string_or_none(item.get("conversation_id"))
        if not conversation_id:
            continue
        sources.append(
            ExplorerSourceConversation(
                conversation_id=conversation_id,
                title=_string_or_none(item.get("title")),
                role=_string_or_none(item.get("role")) or "source evidence",
            )
        )
    return tuple(sources)


def _parse_handoff(value: object) -> ExplorerBuilderHandoff | None:
    if not isinstance(value, dict):
        return None
    title = _string_or_none(value.get("title"))
    if not title:
        return None
    return ExplorerBuilderHandoff(
        title=title,
        summary=_string_or_none(value.get("summary")),
        readiness=_valid_handoff_readiness(value.get("readiness")),
        artifact_dir=_string_or_none(value.get("artifact_dir")),
        index_path=_string_or_none(value.get("index_path")),
        exploratory_story_path=_string_or_none(value.get("exploratory_story_path")),
        handoff_info_path=_string_or_none(value.get("handoff_info_path")),
        product_design_proposal_path=_string_or_none(value.get("product_design_proposal_path")),
        full_conversation_path=_string_or_none(value.get("full_conversation_path")),
    )


def _normalize_attractor(attractor: ExplorerAttractor) -> ExplorerAttractor:
    label = _string_or_none(attractor.label)
    if not label:
        raise ValueError("attractor label must not be empty")
    return ExplorerAttractor(
        label=label,
        description=_string_or_none(attractor.description),
        status=_valid_status(attractor.status),
    )


def _normalize_experiment(proposal: ExplorerExperimentProposal) -> ExplorerExperimentProposal:
    title = _string_or_none(proposal.title)
    if not title:
        raise ValueError("experiment title must not be empty")
    return ExplorerExperimentProposal(
        title=title,
        description=_string_or_none(proposal.description),
        status=_valid_status(proposal.status),
    )


def _normalize_source_conversation(
    source: ExplorerSourceConversation,
) -> ExplorerSourceConversation:
    conversation_id = _string_or_none(source.conversation_id)
    if not conversation_id:
        raise ValueError("source conversation id must not be empty")
    return ExplorerSourceConversation(
        conversation_id=conversation_id,
        title=_string_or_none(source.title),
        role=_string_or_none(source.role) or "source evidence",
    )


def _normalize_handoff(handoff: ExplorerBuilderHandoff) -> ExplorerBuilderHandoff:
    title = _string_or_none(handoff.title)
    if not title:
        raise ValueError("builder handoff title must not be empty")
    return ExplorerBuilderHandoff(
        title=title,
        summary=_string_or_none(handoff.summary),
        readiness=_valid_handoff_readiness(handoff.readiness),
        artifact_dir=_string_or_none(handoff.artifact_dir),
        index_path=_string_or_none(handoff.index_path),
        exploratory_story_path=_string_or_none(handoff.exploratory_story_path),
        handoff_info_path=_string_or_none(handoff.handoff_info_path),
        product_design_proposal_path=_string_or_none(handoff.product_design_proposal_path),
        full_conversation_path=_string_or_none(handoff.full_conversation_path),
    )


def _attractor_to_dict(attractor: ExplorerAttractor) -> dict[str, Any]:
    return {
        "label": attractor.label,
        "description": attractor.description,
        "status": attractor.status,
    }


def _experiment_to_dict(
    proposal: ExplorerExperimentProposal | None,
) -> dict[str, Any] | None:
    if proposal is None:
        return None
    return {
        "title": proposal.title,
        "description": proposal.description,
        "status": proposal.status,
    }


def _source_conversation_to_dict(source: ExplorerSourceConversation) -> dict[str, Any]:
    return {
        "conversation_id": source.conversation_id,
        "title": source.title,
        "role": source.role,
    }


def _handoff_to_dict(handoff: ExplorerBuilderHandoff | None) -> dict[str, Any] | None:
    if handoff is None:
        return None
    return {
        "title": handoff.title,
        "summary": handoff.summary,
        "readiness": handoff.readiness,
        "artifact_dir": handoff.artifact_dir,
        "index_path": handoff.index_path,
        "exploratory_story_path": handoff.exploratory_story_path,
        "handoff_info_path": handoff.handoff_info_path,
        "product_design_proposal_path": handoff.product_design_proposal_path,
        "full_conversation_path": handoff.full_conversation_path,
    }


def _derive_title(story: ExplorerStory) -> str:
    text = story.current_exploratory_story or story.narrative_field_summary or "Exploratory Story"
    first_line = text.strip().splitlines()[0]
    return first_line[:80].strip() or "Exploratory Story"


def _normalize_journey(journey: str) -> str:
    normalized = journey.strip()
    if not normalized:
        raise ValueError("journey must not be empty")
    return normalized


def _valid_status(value: object) -> str:
    if value in {"proposed", "accepted"}:
        return str(value)
    return "proposed"


def _valid_handoff_readiness(value: object) -> str:
    if value in {"proposed", "confirmed"}:
        return str(value)
    return "proposed"


def _valid_story_status(value: object) -> str:
    if value in {"active", "archived", "promoted"}:
        return str(value)
    return "active"


def _string_or_none(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None
