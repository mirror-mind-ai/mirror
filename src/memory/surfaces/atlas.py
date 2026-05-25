"""Atlas perspective read models."""

from __future__ import annotations

from collections import Counter

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
            self._shadow_region(),
            self._personas_region(),
            self._memories_region(),
        )
        return AtlasHome(
            synthesis="A reflective map of what shapes you, speaks through you, and asks to be integrated.",
            regions=regions,
        )

    def _identity_region(self) -> AtlasRegion:
        rows = self.identity.store.get_identity_by_layer("self")
        cards = tuple(_identity_card(row) for row in rows)
        return AtlasRegion(
            id="self",
            title="Self",
            description="Who you really are.",
            cards=cards,
            empty_state=None if cards else "No identity layers are available yet.",
            metadata=_region_metadata("self", cards),
        )

    def _ego_region(self) -> AtlasRegion:
        rows = self.identity.store.get_identity_by_layer("ego")
        cards = (_ego_card(rows),) if rows else ()
        return AtlasRegion(
            id="ego",
            title="Ego",
            description="How you operate in the world.",
            cards=cards,
            empty_state=None if cards else "No ego layers are available yet.",
            metadata=_region_metadata("ego", cards),
        )

    def _personas_region(self) -> AtlasRegion:
        rows = self.identity.store.get_identity_by_layer("persona")
        cards = tuple(_persona_card(row) for row in rows)
        return AtlasRegion(
            id="personas",
            title="Personas",
            description="The team of lenses that can join the work.",
            cards=cards,
            empty_state=None if cards else "No personas are available yet.",
            metadata={
                **_region_metadata("personas", cards),
                "icon": "✣",
                "motif": "Action",
                "chips": ("Lenses", "Roles", "Voices"),
            },
        )

    def _shadow_region(self) -> AtlasRegion:
        rows = self.identity.store.get_identity_by_layer("shadow")
        cards = tuple(_identity_card(row) for row in rows)
        if not cards:
            cards = (_shadow_placeholder_card(),)
        return AtlasRegion(
            id="shadow",
            title="Shadow",
            description="What asks to be integrated.",
            cards=cards,
            empty_state=None,
            metadata=_region_metadata(
                "shadow", cards, partial=not self.identity.store.get_identity_by_layer("shadow")
            ),
        )

    def _memories_region(self) -> AtlasRegion:
        cards = _memory_category_cards(
            memory_counts=Counter(
                _memory_category(memory.memory_type)
                for memory in self.memories.list_recent(limit=10000)
            ),
            journey_count=len(self.journeys.list_active_journeys()),
        )
        return AtlasRegion(
            id="memories",
            title="Memories",
            description="What has been retained over time.",
            cards=cards,
            empty_state=None if cards else "No memory categories are available yet.",
            metadata=_region_metadata("memories", cards, partial=True),
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


def _memory_category_cards(
    *, memory_counts: Counter[str], journey_count: int
) -> tuple[SurfaceCard, ...]:
    counts = Counter(memory_counts)
    if journey_count:
        counts["Journeys"] += journey_count
    if not counts:
        return ()

    ranked = counts.most_common()
    visible = ranked[:7]
    other_count = sum(count for _, count in ranked[7:])
    if other_count:
        visible.append(("Other", other_count))
    max_count = max(count for _, count in visible)
    return tuple(
        SurfaceCard(
            id=f"memory-category:{label.lower().replace(' ', '-')}",
            kind="memory-category",
            title=label,
            description="A type of retained Mirror memory.",
            href=f"/objects/memory-category/{label.lower().replace(' ', '-')}",
            count=count,
            metadata={
                "icon": _memory_category_icon(label),
                "icon_kind": "glyph",
                "bar_ratio": count / max_count,
            },
        )
        for label, count in visible
    )


def _memory_category(raw_type: str) -> str:
    normalized = (raw_type or "").strip().lower()
    return {
        "decision": "Decisions",
        "decisao": "Decisions",
        "idea": "Ideas",
        "ideia": "Ideas",
        "insight": "Insights",
        "learning": "Learning",
        "reflection": "Reflections",
        "journal": "Reflections",
        "pattern": "Patterns",
        "padrao": "Patterns",
        "tension": "Tensions",
        "tensao": "Tensions",
        "commitment": "Commitments",
        "info": "Info",
    }.get(normalized, _humanize_key(normalized) if normalized else "Other")


def _memory_category_icon(label: str) -> str:
    return {
        "Decisions": "◆",
        "Ideas": "✧",
        "Insights": "✺",
        "Learning": "▣",
        "Reflections": "☉",
        "Patterns": "⌘",
        "Tensions": "◐",
        "Commitments": "●",
        "Journeys": "⌁",
        "Info": "◫",
        "Other": "⋯",
    }.get(label, "◫")


def _identity_card(row: Identity) -> SurfaceCard:
    object_id = identity_object_id(row.layer, row.key)
    title = _title_for_identity(row)
    return SurfaceCard(
        id=object_id,
        kind="identity",
        title=title,
        description=_identity_description(row),
        href=f"/objects/identity/{object_id}",
        status=row.layer,
        metadata={
            "layer": row.layer,
            "key": row.key,
            "icon": _icon_for_identity(row),
            "icon_kind": "glyph",
            "display_label": _display_label_for_identity(row, title),
            "chips": _chips_for_identity(row),
        },
    )


def _ego_card(rows: list[Identity]) -> SurfaceCard:
    variants = tuple({"key": row.key, "label": _ego_variant_label(row.key)} for row in rows)
    primary = next((row for row in rows if row.key == "identity"), rows[0])
    return SurfaceCard(
        id="ego",
        kind="identity",
        title="Expression",
        description="How you operate in the world.",
        href=f"/objects/identity/{identity_object_id(primary.layer, primary.key)}",
        status="ego",
        metadata={
            "layer": "ego",
            "icon": "◉",
            "icon_kind": "glyph",
            "display_label": "",
            "variants": variants,
        },
    )


def _shadow_placeholder_card() -> SurfaceCard:
    return SurfaceCard(
        id="shadow",
        kind="identity",
        title="Tension",
        description="What asks to be integrated.",
        href="/objects/identity/shadow",
        status="shadow",
        metadata={
            "layer": "shadow",
            "icon": "◐",
            "icon_kind": "glyph",
            "display_label": "Tension",
            "chips": ("Patterns", "Avoidance", "Contradictions"),
        },
    )


def _ego_variant_label(key: str) -> str:
    if key == "identity":
        return "Self-image"
    return key.replace("-", " ").replace("_", " ").title()


def _persona_card(row: Identity) -> SurfaceCard:
    label = _humanize_key(row.key)
    return SurfaceCard(
        id=row.key,
        kind="persona",
        title=label,
        description="A specialized lens the Mirror can activate when this context is present.",
        href=f"/objects/persona/{row.key}",
        status="persona",
        metadata={
            "key": row.key,
            "icon": _initials(label),
            "icon_kind": "initials",
            "display_label": label,
        },
    )


def _region_metadata(
    role: str, cards: tuple[SurfaceCard, ...], *, partial: bool = False
) -> dict[str, str]:
    if cards:
        readiness = "partial" if partial else "real"
    else:
        readiness = "empty"
    return {"atlas_role": role, "data_readiness": readiness}


def _humanize_key(key: str) -> str:
    return key.replace("-", " ").replace("_", " ").title()


def _title_for_identity(row: Identity) -> str:
    if row.layer == "self":
        return "Soul"
    if row.layer == "shadow":
        return "Tension"
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
        return _humanize_key(row.key)
    return f"{row.layer}/{row.key}"


def _chips_for_identity(row: Identity) -> tuple[str, ...]:
    if row.layer == "self":
        return ("Purpose", "Principles", "Values")
    if row.layer == "shadow":
        return ("Patterns", "Avoidance", "Contradictions")
    return ()


def _display_label_for_identity(row: Identity, title: str) -> str:
    if row.layer == "shadow":
        return ""
    return title


def _identity_description(row: Identity) -> str:
    if row.layer == "self":
        return "Who you really are."
    if row.layer == "shadow":
        return "What asks to be integrated."
    if row.layer == "journey":
        return "A remembered field of becoming or work that shapes Mirror context."
    return "A structural identity layer that shapes how the Mirror understands and responds."


def _icon_for_identity(row: Identity) -> str:
    if row.layer == "self":
        return "♛"
    if row.layer == "shadow":
        return "◐"
    if row.layer == "journey":
        return "⌁"
    return "◇"


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
