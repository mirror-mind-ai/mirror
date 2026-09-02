from memory.surfaces import SurfaceService


def test_workspace_home_surfaces_operational_sections(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
    attachment_service,
    mock_memory_embedding,
    mocker,
) -> None:
    identity_service.set_identity(
        "journey",
        "mirror-mind",
        "# Mirror Mind\n**Status:** active\n\n## Description\nBuild the mirror.",
        metadata='{"project_path": "/code/mirror", "sync_file": "/code/path.md", "icon": "◇", "color": "amber"}',
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
    mocker.patch(
        "memory.services.attachment.generate_embedding", return_value=mock_memory_embedding
    )
    attachment_service.add_attachment(
        journey_id="mirror-mind",
        name="Launch brief",
        description="Reference brief for launch work.",
        content="# Launch\nDetailed launch notes.",
        content_type="markdown",
        tags=["launch", "reference"],
    )

    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
        attachments=attachment_service,
    )

    home = surfaces.workspace_home(journey_id="mirror-mind")

    sections = {section.id: section for section in home.sections}
    metrics = {metric.id: metric for metric in home.metrics}
    assert home.status == "Where you find your journeys, conversations, memories and decisions."
    assert home.selected_journey_id == "mirror-mind"
    assert home.selected_journey is not None
    assert home.selected_journey.title == "Mirror Mind"
    assert home.journeys[0].id == "mirror-mind"
    assert home.journeys[0].metadata["icon"] == "◇"
    assert home.journeys[0].metadata["parent_journey"] == ""
    assert metrics["active-journeys"].value == 1
    assert "open-tasks" not in metrics
    assert metrics["recent-conversations"].value == 1
    assert metrics["conversation-messages"].value == 1
    assert metrics["journey-attachments"].value == 1
    assert metrics["recent-memories"].value == 1
    assert metrics["recent-decisions"].value == 1
    assert sections["briefing"].cards == ()
    assert sections["briefing"].metadata["content"].startswith("# Mirror Mind")
    assert "tasks" not in sections
    assert sections["settings"].metadata["settings"][0]["value"] == "mirror-mind"
    assert sections["settings"].metadata["settings"][1]["value"] == "Mirror Mind"
    assert sections["settings"].metadata["settings"][2]["value"] == "active"
    assert sections["settings"].metadata["settings"][3]["value"] == "/code/mirror"
    assert sections["settings"].metadata["settings"][4]["value"] == "/code/path.md"
    assert sections["settings"].metadata["settings"][5]["value"] == "◇"
    assert sections["settings"].metadata["settings"][6]["value"] == "amber"
    assert sections["settings"].metadata["settings"][7]["value"] == "Not configured"
    assert sections["settings"].metadata["journeyOptions"][0]["id"] == "mirror-mind"
    assert sections["attachments"].cards[0].title == "Launch brief"
    assert sections["attachments"].cards[0].description == "Reference brief for launch work."
    assert sections["attachments"].cards[0].metadata["content_type"] == "markdown"
    assert sections["attachments"].cards[0].metadata["tags"] == '["launch", "reference"]'
    assert sections["memories"].cards[0].title == "Surface boundary"
    assert sections["conversations"].cards[0].title == "Web planning"
    assert sections["conversations"].cards[0].href == f"/objects/conversation/{conversation.id}"
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
    assert home.selected_journey_id is None
    assert home.scene["mode"] == "global"


def test_workspace_home_shows_more_than_eight_conversations_for_selected_journey(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity(
        "journey",
        "mirror-mind",
        "# Mirror Mind\n**Status:** active\n\n## Description\nBuild the mirror.",
    )
    for index in range(12):
        conversation = conversation_service.start_conversation(
            interface="pi", journey="mirror-mind", title=f"Conversation {index:02d}"
        )
        conversation_service.add_message(conversation.id, "user", f"Message {index}")
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.workspace_home(journey_id="mirror-mind")

    sections = {section.id: section for section in home.sections}
    assert len(sections["conversations"].cards) == 12


def test_workspace_home_includes_completed_journeys_for_optional_access(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity(
        "journey",
        "active",
        "# Active\n**Status:** active\n\n## Description\nActive journey.",
    )
    identity_service.set_identity(
        "journey",
        "completed",
        "# Completed\n**Status:** completed\n\n## Description\nCompleted journey.",
    )
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.workspace_home(journey_id="completed")

    metrics = {metric.id: metric for metric in home.metrics}
    assert {journey.id for journey in home.journeys} == {"active", "completed"}
    assert metrics["active-journeys"].value == 1
    assert home.selected_journey_id == "completed"
    assert home.selected_journey.status == "completed"


def test_workspace_home_exposes_parent_journey_metadata_for_sidebar_grouping(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity(
        "journey",
        "parent",
        "# Parent\n**Status:** active\n\n## Description\nParent journey.",
    )
    identity_service.set_identity(
        "journey",
        "child",
        "# Child\n**Status:** active\n\n## Description\nChild journey.",
        metadata='{"parent_journey": "parent"}',
    )
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.workspace_home(journey_id="parent")

    child = next(journey for journey in home.journeys if journey.id == "child")
    assert child.metadata["parent_journey"] == "parent"


def test_workspace_scene_renders_recursive_tree_and_full_lineage(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity(
        "journey", "root", "# Root\n**Status:** active\n\n## Description\nRoot."
    )
    identity_service.set_identity(
        "journey",
        "area",
        "# Area\n**Status:** active\n\n## Description\nArea.",
        metadata='{"parent_journey": "root"}',
    )
    identity_service.set_identity(
        "journey",
        "business",
        "# Business\n**Status:** active\n\n## Description\nBusiness.",
        metadata='{"parent_journey": "area"}',
    )
    identity_service.set_identity(
        "journey",
        "product",
        "# Product\n**Status:** active\n\n## Description\nProduct.",
        metadata='{"parent_journey": "business"}',
    )
    identity_service.set_identity(
        "journey",
        "sibling",
        "# Sibling\n**Status:** active\n\n## Description\nSibling.",
        metadata='{"parent_journey": "business"}',
    )
    identity_service.set_identity(
        "journey",
        "uncle",
        "# Uncle\n**Status:** active\n\n## Description\nUncle.",
        metadata='{"parent_journey": "area"}',
    )
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    home = surfaces.workspace_home(journey_id="product")

    root = next(item for item in home.scene["journeyMap"] if item["id"] == "root")
    assert root["children"][0]["id"] == "area"
    business = next(item for item in root["children"][0]["children"] if item["id"] == "business")
    assert {item["id"] for item in business["children"]} == {"product", "sibling"}
    assert [item["id"] for item in home.scene["locationPath"]] == [
        "root",
        "area",
        "business",
        "product",
    ]
    assert [item["id"] for item in home.scene["nearbyJourneys"]] == ["sibling"]


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
