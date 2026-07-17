"""Unit tests for memory.skills.mirror."""

from unittest.mock import MagicMock, call, patch


def test_load_returns_context_and_journey():
    mock_mem = MagicMock()
    mock_mem.detect_journey.return_value = []
    mock_mem.load_mirror_context.return_value = "identity context"
    mock_mem.store.get_runtime_session.return_value = None
    mock_mem.store.get_global_sticky_defaults.return_value = (None, None)

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state") as mock_write,
        patch("memory.skills.mirror.bind_conversation_context") as mock_bind,
    ):
        from memory.skills import mirror

        context, resolved_persona, resolved_journey, detected = mirror.load(
            journey="mirror-poc", session_id="sess-1"
        )

    assert context == "identity context"
    assert resolved_persona is None
    assert resolved_journey == "mirror-poc"
    assert detected is None
    mock_mem.load_mirror_context.assert_called_once_with(
        persona=None,
        journey="mirror-poc",
        org=False,
        query=None,
        touches_identity=True,
        touches_shadow=False,
    )
    mock_write.assert_called_once_with(
        active=True,
        persona=None,
        journey="mirror-poc",
        session_id="sess-1",
    )
    mock_bind.assert_called_once_with(session_id="sess-1", persona=None, journey="mirror-poc")


def test_load_detects_persona_and_journey_from_query():
    mock_mem = MagicMock()
    mock_mem.detect_persona.return_value = [("engineer", 2.0, "keyword")]
    mock_mem.detect_journey.return_value = [("mirror-poc", 0.85, "semantic")]
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_global_sticky_defaults.return_value = (None, None)

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state"),
        patch("memory.skills.mirror.bind_conversation_context"),
    ):
        from memory.skills import mirror

        _context, resolved_persona, resolved_journey, detected = mirror.load(
            query="debug the pi runtime adoption"
        )

    assert resolved_persona == "engineer"
    assert resolved_journey == "mirror-poc"
    assert detected == [("mirror-poc", 0.85, "semantic")]
    mock_mem.detect_persona.assert_called_once_with("debug the pi runtime adoption")
    mock_mem.detect_journey.assert_called_once_with("debug the pi runtime adoption")


def test_load_skips_binding_when_context_only():
    mock_mem = MagicMock()
    mock_mem.detect_journey.return_value = []
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_runtime_session.return_value = None
    mock_mem.store.get_global_sticky_defaults.return_value = (None, None)

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state"),
        patch("memory.skills.mirror.bind_conversation_context") as mock_bind,
    ):
        from memory.skills import mirror

        mirror.load(journey="mirror-poc", context_only=True, session_id="sess-1")

    mock_bind.assert_not_called()


def test_load_uses_current_session_sticky_defaults_before_global_or_detection():
    mock_mem = MagicMock()
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_runtime_session.return_value = MagicMock(
        persona="therapist", journey="deep-work"
    )

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state") as mock_write,
        patch("memory.skills.mirror.bind_conversation_context") as mock_bind,
    ):
        from memory.skills import mirror

        _context, resolved_persona, resolved_journey, detected = mirror.load(
            query="help me think this through", session_id="sess-1"
        )

    assert resolved_persona == "therapist"
    assert resolved_journey == "deep-work"
    assert detected is None
    mock_mem.store.get_global_sticky_defaults.assert_not_called()
    mock_mem.detect_persona.assert_not_called()
    mock_mem.detect_journey.assert_not_called()
    mock_write.assert_called_once_with(
        active=True,
        persona="therapist",
        journey="deep-work",
        session_id="sess-1",
    )
    mock_bind.assert_called_once_with(session_id="sess-1", persona="therapist", journey="deep-work")


def test_load_uses_global_sticky_defaults_when_session_has_no_context():
    mock_mem = MagicMock()
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_runtime_session.return_value = None
    mock_mem.store.get_global_sticky_defaults.return_value = ("writer", "course-launch")

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state") as mock_write,
        patch("memory.skills.mirror.bind_conversation_context") as mock_bind,
    ):
        from memory.skills import mirror

        _context, resolved_persona, resolved_journey, detected = mirror.load(
            query="what should I focus on next", session_id="sess-2"
        )

    assert resolved_persona == "writer"
    assert resolved_journey == "course-launch"
    assert detected is None
    mock_mem.store.get_global_sticky_defaults.assert_called_once_with()
    mock_mem.store.upsert_runtime_session.assert_has_calls(
        [
            call(
                "__global_sticky_defaults__",
                interface="global_defaults",
                mirror_active=False,
                persona="writer",
                journey="course-launch",
                hook_injected=True,
                active=False,
            ),
            call(
                "__global_operating_mode__",
                metadata='{"active_mode": "Mirror Mode", "active_journey": "course-launch"}',
                active=True,
            ),
        ]
    )
    mock_mem.detect_persona.assert_not_called()
    mock_mem.detect_journey.assert_not_called()
    mock_write.assert_called_once_with(
        active=True,
        persona="writer",
        journey="course-launch",
        session_id="sess-2",
    )
    mock_bind.assert_called_once_with(
        session_id="sess-2", persona="writer", journey="course-launch"
    )


def test_load_persists_global_sticky_defaults_without_session_id():
    mock_mem = MagicMock()
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_global_sticky_defaults.return_value = (None, None)
    mock_mem.detect_persona.return_value = []
    mock_mem.detect_journey.return_value = []

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state") as mock_write,
        patch("memory.skills.mirror.bind_conversation_context") as mock_bind,
    ):
        from memory.skills import mirror

        _context, resolved_persona, resolved_journey, detected = mirror.load(
            persona="engineer",
            journey="mirror-poc",
            query="debug this",
        )

    assert resolved_persona == "engineer"
    assert resolved_journey == "mirror-poc"
    assert detected is None
    mock_mem.store.upsert_runtime_session.assert_has_calls(
        [
            call(
                "__global_sticky_defaults__",
                interface="global_defaults",
                mirror_active=False,
                persona="engineer",
                journey="mirror-poc",
                hook_injected=True,
                active=False,
            ),
            call(
                "__global_operating_mode__",
                metadata='{"active_mode": "Mirror Mode", "active_journey": "mirror-poc"}',
                active=True,
            ),
        ]
    )
    mock_write.assert_called_once_with(
        active=True,
        persona="engineer",
        journey="mirror-poc",
        session_id=None,
    )
    mock_bind.assert_called_once_with(session_id=None, persona="engineer", journey="mirror-poc")


def test_load_prefers_explicit_args_over_sticky_defaults():
    mock_mem = MagicMock()
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_runtime_session.return_value = MagicMock(
        persona="therapist", journey="deep-work"
    )

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state") as mock_write,
        patch("memory.skills.mirror.bind_conversation_context") as mock_bind,
    ):
        from memory.skills import mirror

        _context, resolved_persona, resolved_journey, detected = mirror.load(
            persona="engineer",
            journey="mirror-poc",
            query="debug this",
            session_id="sess-1",
        )

    assert resolved_persona == "engineer"
    assert resolved_journey == "mirror-poc"
    assert detected is None
    mock_mem.store.get_global_sticky_defaults.assert_not_called()
    mock_mem.detect_persona.assert_not_called()
    mock_mem.detect_journey.assert_not_called()
    mock_write.assert_called_once_with(
        active=True,
        persona="engineer",
        journey="mirror-poc",
        session_id="sess-1",
    )
    mock_bind.assert_called_once_with(session_id="sess-1", persona="engineer", journey="mirror-poc")


def test_deactivate_writes_inactive_state():
    with patch("memory.skills.mirror.write_state") as mock_write:
        from memory.skills import mirror

        mirror.deactivate(session_id="sess-1")

    mock_write.assert_called_once_with(active=False, session_id="sess-1")


def test_cli_deactivate_with_session_id_calls_deactivate():
    with patch("memory.skills.mirror.deactivate") as mock_deact:
        from memory.skills import mirror

        mirror.main(["deactivate", "--session-id", "sess-xyz"])

    mock_deact.assert_called_once_with(session_id="sess-xyz")


def test_cli_deactivate_without_session_id_warns_and_skips(capsys):
    with patch("memory.skills.mirror.deactivate") as mock_deact:
        from memory.skills import mirror

        mirror.main(["deactivate"])

    mock_deact.assert_not_called()
    err = capsys.readouterr().err
    assert "session-id" in err.lower()


def test_log_records_to_specific_session():
    with (
        patch("memory.skills.mirror.is_muted", return_value=False),
        patch("memory.skills.mirror.log_assistant_to_current") as mock_log,
        patch("memory.skills.mirror.update_current_conversation") as mock_update,
    ):
        from memory.skills import mirror

        mirror.log("I have decided to adopt Pi as a secondary interface.", session_id="sess-1")

    mock_log.assert_called_once_with(
        "I have decided to adopt Pi as a secondary interface.", session_id="sess-1"
    )
    mock_update.assert_called_once()


def test_log_is_noop_when_muted():
    with (
        patch("memory.skills.mirror.is_muted", return_value=True),
        patch("memory.skills.mirror.log_assistant_to_current") as mock_log,
    ):
        from memory.skills import mirror

        mirror.log("This should not be recorded.", session_id="sess-1")

    mock_log.assert_not_called()


def test_title_from_summary_short():
    from memory.skills.mirror import title_from_summary

    result = title_from_summary("Clear and concise. More detail here.")
    assert result == "Clear and concise"


def test_reception_overrides_sticky_persona_when_enabled(mocker):
    """S3: reception runs before sticky is applied and can override it."""
    from memory.models import ReceptionResult

    mocker.patch("memory.skills.mirror.RECEPTION_ENABLED", True)
    # reception is imported locally inside _resolve_defaults — patch at source.
    mocker.patch(
        "memory.intelligence.reception.reception",
        return_value=ReceptionResult(
            personas=["engineer"],
            journey=None,
            touches_identity=False,
            touches_shadow=False,
        ),
    )

    mock_mem = MagicMock()
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_runtime_session.return_value = MagicMock(
        persona="therapist", journey="deep-work"
    )
    mock_mem.store.get_identity_by_layer.return_value = []

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state"),
        patch("memory.skills.mirror.bind_conversation_context"),
    ):
        from memory.skills import mirror

        _ctx, resolved_persona, resolved_journey, _detected = mirror.load(
            query="can you help me fix this Python bug",
            session_id="sess-x",  # needed so runtime_session is fetched
        )

    # Reception said "engineer"; sticky said "therapist" — reception wins.
    assert resolved_persona == "engineer"
    # Journey was not overridden by reception (returned None) — sticky applies.
    assert resolved_journey == "deep-work"


def test_sticky_applies_when_reception_returns_empty(mocker):
    """S3: when reception returns no persona, sticky default is the fallback."""
    from memory.models import ReceptionResult

    mocker.patch("memory.skills.mirror.RECEPTION_ENABLED", True)
    mocker.patch(
        "memory.intelligence.reception.reception",
        return_value=ReceptionResult.empty(),
    )

    mock_mem = MagicMock()
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_runtime_session.return_value = MagicMock(persona="writer", journey="mirror")
    mock_mem.store.get_identity_by_layer.return_value = []

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state"),
        patch("memory.skills.mirror.bind_conversation_context"),
    ):
        from memory.skills import mirror

        _ctx, resolved_persona, resolved_journey, _detected = mirror.load(
            query="what is the meaning of life",
            session_id="sess-x",  # needed so runtime_session is fetched
        )

    # Reception returned empty — sticky fallback applies.
    assert resolved_persona == "writer"
    assert resolved_journey == "mirror"


def test_explicit_arg_not_overridden_by_reception(mocker):
    """S3: explicit persona arg is never overridden by reception."""
    from memory.models import ReceptionResult

    mocker.patch("memory.skills.mirror.RECEPTION_ENABLED", True)
    mocker.patch(
        "memory.intelligence.reception.reception",
        return_value=ReceptionResult(
            personas=["engineer"],
            journey=None,
            touches_identity=False,
            touches_shadow=False,
        ),
    )

    mock_mem = MagicMock()
    mock_mem.load_mirror_context.return_value = "context"
    mock_mem.store.get_runtime_session.return_value = None
    mock_mem.store.get_global_sticky_defaults.return_value = (None, None)
    mock_mem.store.get_identity_by_layer.return_value = []

    with (
        patch("memory.skills.mirror.MemoryClient", return_value=mock_mem),
        patch("memory.skills.mirror.write_state"),
        patch("memory.skills.mirror.bind_conversation_context"),
    ):
        from memory.skills import mirror

        _ctx, resolved_persona, _rj, _detected = mirror.load(
            persona="therapist",  # explicit — must not be overridden
            query="can you help me fix this Python bug",
        )

    # Explicit arg "therapist" wins over reception's "engineer".
    assert resolved_persona == "therapist"


def test_title_from_summary_long():
    from memory.skills.mirror import title_from_summary

    long = (
        "This is a very long first sentence that exceeds the sixty character limit by quite a lot"
    )
    result = title_from_summary(long)
    assert len(result) <= 63  # 60 + "..."
    assert result.endswith("...")
