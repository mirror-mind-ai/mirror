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
            self._ego_region(),
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
        rows = [
            row
            for row in self.identity.store.get_all_identity()
            if row.layer not in {"persona", "ego"}
        ]
        cards = tuple(_identity_card(row) for row in rows)
        return AtlasRegion(
            id="identity",
            title="Self / Identity",
            description="Structural layers that shape how the Mirror responds.",
            cards=cards,
            empty_state=None if cards else "No identity layers are available yet.",
            metadata=_region_metadata("north", cards),
        )

    def _ego_region(self) -> AtlasRegion:
        rows = self.identity.store.get_identity_by_layer("ego")
        cards = (_ego_card(rows),) if rows else ()
        return AtlasRegion(
            id="ego",
            title="Ego / Voice",
            description="The active operational voice through which the Mirror speaks.",
            cards=cards,
            empty_state=None if cards else "No ego layers are available yet.",
            metadata=_region_metadata("center", cards),
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
            metadata=_region_metadata("west", cards),
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
            metadata=_region_metadata("south-west", cards),
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
            metadata=_region_metadata("south", cards, partial=True),
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
            metadata=_region_metadata("east", cards, partial=True),
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
            metadata=_region_metadata("south-east", cards, partial=True),
        )


def _identity_card(row: Identity) -> SurfaceCard:
    object_id = identity_object_id(row.layer, row.key)
    return SurfaceCard(
        id=object_id,
        kind="identity",
        title=_title_for_identity(row),
        description=_identity_description(row),
        href=f"/objects/identity/{object_id}",
        status=row.layer,
        metadata={"layer": row.layer, "key": row.key, "icon": _icon_for_identity(row)},
    )


def _ego_card(rows: list[Identity]) -> SurfaceCard:
    variants = tuple(
        {"key": row.key, "label": row.key.replace("-", " ").replace("_", " ").title()}
        for row in rows
    )
    primary = next((row for row in rows if row.key == "identity"), rows[0])
    return SurfaceCard(
        id="ego",
        kind="identity",
        title="Ego",
        description="The Mirror's speaking voice, behavioral stance, and operating constraints.",
        href=f"/objects/identity/{identity_object_id(primary.layer, primary.key)}",
        status="ego",
        metadata={"layer": "ego", "icon": "E", "variants": variants},
    )


def _persona_card(row: Identity) -> SurfaceCard:
    return SurfaceCard(
        id=row.key,
        kind="persona",
        title=_title_for_identity(row),
        description="A specialized lens the Mirror can activate when this context is present.",
        href=f"/objects/persona/{row.key}",
        status="persona",
        metadata={"layer": row.layer, "key": row.key, "icon": _initials(_title_for_identity(row))},
    )


def _region_metadata(
    role: str, cards: tuple[SurfaceCard, ...], *, partial: bool = False
) -> dict[str, str]:
    if cards:
        readiness = "partial" if partial else "real"
    else:
        readiness = "empty"
    return {"atlas_role": role, "data_readiness": readiness}


def _title_for_identity(row: Identity) -> str:
    first_heading = next(
        (
            line.removeprefix("#").strip()
            for line in row.content.splitlines()
            if line.startswith("#")
        ),
        "",
    )
    if first_heading:
        return first_heading
    if row.layer == "persona":
        return row.key.replace("-", " ").replace("_", " ").title()
    return f"{row.layer}/{row.key}"


def _identity_description(row: Identity) -> str:
    if row.layer == "shadow":
        return "A structural shadow observation: tension, avoidance, contradiction, or integration material."
    if row.layer == "journey":
        return "A remembered field of becoming or work that shapes Mirror context."
    return "A structural identity layer that shapes how the Mirror understands and responds."


def _icon_for_identity(row: Identity) -> str:
    if row.layer == "shadow":
        return "S"
    if row.layer == "journey":
        return "J"
    return _initials(_title_for_identity(row))


def _initials(value: str) -> str:
    words = [word for word in value.replace("/", " ").replace("-", " ").split() if word]
    if not words:
        return "?"
    if len(words) == 1:
        return words[0][:2].upper()
    return "".join(word[0] for word in words[:2]).upper()


def _preview(content: str, *, limit: int = 140) -> str:
    collapsed = " ".join(content.split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[: limit - 1].rstrip()}…"
