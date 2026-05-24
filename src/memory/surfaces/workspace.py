"""Workspace perspective read models."""

from __future__ import annotations

from memory.services.conversation import ConversationService
from memory.services.journey import JourneyService
from memory.services.memory import MemoryService
from memory.services.tasks import TaskService
from memory.surfaces.models import SurfaceCard, WorkspaceHome, WorkspaceSection


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

    def home(self) -> WorkspaceHome:
        sections = (
            self._active_journeys_section(),
            self._tasks_section(),
            self._recent_conversations_section(),
            self._relevant_memories_section(),
            self._decisions_section(),
        )
        return WorkspaceHome(status="Read-only operational overview", sections=sections)

    def _active_journeys_section(self) -> WorkspaceSection:
        journeys = self.journeys.list_active_journeys()
        cards = tuple(
            SurfaceCard(
                id=journey["id"],
                kind="journey",
                title=journey["name"] or journey["id"],
                description=journey["description"],
                href=f"/objects/journey/{journey['id']}",
                status="active",
            )
            for journey in journeys
        )
        return WorkspaceSection(
            id="active-journeys",
            title="Active journeys",
            description="Work fields currently known by this Mirror.",
            cards=cards,
            empty_state=None if cards else "No active journeys are available yet.",
        )

    def _tasks_section(self) -> WorkspaceSection:
        tasks = self.tasks.list_tasks(open_only=True)[:10]
        cards = tuple(
            SurfaceCard(
                id=task.id,
                kind="task",
                title=task.title,
                description=task.context or task.stage or "Open task",
                href=f"/objects/task/{task.id}",
                status=task.status,
            )
            for task in tasks
        )
        return WorkspaceSection(
            id="tasks",
            title="Open tasks",
            description="Concrete open work when task data exists.",
            cards=cards,
            empty_state=None if cards else "No open tasks are available yet.",
        )

    def _recent_conversations_section(self) -> WorkspaceSection:
        conversations = self.conversations.list_recent(limit=5)
        cards = tuple(
            SurfaceCard(
                id=conversation.id,
                kind="conversation",
                title=conversation.title or conversation.id[:8],
                description=f"{conversation.message_count} messages",
                href=f"/objects/conversation/{conversation.id}",
                status=conversation.journey or conversation.persona,
            )
            for conversation in conversations
        )
        return WorkspaceSection(
            id="recent-conversations",
            title="Recent conversations",
            description="Operational trail that shaped recent state.",
            cards=cards,
            empty_state=None if cards else "No conversations are available yet.",
        )

    def _relevant_memories_section(self) -> WorkspaceSection:
        memories = self.memories.list_recent(limit=5)
        cards = tuple(
            SurfaceCard(
                id=memory.id,
                kind="memory",
                title=memory.title,
                description=memory.content,
                href=f"/objects/memory/{memory.id}",
                status=memory.layer,
                accent=memory.memory_type,
            )
            for memory in memories
        )
        return WorkspaceSection(
            id="recent-memories",
            title="Recent memories",
            description="Reusable context recently retained by the Mirror.",
            cards=cards,
            empty_state=None if cards else "No memories are available yet.",
        )

    def _decisions_section(self) -> WorkspaceSection:
        return WorkspaceSection(
            id="decisions",
            title="Decisions",
            description="Decision support will start as derived or placeholder data in 1.0.",
            empty_state="Decisions are not first-class web surface data yet.",
        )
