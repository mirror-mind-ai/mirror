"""Atlas perspective read models."""

from __future__ import annotations

from memory.models import Identity
from memory.services.conversation import ConversationService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.services.memory import MemoryService
from memory.surfaces.models import AtlasHome, AtlasRegion, SurfaceCard
from memory.surfaces.objects import identity_object_id


class AtlasSurface:
    """Compose the editorial psyche-map read model."""

    def __init__(
        self,
        *,
        identity: IdentityService,
        journeys: JourneyService,
        memories: MemoryService,
        conversations: ConversationService,
    ) -> None:
        self.identity = identity
        self.journeys = journeys
        self.memories = memories
        self.conversations = conversations

    def home(self) -> AtlasHome:
        regions = (
            self._identity_region(),
            self._personas_region(),
            self._shadow_region(),
            self._memories_region(),
            self._journeys_region(),
            self._conversations_region(),
        )
        return AtlasHome(
            synthesis="An editorial map of the identity, lenses, memories, and trails inside this Mirror.",
            regions=regions,
        )

    def _identity_region(self) -> AtlasRegion:
        rows = [row for row in self.identity.store.get_all_identity() if row.layer != "persona"]
        cards = tuple(_identity_card(row) for row in rows)
        return AtlasRegion(
            id="identity",
            title="Identity",
            description="Structural layers that shape how the Mirror responds.",
            cards=cards,
            empty_state=None if cards else "No identity layers are available yet.",
        )

    def _personas_region(self) -> AtlasRegion:
        rows = self.identity.store.get_identity_by_layer("persona")
        cards = tuple(_persona_card(row) for row in rows)
        return AtlasRegion(
            id="personas",
            title="Personas",
            description="Specialized lenses that activate by context.",
            cards=cards,
            empty_state=None if cards else "No personas are available yet.",
        )

    def _shadow_region(self) -> AtlasRegion:
        rows = self.identity.store.get_identity_by_layer("shadow")
        cards = tuple(_identity_card(row) for row in rows)
        return AtlasRegion(
            id="shadow",
            title="Shadow",
            description="Tensions, avoidances, contradictions, and integration candidates.",
            cards=cards,
            empty_state=None if cards else "No structural shadow observations are available yet.",
        )

    def _memories_region(self) -> AtlasRegion:
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
        return AtlasRegion(
            id="memories",
            title="Memories",
            description="Retained meaning, facts, patterns, and evidence.",
            cards=cards,
            empty_state=None if cards else "No memories are available yet.",
        )

    def _journeys_region(self) -> AtlasRegion:
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
        return AtlasRegion(
            id="journeys",
            title="Journeys",
            description="Fields of becoming and work.",
            cards=cards,
            empty_state=None if cards else "No active journeys are available yet.",
        )

    def _conversations_region(self) -> AtlasRegion:
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
        return AtlasRegion(
            id="conversations",
            title="Conversations",
            description="The raw trail from which memory, decisions, and patterns emerge.",
            cards=cards,
            empty_state=None if cards else "No conversations are available yet.",
        )


def _identity_card(row: Identity) -> SurfaceCard:
    object_id = identity_object_id(row.layer, row.key)
    return SurfaceCard(
        id=object_id,
        kind="identity",
        title=f"{row.layer}/{row.key}",
        description=_preview(row.content),
        href=f"/objects/identity/{object_id}",
        status=row.layer,
    )


def _persona_card(row: Identity) -> SurfaceCard:
    return SurfaceCard(
        id=row.key,
        kind="persona",
        title=row.key,
        description=_preview(row.content),
        href=f"/objects/persona/{row.key}",
        status="persona",
    )


def _preview(content: str, *, limit: int = 140) -> str:
    collapsed = " ".join(content.split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[: limit - 1].rstrip()}…"
