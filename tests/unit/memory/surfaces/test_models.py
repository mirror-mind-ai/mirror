from memory.surfaces.models import AtlasHome, AtlasRegion, SurfaceCard


def test_surface_dtos_serialize_nested_tuples() -> None:
    home = AtlasHome(
        synthesis="Map",
        regions=(
            AtlasRegion(
                id="identity",
                title="Identity",
                description="Layers",
                cards=(
                    SurfaceCard(
                        id="ego:identity",
                        kind="identity",
                        title="ego/identity",
                        description="Voice",
                        href="/objects/identity/ego:identity",
                    ),
                ),
            ),
        ),
    )

    assert home.to_dict() == {
        "synthesis": "Map",
        "regions": [
            {
                "id": "identity",
                "title": "Identity",
                "description": "Layers",
                "cards": [
                    {
                        "id": "ego:identity",
                        "kind": "identity",
                        "title": "ego/identity",
                        "description": "Voice",
                        "href": "/objects/identity/ego:identity",
                        "count": None,
                        "status": None,
                        "accent": None,
                        "metadata": None,
                    }
                ],
                "empty_state": None,
                "metadata": None,
            }
        ],
    }
