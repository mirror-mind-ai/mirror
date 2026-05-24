from memory.surfaces import SurfaceService


def test_atlas_home_surfaces_real_identity_and_personas(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity("self", "soul", "# Alma\nPurpose and values")
    identity_service.set_identity("ego", "identity", "# Ego\nOperational voice")
    identity_service.set_identity("identity", "journey_path", "# Ariad Path\nPath snapshot")
    identity_service.set_identity("journey_path", "ariad", "# Ariad Path\nPath snapshot")
    identity_service.set_identity("journey", "mirror-mind", "# Mirror Mind\n**Status:** active")
    identity_service.set_identity("persona", "engineer", "# Engineer\nBuilds reliable systems")

    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.atlas_home()

    ego_region = next(region for region in home.regions if region.id == "ego")
    identity_region = next(region for region in home.regions if region.id == "identity")
    memories_region = next(region for region in home.regions if region.id == "memories")
    personas_region = next(region for region in home.regions if region.id == "personas")

    assert identity_region.title == "Self"
    assert identity_region.description == "Who you really are."
    assert identity_region.cards[0].title == "Alma"
    assert identity_region.cards[0].description == "Who you really are."
    assert identity_region.cards[0].metadata["icon"] == "♛"
    assert identity_region.cards[0].metadata["chips"] == ("Purpose", "Principles", "Values")
    assert all(card.kind != "journey" for card in identity_region.cards)
    assert all(card.metadata["key"] != "journey_path" for card in identity_region.cards)
    assert all(card.metadata["layer"] != "journey_path" for card in identity_region.cards)
    assert memories_region.cards[0].kind == "journey"
    assert ego_region.empty_state is None
    assert ego_region.cards[0].id == "ego"
    assert ego_region.cards[0].kind == "identity"
    assert ego_region.cards[0].title == "Ego"
    assert ego_region.cards[0].description == (
        "The Mirror's speaking voice, behavioral stance, and operating constraints."
    )
    assert ego_region.cards[0].metadata["variants"] == ({"key": "identity", "label": "Identity"},)
    assert ego_region.metadata == {"atlas_role": "ego", "data_readiness": "real"}
    assert personas_region.empty_state is None
    assert personas_region.cards[0].id == "engineer"
    assert personas_region.cards[0].kind == "persona"
    assert personas_region.cards[0].title == "Engineer"
    assert personas_region.metadata == {"atlas_role": "personas", "data_readiness": "real"}


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
        "ego",
        "personas",
        "shadow",
        "memories",
    }
    assert all(region.empty_state for region in home.regions)
    assert all(region.metadata["data_readiness"] == "empty" for region in home.regions)
