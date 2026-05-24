from memory.surfaces import SurfaceService


def test_atlas_home_surfaces_real_identity_and_personas(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity("ego", "identity", "# Ego\nOperational voice")
    identity_service.set_identity("persona", "engineer", "# Engineer\nBuilds reliable systems")

    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.atlas_home()

    identity_region = next(region for region in home.regions if region.id == "identity")
    personas_region = next(region for region in home.regions if region.id == "personas")

    assert identity_region.empty_state is None
    assert identity_region.cards[0].id == "ego:identity"
    assert identity_region.cards[0].kind == "identity"
    assert personas_region.empty_state is None
    assert personas_region.cards[0].id == "engineer"
    assert personas_region.cards[0].kind == "persona"


def test_atlas_home_represents_empty_regions(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.atlas_home()

    assert {region.id for region in home.regions} == {
        "identity",
        "personas",
        "shadow",
        "memories",
        "journeys",
        "conversations",
    }
    assert all(region.empty_state for region in home.regions)
