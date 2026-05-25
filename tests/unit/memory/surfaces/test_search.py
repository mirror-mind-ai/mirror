from memory.surfaces.search import SearchSurface


def test_search_surface_exposes_stable_empty_contract() -> None:
    results = SearchSurface().search("identity", perspective="atlas")

    assert results.query == "identity"
    assert results.perspective == "atlas"
    assert results.results == ()
    assert results.empty_state == "Search is not wired into the web surface yet."
