"""Web surface read models for Mirror Core."""

from __future__ import annotations

from memory.services.conversation import ConversationService
from memory.services.identity import IdentityService
from memory.services.journey import JourneyService
from memory.services.memory import MemoryService
from memory.services.tasks import TaskService
from memory.surfaces.atlas import AtlasSurface
from memory.surfaces.evidence import EvidenceSurface
from memory.surfaces.models import (
    AtlasHome,
    AtlasRegion,
    EvidenceBundle,
    EvidenceItem,
    ObjectDetail,
    SearchResultItem,
    SearchResults,
    SourceContext,
    SurfaceCard,
    SurfaceLink,
    WorkspaceHome,
    WorkspaceMetric,
    WorkspaceSection,
)
from memory.surfaces.objects import ObjectDetailSurface
from memory.surfaces.search import SearchSurface
from memory.surfaces.workspace import WorkspaceSurface


class SurfaceService:
    """Facade for UI-shaped Mirror read models."""

    def __init__(
        self,
        *,
        identity: IdentityService,
        journeys: JourneyService,
        memories: MemoryService,
        conversations: ConversationService,
        tasks: TaskService,
    ) -> None:
        self.evidence = EvidenceSurface()
        self.atlas = AtlasSurface(
            identity=identity,
            journeys=journeys,
            memories=memories,
            conversations=conversations,
        )
        self.workspace = WorkspaceSurface(
            journeys=journeys,
            conversations=conversations,
            memories=memories,
            tasks=tasks,
        )
        self.objects = ObjectDetailSurface(identity=identity, evidence=self.evidence)
        self.search_surface = SearchSurface()

    def atlas_home(self) -> AtlasHome:
        return self.atlas.home()

    def workspace_home(self, journey_id: str | None = None) -> WorkspaceHome:
        return self.workspace.home(journey_id=journey_id)

    def object_detail(self, kind: str, object_id: str) -> ObjectDetail | None:
        return self.objects.detail(kind, object_id)

    def evidence_for(self, kind: str, object_id: str) -> EvidenceBundle:
        return self.evidence.for_object(kind, object_id)

    def search(self, query: str, perspective: str | None = None) -> SearchResults:
        return self.search_surface.search(query, perspective)


__all__ = [
    "AtlasHome",
    "AtlasRegion",
    "EvidenceBundle",
    "EvidenceItem",
    "ObjectDetail",
    "SearchResultItem",
    "SearchResults",
    "SourceContext",
    "SurfaceCard",
    "SurfaceLink",
    "SurfaceService",
    "WorkspaceHome",
    "WorkspaceMetric",
    "WorkspaceSection",
]
