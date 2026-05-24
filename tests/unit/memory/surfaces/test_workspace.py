from memory.surfaces import SurfaceService


def test_workspace_home_surfaces_operational_sections(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
    mock_memory_embedding,
) -> None:
    identity_service.set_identity(
        "journey",
        "mirror-mind",
        "# Mirror Mind\n**Status:** active\n\n## Description\nBuild the mirror.",
    )
    task_service.add_task(title="Plan web surface", journey="mirror-mind")
    memory_service.add_memory(
        title="Surface boundary",
        content="Web consumes surfaces.",
        memory_type="decision",
        journey="mirror-mind",
    )
    conversation = conversation_service.start_conversation(
        interface="pi", journey="mirror-mind", title="Web planning"
    )
    conversation_service.add_message(conversation.id, "user", "Plan the web surface")

    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.workspace_home()

    sections = {section.id: section for section in home.sections}
    assert sections["active-journeys"].cards[0].id == "mirror-mind"
    assert sections["tasks"].cards[0].title == "Plan web surface"
    assert sections["recent-memories"].cards[0].title == "Surface boundary"
    assert sections["recent-conversations"].cards[0].title == "Web planning"
    assert (
        sections["decisions"].empty_state == "Decisions are not first-class web surface data yet."
    )


def test_workspace_home_uses_honest_empty_states(
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

    home = surfaces.workspace_home()

    assert all(section.empty_state for section in home.sections)
