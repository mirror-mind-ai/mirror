"""Object detail read models for Mirror web surfaces."""

from __future__ import annotations

from memory.models import Identity
from memory.services.identity import IdentityService
from memory.surfaces.evidence import EvidenceSurface
from memory.surfaces.models import ObjectDetail


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
            description=_preview(row.content),
            content=row.content,
            evidence=self.evidence.for_object(kind, object_id),
            metadata={
                "layer": row.layer,
                "key": row.key,
                "version": row.version,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            },
        )


def identity_object_id(layer: str, key: str) -> str:
    return f"{layer}:{key}"


def _parse_identity_id(object_id: str) -> tuple[str, str] | None:
    parts = object_id.split(":", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None
    return parts[0], parts[1]


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
    return f"{row.layer}/{row.key}"


def _preview(content: str, *, limit: int = 180) -> str:
    collapsed = " ".join(content.split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[: limit - 1].rstrip()}…"
