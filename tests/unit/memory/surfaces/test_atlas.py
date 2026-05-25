from memory.surfaces import SurfaceService


def test_atlas_home_surfaces_real_identity_and_personas(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
    mock_memory_embedding,
) -> None:
    identity_service.set_identity("self", "soul", "# Alma\nPurpose and values")
    identity_service.set_identity("ego", "identity", "# Ego\nOperational voice")
    identity_service.set_identity("identity", "journey_path", "# Ariad Path\nPath snapshot")
    identity_service.set_identity("journey_path", "ariad", "# Ariad Path\nPath snapshot")
    identity_service.set_identity("journey", "mirror-mind", "# Mirror Mind\n**Status:** active")
    identity_service.set_identity("persona", "engineer", "# Engineer\nBuilds reliable systems")
    memory_service.add_memory(title="Choice", content="A decision", memory_type="decision")
    memory_service.add_memory(title="Seed", content="An idea", memory_type="ideia")

    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.atlas_home()

    ego_region = next(region for region in home.regions if region.id == "ego")
    identity_region = next(region for region in home.regions if region.id == "self")
    memories_region = next(region for region in home.regions if region.id == "memories")
    personas_region = next(region for region in home.regions if region.id == "personas")
    shadow_region = next(region for region in home.regions if region.id == "shadow")

    assert identity_region.title == "Self"
    assert identity_region.description == "Who you really are."
    assert identity_region.cards[0].title == "Soul"
    assert identity_region.cards[0].description == "Who you really are."
    assert identity_region.cards[0].metadata["icon"] == "♛"
    assert identity_region.cards[0].metadata["chips"] == ("Purpose", "Principles", "Values")
    assert all(card.kind != "journey" for card in identity_region.cards)
    assert all(card.metadata["key"] != "journey_path" for card in identity_region.cards)
    assert all(card.metadata["layer"] != "journey_path" for card in identity_region.cards)
    assert {card.title: card.count for card in memories_region.cards} == {
        "Decisions": 1,
        "Ideas": 1,
        "Journeys": 1,
    }
    assert all(card.kind == "memory-category" for card in memories_region.cards)
    assert ego_region.empty_state is None
    assert ego_region.cards[0].id == "ego"
    assert ego_region.cards[0].kind == "identity"
    assert ego_region.title == "Ego"
    assert ego_region.description == "How you operate in the world."
    assert ego_region.cards[0].title == "Expression"
    assert ego_region.cards[0].description == "How you operate in the world."
    assert ego_region.cards[0].metadata["variants"] == ({"key": "identity", "label": "Self-image"},)
    assert ego_region.metadata == {"atlas_role": "ego", "data_readiness": "real"}
    assert personas_region.empty_state is None
    assert personas_region.cards[0].id == "engineer"
    assert personas_region.cards[0].kind == "persona"
    assert personas_region.cards[0].title == "Engineer"
    assert "layer" not in personas_region.cards[0].metadata
    assert personas_region.metadata == {
        "atlas_role": "personas",
        "data_readiness": "real",
        "icon": "✣",
        "motif": "Action",
        "chips": ("Lenses", "Roles", "Voices"),
    }
    assert shadow_region.title == "Shadow"
    assert shadow_region.cards[0].title == "Tension"
    assert shadow_region.cards[0].description == "What asks to be integrated."
    assert shadow_region.cards[0].metadata["chips"] == (
        "Patterns",
        "Avoidance",
        "Contradictions",
    )


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
        "self",
        "ego",
        "personas",
        "shadow",
        "memories",
    }
    assert all(region.empty_state for region in home.regions if region.id != "shadow")
    assert all(
        region.metadata["data_readiness"] == "empty"
        for region in home.regions
        if region.id != "shadow"
    )
    shadow_region = next(region for region in home.regions if region.id == "shadow")
    assert shadow_region.metadata["data_readiness"] == "partial"
