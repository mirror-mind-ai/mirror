"""Storage integration tests for atomic explicit conversation append."""

from __future__ import annotations

import pytest

from memory.services.conversation_append import AppendRejected, ConversationAppendService


def _conversation(store, conversation_id="conversation-1", journey="journey-1", ended=False):
    store.conn.execute(
        """INSERT INTO conversations
           (id, started_at, ended_at, interface, journey, metadata)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            conversation_id,
            "2026-08-29T00:00:00Z",
            "2026-08-29T01:00:00Z" if ended else None,
            "test",
            journey,
            '{"extracted":true}',
        ),
    )
    store.conn.commit()


def _payload(*messages, conversation="conversation-1", journey="journey-1"):
    return {
        "schemaVersion": "1.0.0",
        "conversationId": conversation,
        "journeyId": journey,
        "sourceInterface": "external-shell",
        "messages": list(messages)
        or [
            {
                "id": "message-1",
                "role": "user",
                "content": "hello",
                "createdAt": "2026-08-29T12:00:00Z",
                "metadata": {},
            }
        ],
    }


def _message(message_id, content="hello", role="user", created_at="2026-08-29T12:00:00Z"):
    return {
        "id": message_id,
        "role": role,
        "content": content,
        "createdAt": created_at,
        "metadata": {},
    }


def test_append_and_full_retry_are_atomic_and_idempotent(store):
    _conversation(store)
    service = ConversationAppendService(store)
    payload = _payload(_message("message-1"), _message("message-2", role="assistant"))

    first = service.append(payload)
    retry = service.append(payload)

    assert (first["insertedCount"], first["existingCount"]) == (2, 0)
    assert (retry["insertedCount"], retry["existingCount"]) == (0, 2)
    assert [item["state"] for item in retry["messages"]] == ["existing", "existing"]
    assert store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 2


def test_partial_retry_inserts_only_missing_message(store):
    _conversation(store)
    service = ConversationAppendService(store)
    service.append(_payload(_message("message-1")))

    receipt = service.append(_payload(_message("message-1"), _message("message-2")))

    assert receipt["insertedCount"] == 1
    assert receipt["existingCount"] == 1
    assert [item["state"] for item in receipt["messages"]] == ["existing", "inserted"]


@pytest.mark.parametrize("ended", [False, True])
def test_open_and_ended_conversations_accept_without_lifecycle_changes(store, ended):
    _conversation(store, ended=ended)
    before = dict(store.conn.execute("SELECT * FROM conversations").fetchone())

    ConversationAppendService(store).append(_payload())

    after = dict(store.conn.execute("SELECT * FROM conversations").fetchone())
    assert after == before


def test_missing_conversation_and_journey_mismatch_write_nothing(store):
    service = ConversationAppendService(store)
    with pytest.raises(AppendRejected) as missing:
        service.append(_payload())
    assert missing.value.reason == "conversation_not_found"

    _conversation(store)
    with pytest.raises(AppendRejected) as mismatch:
        service.append(_payload(journey="other"))
    assert mismatch.value.reason == "journey_mismatch"
    assert store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0


def test_equivalent_timestamp_offset_is_idempotent(store):
    _conversation(store)
    service = ConversationAppendService(store)
    service.append(_payload(_message("message-1", created_at="2026-08-29T09:00:00-03:00")))

    receipt = service.append(_payload(_message("message-1", created_at="2026-08-29T12:00:00Z")))

    assert receipt["messages"] == [{"id": "message-1", "state": "existing"}]


def test_cross_conversation_or_divergent_id_reuse_rejects_complete_batch(store):
    _conversation(store)
    _conversation(store, "conversation-2")
    service = ConversationAppendService(store)
    service.append(_payload(_message("message-1")))

    with pytest.raises(AppendRejected) as cross:
        service.append(_payload(_message("message-1"), conversation="conversation-2"))
    assert cross.value.reason == "idempotency_conflict"

    divergent_payloads = [
        _payload(_message("message-1", content="different"), _message("message-2")),
        _payload(_message("message-1", role="assistant"), _message("message-2")),
        _payload(_message("message-1", created_at="2026-08-29T12:00:01Z"), _message("message-2")),
        _payload(_message("message-1"), _message("message-2")),
    ]
    divergent_payloads[-1]["messages"][0]["metadata"] = {"different": True}
    source_divergence = _payload(_message("message-1"), _message("message-2"))
    source_divergence["sourceInterface"] = "another-shell"
    divergent_payloads.append(source_divergence)
    for payload in divergent_payloads:
        with pytest.raises(AppendRejected) as divergent:
            service.append(payload)
        assert divergent.value.reason == "idempotency_conflict"
    assert store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 1


def test_injected_second_insert_failure_rolls_back_batch(store):
    _conversation(store)
    store.conn.execute(
        """CREATE TRIGGER fail_second_append BEFORE INSERT ON messages
           WHEN NEW.id = 'message-2' BEGIN SELECT RAISE(ABORT, 'injected'); END"""
    )
    store.conn.commit()

    with pytest.raises(AppendRejected) as exc:
        ConversationAppendService(store).append(
            _payload(_message("message-1"), _message("message-2"))
        )

    assert exc.value.reason == "persistence_failure"
    assert store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0


def test_append_does_not_access_runtime_sessions(store):
    _conversation(store)
    statements = []
    store.conn.set_trace_callback(statements.append)
    ConversationAppendService(store).append(_payload())
    store.conn.set_trace_callback(None)
    assert not any("runtime_sessions" in statement.lower() for statement in statements)


def test_message_reads_use_created_at_then_id(store):
    _conversation(store)
    service = ConversationAppendService(store)
    service.append(
        _payload(
            _message("z-message", created_at="2026-08-29T12:00:00Z"),
            _message("a-message", created_at="2026-08-29T12:00:00Z"),
        )
    )
    assert [message.id for message in store.get_messages("conversation-1")] == [
        "a-message",
        "z-message",
    ]
