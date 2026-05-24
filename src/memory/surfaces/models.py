"""Typed read models for Mirror web surfaces."""

from __future__ import annotations

from dataclasses import asdict, dataclass, is_dataclass
from typing import Any


def to_surface_dict(value: Any) -> Any:
    """Recursively convert surface DTOs into JSON-serializable structures."""
    if is_dataclass(value):
        return {key: to_surface_dict(item) for key, item in asdict(value).items()}
    if isinstance(value, tuple | list):
        return [to_surface_dict(item) for item in value]
    if isinstance(value, dict):
        return {key: to_surface_dict(item) for key, item in value.items()}
    return value


@dataclass(frozen=True)
class SurfaceLink:
    label: str
    href: str
    kind: str | None = None
    id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class SurfaceCard:
    id: str
    kind: str
    title: str
    description: str
    href: str
    count: int | None = None
    status: str | None = None
    accent: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class AtlasRegion:
    id: str
    title: str
    description: str
    cards: tuple[SurfaceCard, ...] = ()
    empty_state: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class AtlasHome:
    synthesis: str | None
    regions: tuple[AtlasRegion, ...]

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class WorkspaceSection:
    id: str
    title: str
    description: str | None
    cards: tuple[SurfaceCard, ...] = ()
    empty_state: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class WorkspaceHome:
    status: str | None
    sections: tuple[WorkspaceSection, ...]

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class EvidenceItem:
    id: str
    kind: str
    title: str
    description: str
    href: str | None = None
    timestamp: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class EvidenceBundle:
    subject_kind: str
    subject_id: str
    items: tuple[EvidenceItem, ...] = ()
    empty_state: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class ObjectDetail:
    id: str
    kind: str
    title: str
    description: str
    content: str | None = None
    relationships: tuple[SurfaceLink, ...] = ()
    evidence: EvidenceBundle | None = None
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class SearchResultItem:
    id: str
    kind: str
    title: str
    description: str
    href: str
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)


@dataclass(frozen=True)
class SearchResults:
    query: str
    perspective: str | None = None
    results: tuple[SearchResultItem, ...] = ()
    empty_state: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return to_surface_dict(self)
