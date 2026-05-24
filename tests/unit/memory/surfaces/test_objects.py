from memory.surfaces import SurfaceService


def test_object_detail_supports_identity_objects(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity("ego", "identity", "# Ego\nOperational voice")
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    detail = surfaces.object_detail("identity", "ego:identity")

    assert detail is not None
    assert detail.id == "ego:identity"
    assert detail.kind == "identity"
    assert detail.title == "Ego"
    assert detail.content == "# Ego\nOperational voice"
    assert detail.evidence is not None
    assert detail.evidence.empty_state
    assert detail.metadata["layer"] == "ego"


def test_object_detail_supports_persona_objects(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity("persona", "engineer", "# Engineer\nBuilds reliable systems")
    surfaces = SurfaceService(
        identity=identity_service,
        journeys=journey_service,
        memories=memory_service,
        conversations=conversation_service,
        tasks=task_service,
    )

    detail = surfaces.object_detail("persona", "engineer")

    assert detail is not None
    assert detail.id == "engineer"
    assert detail.kind == "persona"
    assert detail.title == "Engineer"
    assert detail.metadata["layer"] == "persona"


def test_object_detail_returns_none_for_unsupported_or_missing_objects(
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

    assert surfaces.object_detail("memory", "missing") is None
    assert surfaces.object_detail("identity", "bad-id") is None
    assert surfaces.object_detail("persona", "missing") is None
