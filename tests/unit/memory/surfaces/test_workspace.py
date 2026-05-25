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
    metrics = {metric.id: metric for metric in home.metrics}
    assert home.status == "Where you find your journeys, conversations, memories and decisions."
    assert home.selected_journey_id == "mirror-mind"
    assert home.selected_journey is not None
    assert home.selected_journey.title == "Mirror Mind"
    assert home.journeys[0].id == "mirror-mind"
    assert home.journeys[0].metadata["icon"] == "⌁"
    assert metrics["active-journeys"].value == 1
    assert "open-tasks" not in metrics
    assert metrics["recent-conversations"].value == 1
    assert metrics["conversation-messages"].value == 1
    assert metrics["recent-memories"].value == 1
    assert metrics["recent-decisions"].value == 1
    assert sections["briefing"].cards == ()
    assert sections["briefing"].metadata["content"].startswith("# Mirror Mind")
    assert "tasks" not in sections
    assert sections["memories"].cards[0].title == "Surface boundary"
    assert sections["conversations"].cards[0].title == "Web planning"
    assert sections["conversations"].cards[0].metadata["message_count"] == 1
    assert sections["decisions"].cards[0].title == "Surface boundary"
    assert sections["decisions"].cards[0].metadata["data_readiness"] == "derived"


def test_workspace_home_orders_journeys_by_recent_activity(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity(
        "journey",
        "alpha",
        "# Alpha\n**Status:** active\n\n## Description\nFirst journey.",
    )
    identity_service.set_identity(
        "journey",
        "beta",
        "# Beta\n**Status:** active\n\n## Description\nSecond journey.",
    )
    alpha_conversation = conversation_service.start_conversation(
        interface="pi", journey="alpha", title="Alpha work"
    )
    conversation_service.add_message(alpha_conversation.id, "user", "Alpha")
    beta_conversation = conversation_service.start_conversation(
        interface="pi", journey="beta", title="Beta work"
    )
    conversation_service.add_message(beta_conversation.id, "user", "Beta")
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.workspace_home()

    assert [journey.id for journey in home.journeys] == ["beta", "alpha"]
    assert home.selected_journey_id == "beta"


def test_workspace_home_can_select_requested_active_journey(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity(
        "journey",
        "alpha",
        "# Alpha\n**Status:** active\n\n## Description\nFirst journey.",
    )
    identity_service.set_identity(
        "journey",
        "beta",
        "# Beta\n**Status:** active\n\n## Description\nSecond journey.",
    )
    task_service.add_task(title="Beta task", journey="beta")
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.workspace_home(journey_id="beta")

    assert home.selected_journey_id == "beta"
    assert home.selected_journey is not None
    assert home.selected_journey.title == "Beta"
    sections = {section.id: section for section in home.sections}
    assert "tasks" not in sections


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

    assert home.selected_journey_id is None
    assert home.selected_journey is None
    assert home.journeys == ()
    assert all(section.empty_state for section in home.sections)
    assert all(metric.value == 0 for metric in home.metrics)
