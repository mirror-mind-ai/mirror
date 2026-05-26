"""Workspace perspective read models."""

from __future__ import annotations

import json

from memory.models import ConversationSummary, MemorySummary, Task
from memory.services.conversation import ConversationService
from memory.services.journey import JourneyService
from memory.services.memory import MemoryService
from memory.services.tasks import TaskService
from memory.surfaces.models import SurfaceCard, WorkspaceHome, WorkspaceMetric, WorkspaceSection


class WorkspaceSurface:
    """Compose the analytical work-dashboard read model."""

    def __init__(
        self,
        *,
        journeys: JourneyService,
        conversations: ConversationService,
        memories: MemoryService,
        tasks: TaskService,
    ) -> None:
        self.journeys = journeys
        self.conversations = conversations
        self.memories = memories
        self.tasks = tasks

    def home(self, journey_id: str | None = None) -> WorkspaceHome:
        active_journeys = self.journeys.list_active_journeys()
        recent_conversations = self.conversations.list_recent(limit=200)
        recent_memories = self.memories.list_recent(limit=200)
        tasks = self.tasks.list_tasks()
        active_journeys = _sort_journeys_by_recent_activity(
            active_journeys,
            conversations=recent_conversations,
            memories=recent_memories,
            tasks=tasks,
        )
        selected_journey_id = _select_journey_id(active_journeys, recent_conversations, journey_id)
        selected_journey = _find_journey(active_journeys, selected_journey_id)

        journey_conversations = (
            self.conversations.list_recent(limit=8, journey=selected_journey_id)
            if selected_journey_id
            else []
        )
        journey_memories = (
            self.memories.list_recent(limit=8, journey=selected_journey_id)
            if selected_journey_id
            else []
        )
        journey_decisions = (
            self.memories.list_recent(limit=5, memory_type="decision", journey=selected_journey_id)
            if selected_journey_id
            else []
        )

        sections = (
            self._briefing_section(selected_journey),
            self._recent_conversations_section(journey_conversations),
            self._relevant_memories_section(journey_memories),
            self._decisions_section(journey_decisions),
            self._settings_section(selected_journey),
        )
        selected_card = _journey_card(selected_journey) if selected_journey else None
        return WorkspaceHome(
            status="Where you find your journeys, conversations, memories and decisions.",
            metrics=(
                WorkspaceMetric(
                    id="active-journeys",
                    label="Active journeys",
                    value=len(active_journeys),
                    description="Known work fields",
                ),
                WorkspaceMetric(
                    id="recent-conversations",
                    label="Conversations",
                    value=len(journey_conversations),
                    description="For selected journey",
                ),
                WorkspaceMetric(
                    id="conversation-messages",
                    label="Messages",
                    value=sum(conversation.message_count for conversation in journey_conversations),
                    description="Across shown conversations",
                ),
                WorkspaceMetric(
                    id="recent-memories",
                    label="Memories",
                    value=len(journey_memories),
                    description="For selected journey",
                    status="partial",
                ),
                WorkspaceMetric(
                    id="recent-decisions",
                    label="Decisions",
                    value=len(journey_decisions),
                    description="For selected journey",
                    status="derived",
                ),
            ),
            journeys=tuple(_journey_card(journey) for journey in active_journeys),
            selected_journey_id=selected_journey_id,
            selected_journey=selected_card,
            sections=sections,
        )

    def _briefing_section(self, journey: dict | None) -> WorkspaceSection:
        if journey is None:
            return WorkspaceSection(
                id="briefing",
                title="Briefing",
                description="Selected journey briefing.",
                empty_state="No active journey is available yet.",
            )
        content = _journey_briefing_content(self.journeys, journey["id"])
        return WorkspaceSection(
            id="briefing",
            title="Briefing",
            description="Current briefing for the selected journey.",
            empty_state=None if content else "No journey briefing is available yet.",
            metadata={"content": content} if content else None,
        )

    def _settings_section(self, journey: dict | None) -> WorkspaceSection:
        if journey is None:
            return WorkspaceSection(
                id="settings",
                title="Settings",
                description="Selected journey configuration.",
                empty_state="No active journey is selected.",
            )
        row = self.journeys.store.get_identity("journey", journey["id"])
        metadata = _metadata_dict(row.metadata if row else None)
        settings = [
            {
                "key": "journeyId",
                "label": "Journey ID",
                "value": journey["id"],
                "description": "Stable routing key.",
            },
            {
                "key": "status",
                "label": "Status",
                "value": "active",
                "description": "Current journey status.",
            },
            {
                "key": "projectPath",
                "label": "Project path",
                "value": metadata.get("project_path") or "Not configured",
                "description": "Local project directory associated with this journey.",
            },
            {
                "key": "syncFile",
                "label": "Sync file",
                "value": metadata.get("sync_file") or "Not configured",
                "description": "External journey path file, when configured.",
            },
            {
                "key": "icon",
                "label": "Icon",
                "value": metadata.get("icon") or journey.get("metadata", {}).get("icon") or "⌁",
                "description": "Visual marker used for this journey.",
            },
            {
                "key": "color",
                "label": "Color",
                "value": metadata.get("color") or "Not configured",
                "description": "Optional visual color metadata.",
            },
        ]
        return WorkspaceSection(
            id="settings",
            title="Settings",
            description="Configuration bindings for the selected journey. Read-only for now.",
            metadata={"settings": settings},
        )

    def _recent_conversations_section(
        self, conversations: list[ConversationSummary]
    ) -> WorkspaceSection:
        cards = tuple(
            SurfaceCard(
                id=conversation.id,
                kind="conversation",
                title=conversation.title or conversation.id[:8],
                description=f"{conversation.message_count} messages",
                href=f"/objects/conversation/{conversation.id}",
                status=conversation.journey or conversation.persona,
                metadata={
                    "icon": "☷",
                    "message_count": conversation.message_count,
                    "journey": conversation.journey,
                    "persona": conversation.persona,
                    "started_at": conversation.started_at,
                    "data_readiness": "partial",
                },
            )
            for conversation in conversations
        )
        return WorkspaceSection(
            id="conversations",
            title="Conversations",
            description="Conversation trail for the selected journey.",
            cards=cards,
            empty_state=None if cards else "No conversations are available for this journey yet.",
        )

    def _relevant_memories_section(self, memories: list[MemorySummary]) -> WorkspaceSection:
        cards = tuple(
            SurfaceCard(
                id=memory.id,
                kind="memory",
                title=memory.title,
                description=memory.content,
                href=f"/objects/memory/{memory.id}",
                status=memory.layer,
                accent=memory.memory_type,
                metadata={
                    "icon": _memory_icon(memory.memory_type),
                    "memory_type": memory.memory_type,
                    "journey": memory.journey,
                    "persona": memory.persona,
                    "created_at": memory.created_at,
                    "data_readiness": "partial",
                },
            )
            for memory in memories
        )
        return WorkspaceSection(
            id="memories",
            title="Memories",
            description="Reusable context retained for the selected journey.",
            cards=cards,
            empty_state=None if cards else "No memories are available for this journey yet.",
        )

    def _decisions_section(self, decisions: list[MemorySummary]) -> WorkspaceSection:
        cards = tuple(
            SurfaceCard(
                id=memory.id,
                kind="memory",
                title=memory.title,
                description=memory.content,
                href=f"/objects/memory/{memory.id}",
                status=memory.journey or memory.layer,
                accent=memory.memory_type,
                metadata={
                    "icon": "◆",
                    "memory_type": memory.memory_type,
                    "journey": memory.journey,
                    "created_at": memory.created_at,
                    "data_readiness": "derived",
                },
            )
            for memory in decisions
        )
        return WorkspaceSection(
            id="decisions",
            title="Decisions",
            description="Decision memories retained for the selected journey.",
            cards=cards,
            empty_state=None
            if cards
            else "No decision memories are available for this journey yet.",
        )


def _sort_journeys_by_recent_activity(
    journeys: list[dict],
    *,
    conversations: list[ConversationSummary],
    memories: list[MemorySummary],
    tasks: list[Task],
) -> list[dict]:
    latest_by_journey: dict[str, str] = {}

    def mark(journey_id: str | None, timestamp: str | None) -> None:
        if not journey_id or not timestamp:
            return
        if timestamp > latest_by_journey.get(journey_id, ""):
            latest_by_journey[journey_id] = timestamp

    for conversation in conversations:
        mark(conversation.journey, conversation.started_at)
    for memory in memories:
        mark(memory.journey, memory.created_at)
    for task in tasks:
        mark(task.journey, task.updated_at or task.created_at)

    return sorted(
        journeys,
        key=lambda journey: (
            latest_by_journey.get(journey["id"], ""),
            journey["name"] or journey["id"],
        ),
        reverse=True,
    )


def _select_journey_id(
    journeys: list[dict],
    conversations: list[ConversationSummary],
    requested_id: str | None = None,
) -> str | None:
    active_ids = {journey["id"] for journey in journeys}
    if requested_id in active_ids:
        return requested_id
    for conversation in conversations:
        if conversation.journey and conversation.journey in active_ids:
            return conversation.journey
    return journeys[0]["id"] if journeys else None


def _find_journey(journeys: list[dict], journey_id: str | None) -> dict | None:
    if journey_id is None:
        return None
    return next((journey for journey in journeys if journey["id"] == journey_id), None)


def _journey_briefing_content(journeys: JourneyService, journey_id: str) -> str:
    row = journeys.store.get_identity("journey", journey_id)
    if row is None:
        return ""
    return row.content or ""


def _metadata_dict(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _journey_card(journey: dict) -> SurfaceCard:
    return SurfaceCard(
        id=journey["id"],
        kind="journey",
        title=journey["name"] or journey["id"],
        description=journey["description"],
        href=f"/objects/journey/{journey['id']}",
        status="active",
        metadata={"icon": "⌁", "data_readiness": "real"},
    )


def _memory_icon(memory_type: str) -> str:
    return {
        "decision": "◆",
        "decisao": "◆",
        "idea": "✧",
        "ideia": "✧",
        "insight": "✺",
        "learning": "▣",
        "reflection": "☉",
        "journal": "☉",
        "pattern": "⌘",
        "padrao": "⌘",
        "tension": "◐",
        "tensao": "◐",
        "commitment": "●",
        "info": "◫",
    }.get((memory_type or "").lower(), "◫")
