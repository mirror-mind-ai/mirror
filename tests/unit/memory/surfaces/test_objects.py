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
    assert detail.title == "Expression"
    assert detail.content == "# Ego\nOperational voice"
    assert detail.source is not None
    assert detail.source.label == "Source"
    assert detail.source.path == "identity/ego/identity"
    assert detail.source.provenance_state == "Not inferred from memories."
    assert detail.evidence is not None
    assert detail.evidence.empty_state
    assert detail.metadata["layer"] == "ego"
    assert detail.metadata["public_kind"] == "Ego"
    assert detail.metadata["chips"] == ("Self-image", "Behavior", "Constraints")


def test_object_detail_supports_persona_objects(
    identity_service,
    journey_service,
    memory_service,
    conversation_service,
    task_service,
) -> None:
    identity_service.set_identity("persona", "engineer", "# IDENTIDADE\nBuilds reliable systems")
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
    assert detail.source is not None
    assert detail.source.path == "persona/engineer"
    assert detail.source.description == "This comes from an explicit Mirror persona entry."
    assert detail.relationships[0].label == "Personas"
    assert detail.metadata["layer"] == "persona"
    assert detail.metadata["public_kind"] == "Persona"
    assert detail.metadata["icon"] == "✣"
    assert detail.metadata["chips"] == ("Lenses", "Roles", "Voices")


def test_object_detail_supports_shadow_placeholder_when_no_shadow_entry_exists(
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

    detail = surfaces.object_detail("identity", "shadow")

    assert detail is not None
    assert detail.id == "shadow"
    assert detail.title == "Tension"
    assert detail.source is not None
    assert detail.source.path == "identity/shadow"
    assert detail.source.provenance_state == "No explicit shadow entry is available yet."
    assert detail.metadata["public_kind"] == "Shadow"
    assert detail.metadata["data_readiness"] == "partial"


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
