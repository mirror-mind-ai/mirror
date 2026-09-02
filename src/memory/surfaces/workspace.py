"""Workspace perspective read models."""

from __future__ import annotations

import json
import re
from typing import Any

from memory.models import Attachment, ConversationSummary, MemorySummary, Task
from memory.services.attachment import AttachmentService
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
        attachments: AttachmentService | None = None,
    ) -> None:
        self.journeys = journeys
        self.conversations = conversations
        self.memories = memories
        self.tasks = tasks
        self.attachments = attachments

    def home(self, journey_id: str | None = None) -> WorkspaceHome:
        all_journeys = self.journeys.list_journeys()
        active_journeys = [journey for journey in all_journeys if journey.get("status") == "active"]
        recent_conversations = self.conversations.list_recent(limit=200)
        recent_memories = self.memories.list_recent(limit=200)
        tasks = self.tasks.list_tasks()
        sorted_active_journeys = _sort_journeys_by_recent_activity(
            active_journeys,
            conversations=recent_conversations,
            memories=recent_memories,
            tasks=tasks,
        )
        inactive_journeys = sorted(
            [journey for journey in all_journeys if journey.get("status") != "active"],
            key=lambda journey: (
                journey.get("status") != "completed",
                journey.get("name", "").lower(),
            ),
        )
        display_journeys = sorted_active_journeys + inactive_journeys
        selected_journey_id = _select_journey_id(display_journeys, recent_conversations, journey_id)
        selected_journey = _find_journey(display_journeys, selected_journey_id)

        journey_conversations = (
            self.conversations.list_recent(limit=200, journey=selected_journey_id)
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
        journey_attachments = (
            self.attachments.get_attachments(selected_journey_id)
            if selected_journey_id and self.attachments
            else []
        )

        scene = self._scene_model(
            mode="focused" if journey_id else "global",
            journeys=display_journeys,
            selected_journey=selected_journey,
            conversations=recent_conversations,
            memories=recent_memories,
            tasks=tasks,
        )

        sections = (
            self._briefing_section(selected_journey),
            self._attachments_section(journey_attachments),
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
                    id="journey-attachments",
                    label="Attachments",
                    value=len(journey_attachments),
                    description="For selected journey",
                    status="partial",
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
            journeys=tuple(_journey_card(journey) for journey in display_journeys),
            selected_journey_id=selected_journey_id,
            selected_journey=selected_card,
            scene=scene,
            sections=sections,
        )

    def _scene_model(
        self,
        *,
        mode: str,
        journeys: list[dict],
        selected_journey: dict | None,
        conversations: list[ConversationSummary],
        memories: list[MemorySummary],
        tasks: list[Task],
    ) -> dict[str, Any]:
        journey_ids = {journey["id"] for journey in journeys}
        selected_id = selected_journey["id"] if selected_journey else None
        by_parent: dict[str, list[dict]] = {}
        roots: list[dict] = []
        for journey in journeys:
            parent = journey.get("metadata", {}).get("parent_journey") or ""
            if parent and parent in journey_ids:
                by_parent.setdefault(parent, []).append(journey)
            else:
                roots.append(journey)

        visited: set[str] = set()

        def build_branch(journey: dict) -> dict[str, Any]:
            item = self._scene_journey_item(
                journey, conversations=conversations, memories=memories, tasks=tasks
            )
            journey_id = journey["id"]
            if journey_id in visited:
                return item
            visited.add(journey_id)
            item["children"] = [
                build_branch(child)
                for child in by_parent.get(journey_id, [])
                if child["id"] not in visited
            ]
            return item

        map_items = [build_branch(root) for root in roots]
        # Keep malformed rootless cycles bounded and visible instead of hanging.
        map_items.extend(
            build_branch(journey) for journey in journeys if journey["id"] not in visited
        )
        location_path = self._scene_location_path(selected_journey, journeys)
        nearby = self._scene_nearby(selected_journey, journeys) if selected_journey else []
        signals = self._scene_signals(
            selected_id=selected_id,
            conversations=conversations,
            memories=memories,
            tasks=tasks,
        )
        scene_without_synthesis: dict[str, Any] = {
            "mode": mode,
            "selectedJourneyId": selected_id,
            "journeyMap": map_items,
            "locationPath": location_path,
            "nearbyJourneys": nearby,
            "signals": signals,
        }
        scene_without_synthesis["synthesis"] = {
            "state": "not_run",
            "text": self._scene_fallback(mode, selected_journey, signals),
        }
        return scene_without_synthesis

    def _scene_journey_item(
        self,
        journey: dict,
        *,
        conversations: list[ConversationSummary],
        memories: list[MemorySummary],
        tasks: list[Task],
    ) -> dict[str, Any]:
        journey_id = journey["id"]
        recent_titles = [
            conversation.title or conversation.id[:8]
            for conversation in conversations
            if conversation.journey == journey_id
        ][:5]
        memory_titles = [memory.title for memory in memories if memory.journey == journey_id][:5]
        task_titles = [
            task.title for task in tasks if task.journey == journey_id and task.status != "done"
        ][:5]
        return {
            "id": journey_id,
            "title": journey.get("name") or journey_id,
            "status": journey.get("status") or "unknown",
            "parentJourney": journey.get("metadata", {}).get("parent_journey") or "",
            "horizon": self._journey_horizon(journey_id, journey.get("description", "")),
            "movement": {
                "conversationCount": sum(
                    1 for conversation in conversations if conversation.journey == journey_id
                ),
                "memoryCount": sum(1 for memory in memories if memory.journey == journey_id),
                "taskCount": len(task_titles),
                "recentConversationTitles": recent_titles,
                "recentMemoryTitles": memory_titles,
                "openTaskTitles": task_titles,
            },
            "children": [],
        }

    def _journey_horizon(self, journey_id: str, fallback: str) -> str:
        content = _journey_briefing_content(self.journeys, journey_id)
        for heading in ("Current focus", "Foco atual"):
            match = re.search(rf"## {heading}\s*\n+(.+?)(?:\n\n|\n##|$)", content, re.DOTALL)
            if match:
                return " ".join(match.group(1).split())[:240]
        stage_match = re.search(r"\*\*(?:Stage|Etapa):\*\*\s*([^\n]+)", content)
        if stage_match:
            return stage_match.group(1).strip()
        return fallback

    def _scene_location_path(
        self, selected_journey: dict | None, journeys: list[dict]
    ) -> list[dict[str, str]]:
        if not selected_journey:
            return []
        by_id = {journey["id"]: journey for journey in journeys}
        reversed_path: list[dict[str, str]] = []
        current: dict | None = selected_journey
        visited: set[str] = set()
        while current is not None and current["id"] not in visited:
            visited.add(current["id"])
            reversed_path.append(
                {"id": current["id"], "title": current.get("name") or current["id"]}
            )
            parent_id = current.get("metadata", {}).get("parent_journey") or ""
            current = by_id.get(parent_id)
        return list(reversed(reversed_path))

    def _scene_nearby(
        self, selected_journey: dict | None, journeys: list[dict]
    ) -> list[dict[str, str]]:
        if not selected_journey:
            return []
        parent_id = selected_journey.get("metadata", {}).get("parent_journey") or ""
        siblings = [
            journey
            for journey in journeys
            if journey["id"] != selected_journey["id"]
            and (journey.get("metadata", {}).get("parent_journey") or "") == parent_id
        ]
        return [
            {"id": journey["id"], "title": journey.get("name") or journey["id"]}
            for journey in siblings[:6]
        ]

    def _scene_signals(
        self,
        *,
        selected_id: str | None,
        conversations: list[ConversationSummary],
        memories: list[MemorySummary],
        tasks: list[Task],
    ) -> list[dict[str, str]]:
        def include_journey(journey: str | None) -> bool:
            return selected_id is None or journey == selected_id

        signals: list[dict[str, str]] = []
        for conversation in conversations:
            if include_journey(conversation.journey):
                signals.append(
                    {
                        "kind": "conversation",
                        "title": conversation.title or conversation.id[:8],
                        "journey": conversation.journey or "",
                    }
                )
            if len(signals) >= 8:
                break
        for memory in memories:
            if include_journey(memory.journey):
                signals.append(
                    {
                        "kind": memory.memory_type,
                        "title": memory.title,
                        "journey": memory.journey or "",
                    }
                )
            if len(signals) >= 12:
                break
        for task in tasks:
            if include_journey(task.journey) and task.status != "done":
                signals.append({"kind": "task", "title": task.title, "journey": task.journey or ""})
            if len(signals) >= 16:
                break
        return signals

    def _scene_fallback(
        self, mode: str, selected_journey: dict | None, signals: list[dict[str, str]]
    ) -> str:
        if selected_journey:
            return f"Focused Scene for {selected_journey.get('name') or selected_journey['id']}. Recent signals are available below; synthesis is unavailable right now."
        if signals:
            return "Global Scene across your journeys. Recent movement signals are available below; synthesis is unavailable right now."
        return "Global Scene across your journeys. There are not enough recent signals for a grounded synthesis yet."

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

    def _attachments_section(self, attachments: list[Attachment]) -> WorkspaceSection:
        cards = tuple(
            SurfaceCard(
                id=attachment.id,
                kind="attachment",
                title=attachment.name,
                description=attachment.description or _content_preview(attachment.content),
                href=f"/objects/attachment/{attachment.id}",
                status=attachment.content_type,
                metadata={
                    "icon": _attachment_icon(attachment.content_type),
                    "journey": attachment.journey_id,
                    "content_type": attachment.content_type,
                    "tags": attachment.tags,
                    "created_at": attachment.created_at,
                    "data_readiness": "real",
                },
            )
            for attachment in attachments
        )
        return WorkspaceSection(
            id="attachments",
            title="Attachments",
            description="Reference material attached to the selected journey.",
            cards=cards,
            empty_state=None if cards else "No attachments are available for this journey yet.",
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
                "key": "title",
                "label": "Title",
                "value": journey.get("name") or journey["id"],
                "description": "Display title stored as the journey markdown heading.",
            },
            {
                "key": "status",
                "label": "Status",
                "value": journey.get("status") or "unknown",
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
            {
                "key": "parentJourney",
                "label": "Parent journey",
                "value": metadata.get("parent_journey") or "Not configured",
                "description": "Optional organizational parent in the journey tree.",
            },
        ]
        return WorkspaceSection(
            id="settings",
            title="Settings",
            description="Configuration bindings for the selected journey. Read-only for now.",
            metadata={"settings": settings, "journeyOptions": self.journeys.list_journey_options()},
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
    return None


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
    metadata = journey.get("metadata", {}) if isinstance(journey.get("metadata"), dict) else {}
    return SurfaceCard(
        id=journey["id"],
        kind="journey",
        title=journey["name"] or journey["id"],
        description=journey["description"],
        href=f"/objects/journey/{journey['id']}",
        status=journey.get("status") or "unknown",
        metadata={
            "icon": metadata.get("icon") or "⌁",
            "parent_journey": metadata.get("parent_journey") or "",
            "data_readiness": "real",
        },
    )


def _content_preview(content: str, limit: int = 180) -> str:
    compact = " ".join(content.strip().split())
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit].rstrip()}…"


def _attachment_icon(content_type: str) -> str:
    return {
        "markdown": "◨",
        "text": "▤",
        "yaml": "▧",
    }.get(content_type, "◨")


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
