"""Object detail read models for Mirror web surfaces."""

from __future__ import annotations

from memory.models import Identity
from memory.services.identity import IdentityService
from memory.surfaces.evidence import EvidenceSurface
from memory.surfaces.models import ObjectDetail, SourceContext, SurfaceLink


class ObjectDetailSurface:
    """Compose shared object detail read models."""

    def __init__(self, identity: IdentityService, evidence: EvidenceSurface) -> None:
        self.identity = identity
        self.evidence = evidence

    def detail(self, kind: str, object_id: str) -> ObjectDetail | None:
        if kind == "identity":
            return self._identity_detail(object_id)
        if kind == "persona":
            return self._persona_detail(object_id)
        return None

    def _identity_detail(self, object_id: str) -> ObjectDetail | None:
        if object_id == "shadow":
            return _shadow_placeholder_detail()
        parsed = _parse_identity_id(object_id)
        if parsed is None:
            return None
        layer, key = parsed
        row = self.identity.store.get_identity(layer, key)
        if row is None:
            return None
        return self._detail_from_identity(row, kind="identity", object_id=object_id)

    def _persona_detail(self, object_id: str) -> ObjectDetail | None:
        row = self.identity.store.get_identity("persona", object_id)
        if row is None:
            return None
        return self._detail_from_identity(row, kind="persona", object_id=object_id)

    def _detail_from_identity(self, row: Identity, *, kind: str, object_id: str) -> ObjectDetail:
        title = _title_for_identity(row)
        return ObjectDetail(
            id=object_id,
            kind=kind,
            title=title,
            description=_detail_description(row, kind=kind),
            content=row.content,
            relationships=_relationships_for_identity(row, kind=kind),
            source=_source_for_identity(row, kind=kind),
            evidence=self.evidence.for_object(kind, object_id),
            metadata={
                "layer": row.layer,
                "key": row.key,
                "version": row.version,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
                "public_kind": _public_kind(row, kind=kind),
                "icon": _icon_for_identity(row, kind=kind),
                "chips": _chips_for_identity(row, kind=kind),
            },
        )


def identity_object_id(layer: str, key: str) -> str:
    return f"{layer}:{key}"


def _shadow_placeholder_detail() -> ObjectDetail:
    return ObjectDetail(
        id="shadow",
        kind="identity",
        title="Tension",
        description="What asks to be integrated.",
        content=(
            "# Tension\n\n"
            "Shadow material will appear here when explicit shadow identity entries exist."
        ),
        relationships=(
            SurfaceLink(
                label="Self", href="/objects/identity/self:soul", kind="identity", id="self:soul"
            ),
            SurfaceLink(
                label="Ego", href="/objects/identity/ego", kind="identity-region", id="ego"
            ),
        ),
        source=SourceContext(
            label="Source",
            path="identity/shadow",
            description="This is a placeholder for the Shadow identity region.",
            provenance_state="No explicit shadow entry is available yet.",
        ),
        evidence=EvidenceSurface().for_object("identity", "shadow"),
        metadata={
            "layer": "shadow",
            "key": None,
            "public_kind": "Shadow",
            "icon": "◐",
            "chips": ("Patterns", "Avoidance", "Contradictions"),
            "data_readiness": "partial",
        },
    )


def _parse_identity_id(object_id: str) -> tuple[str, str] | None:
    parts = object_id.split(":", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None
    return parts[0], parts[1]


def _title_for_identity(row: Identity) -> str:
    if row.layer == "self":
        return "Soul"
    if row.layer == "ego":
        return "Expression"
    if row.layer == "shadow":
        return "Tension"
    if row.layer == "persona":
        return _humanize_key(row.key)
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
    return f"{row.layer}/{row.key}"


def _source_for_identity(row: Identity, *, kind: str) -> SourceContext:
    source_path = f"identity/{row.layer}/{row.key}"
    if kind == "persona":
        source_path = f"persona/{row.key}"
    source_description = "This comes from an explicit Mirror identity entry."
    if kind == "persona":
        source_description = "This comes from an explicit Mirror persona entry."
    return SourceContext(
        label="Source",
        path=source_path,
        description=source_description,
        provenance_state="Not inferred from memories.",
    )


def _relationships_for_identity(row: Identity, *, kind: str) -> tuple[SurfaceLink, ...]:
    if kind == "persona":
        return (SurfaceLink(label="Personas", href="/#atlas", kind="atlas-region", id="personas"),)
    if row.layer == "self":
        return (
            SurfaceLink(
                label="Ego", href="/objects/identity/ego", kind="identity-region", id="ego"
            ),
            SurfaceLink(
                label="Shadow", href="/objects/identity/shadow", kind="identity-region", id="shadow"
            ),
        )
    if row.layer == "ego":
        return (
            SurfaceLink(
                label="Self", href="/objects/identity/self:soul", kind="identity", id="self:soul"
            ),
            SurfaceLink(
                label="Shadow", href="/objects/identity/shadow", kind="identity-region", id="shadow"
            ),
        )
    if row.layer == "shadow":
        return (
            SurfaceLink(
                label="Self", href="/objects/identity/self:soul", kind="identity", id="self:soul"
            ),
            SurfaceLink(
                label="Ego", href="/objects/identity/ego", kind="identity-region", id="ego"
            ),
        )
    return ()


def _detail_description(row: Identity, *, kind: str) -> str:
    if kind == "persona":
        return "A specialized lens the Mirror can activate when this context is present."
    if row.layer == "self":
        return "Who you really are."
    if row.layer == "ego":
        return "How you operate in the world."
    if row.layer == "shadow":
        return "What asks to be integrated."
    return _preview(row.content)


def _public_kind(row: Identity, *, kind: str) -> str:
    if kind == "persona":
        return "Persona"
    if row.layer == "self":
        return "Self"
    if row.layer == "ego":
        return "Ego"
    if row.layer == "shadow":
        return "Shadow"
    return "Identity"


def _icon_for_identity(row: Identity, *, kind: str) -> str:
    if kind == "persona":
        return "✣"
    if row.layer == "self":
        return "♛"
    if row.layer == "ego":
        return "◉"
    if row.layer == "shadow":
        return "◐"
    return "◇"


def _chips_for_identity(row: Identity, *, kind: str) -> tuple[str, ...]:
    if kind == "persona":
        return ("Lenses", "Roles", "Voices")
    if row.layer == "self":
        return ("Purpose", "Principles", "Values")
    if row.layer == "ego":
        return ("Self-image", "Behavior", "Constraints")
    if row.layer == "shadow":
        return ("Patterns", "Avoidance", "Contradictions")
    return ()


def _humanize_key(key: str) -> str:
    return key.replace("-", " ").replace("_", " ").title()


def _initials(value: str) -> str:
    words = [word for word in value.replace("/", " ").replace("-", " ").split() if word]
    if not words:
        return "?"
    if len(words) == 1:
        return words[0][:2].upper()
    return "".join(word[0] for word in words[:2]).upper()


def _preview(content: str, *, limit: int = 180) -> str:
    collapsed = " ".join(content.split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[: limit - 1].rstrip()}…"
