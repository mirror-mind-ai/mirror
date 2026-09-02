"""Focused tests for runtime session storage behavior."""

from memory.models import Conversation


def test_get_runtime_session_converts_integer_flags_to_booleans(store):
    conv = store.create_conversation(Conversation(interface="pi"))

    session = store.upsert_runtime_session(
        "sess-1",
        conversation_id=conv.id,
        interface="pi",
        mirror_active=True,
        hook_injected=True,
        active=False,
    )
    fetched = store.get_runtime_session(session.session_id)

    assert fetched is not None
    assert fetched.mirror_active is True
    assert fetched.hook_injected is True
    assert fetched.active is False


def test_get_latest_runtime_defaults_resolves_persona_and_journey_independently(store):
    store.upsert_runtime_session("sess-a", persona="writer")
    store.upsert_runtime_session("sess-b", journey="course-launch")

    persona, journey = store.get_latest_runtime_defaults()

    assert persona == "writer"
    assert journey == "course-launch"


def test_get_latest_runtime_defaults_excludes_current_session(store):
    store.upsert_runtime_session("sess-a", persona="therapist", journey="deep-work")
    store.upsert_runtime_session("sess-b", persona="engineer", journey="mirror")

    persona, journey = store.get_latest_runtime_defaults(exclude_session_id="sess-b")

    assert persona == "therapist"
    assert journey == "deep-work"


def test_get_active_runtime_session_ids_returns_newest_first_for_interface(store):
    store.upsert_runtime_session(
        "sess-old",
        interface="pi",
        active=True,
    )
    store.upsert_runtime_session(
        "sess-new",
        interface="pi",
        active=True,
    )
    store.upsert_runtime_session(
        "sess-claude",
        interface="claude_code",
        active=True,
    )
    store.upsert_runtime_session(
        "sess-closed",
        interface="pi",
        active=False,
    )

    session_ids = store.get_active_runtime_session_ids("pi")

    assert session_ids == ["sess-new", "sess-old"]


def test_compare_and_swap_runtime_metadata_is_single_winner(store):
    store.upsert_runtime_session("builder-cursor", metadata='{"status":"pending"}')

    first = store.compare_and_swap_runtime_session_metadata(
        "builder-cursor",
        expected_metadata='{"status":"pending"}',
        metadata='{"status":"consumed"}',
    )
    second = store.compare_and_swap_runtime_session_metadata(
        "builder-cursor",
        expected_metadata='{"status":"pending"}',
        metadata='{"status":"consumed-again"}',
    )

    assert first is True
    assert second is False
    assert store.get_runtime_session("builder-cursor").metadata == '{"status":"consumed"}'


def test_get_active_runtime_conversation_ids_returns_only_active_bound_conversations(store):
    conv_a = store.create_conversation(Conversation(interface="pi"))
    conv_b = store.create_conversation(Conversation(interface="pi"))
    store.upsert_runtime_session("sess-a", conversation_id=conv_a.id, active=True)
    store.upsert_runtime_session("sess-b", conversation_id=conv_b.id, active=False)
    store.upsert_runtime_session("sess-c", active=True)

    assert store.get_active_runtime_conversation_ids() == {conv_a.id}
