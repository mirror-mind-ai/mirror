"""Search read models for Mirror web surfaces."""

from __future__ import annotations

from memory.surfaces.models import SearchResults


class SearchSurface:
    """Shared search surface contract.

    Full search is outside the first Atlas vertical slice unless existing
    retrieval falls out cheaply. S1 establishes a stable read model and honest
    empty state.
    """

    def search(self, query: str, perspective: str | None = None) -> SearchResults:
        return SearchResults(
            query=query,
            perspective=perspective,
            empty_state="Search is not wired into the web surface yet.",
        )
