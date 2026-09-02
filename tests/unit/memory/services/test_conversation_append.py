"""Contract tests for explicit conversation append."""

from __future__ import annotations

import json

import pytest

from memory.services.conversation_append import (
    AppendRejected,
    ConversationAppendService,
    parse_append_request,
)


def _payload(**overrides):
    payload = {
        "schemaVersion": "1.0.0",
        "conversationId": "conversation-1",
        "journeyId": "journey-1",
        "sourceInterface": "external-shell",
        "messages": [
            {
                "id": "turn:2026-08-29T12:00:00.000Z",
                "role": "user",
                "content": "hello",
                "createdAt": "2026-08-29T09:00:00-03:00",
                "metadata": {"z": 1, "a": "á"},
            }
        ],
    }
    payload.update(overrides)
    return payload


def test_parse_normalizes_timestamp_and_canonical_metadata():
    request = parse_append_request(_payload())

    message = request.messages[0]
    assert message.created_at == "2026-08-29T12:00:00.000000Z"
    assert message.metadata_json == (
        '{"callerMetadata":{"a":"á","z":1},'
        '"mirrorAppend":{"schemaVersion":"1.0.0",'
        '"sourceInterface":"external-shell"}}'
    )


@pytest.mark.parametrize(
    "message_id",
    ["", "message id", "message\tid", "message\nid", "message\x00id", "mensagem-á", "a" * 129],
)
def test_invalid_message_ids_reject_before_storage(store, message_id):
    service = ConversationAppendService(store)
    payload = _payload()
    payload["messages"][0]["id"] = message_id

    with pytest.raises(AppendRejected) as exc:
        service.append(payload)

    assert exc.value.reason == "malformed_request"
    assert store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0


@pytest.mark.parametrize(
    "message_id",
    ["550e8400-e29b-41d4-a716-446655440000", "turn:2026-08-29T12:00:00.000Z"],
)
def test_uuid_and_timestamp_message_ids_are_valid(message_id):
    payload = _payload()
    payload["messages"][0]["id"] = message_id
    assert parse_append_request(payload).messages[0].id == message_id


def test_schema_version_and_batch_limits_have_stable_reasons():
    with pytest.raises(AppendRejected) as unsupported:
        parse_append_request(_payload(schemaVersion="2.0.0"))
    assert unsupported.value.reason == "unsupported_schema_version"

    with pytest.raises(AppendRejected) as empty:
        parse_append_request(_payload(messages=[]))
    assert empty.value.reason == "limit_exceeded"

    message = _payload()["messages"][0]
    with pytest.raises(AppendRejected) as oversized:
        parse_append_request(
            _payload(messages=[dict(message, id=f"message-{i}") for i in range(21)])
        )
    assert oversized.value.reason == "limit_exceeded"


def test_duplicate_request_ids_reject():
    payload = _payload()
    payload["messages"] = [payload["messages"][0], dict(payload["messages"][0])]
    with pytest.raises(AppendRejected) as exc:
        parse_append_request(payload)
    assert exc.value.reason == "duplicate_request_message_id"


def test_metadata_envelope_limit_counts_mirror_provenance():
    payload = _payload()
    payload["messages"][0]["metadata"] = {"value": "x" * 4096}
    with pytest.raises(AppendRejected) as exc:
        parse_append_request(payload)
    assert exc.value.reason == "limit_exceeded"


def test_deeply_nested_metadata_rejects_recursion_without_storage(store):
    metadata = {}
    for _ in range(2_000):
        metadata = {"nested": metadata}
    payload = _payload()
    payload["messages"][0]["metadata"] = metadata

    with pytest.raises(AppendRejected) as exc:
        ConversationAppendService(store).append(payload)

    assert exc.value.reason == "malformed_request"
    assert store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0


@pytest.mark.parametrize(
    ("field", "value"),
    [("content", "\ud800"), ("metadata", {"private": "\ud800"})],
)
def test_unpaired_unicode_surrogate_rejects_before_storage(store, field, value):
    payload = _payload()
    payload["messages"][0][field] = value

    with pytest.raises(AppendRejected) as exc:
        ConversationAppendService(store).append(payload)

    assert exc.value.reason == "malformed_request"
    assert store.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0


def test_content_limit_is_utf8_bytes():
    payload = _payload()
    payload["messages"][0]["content"] = "á" * 25_601
    with pytest.raises(AppendRejected) as exc:
        parse_append_request(payload)
    assert exc.value.reason == "limit_exceeded"


def test_request_shape_role_source_and_timestamp_are_strict():
    payload = _payload(extra="no")
    with pytest.raises(AppendRejected) as exc:
        parse_append_request(payload)
    assert exc.value.reason == "malformed_request"

    payload = _payload()
    payload["messages"][0]["role"] = ["user"]
    with pytest.raises(AppendRejected) as exc:
        parse_append_request(payload)
    assert exc.value.reason == "malformed_request"

    with pytest.raises(AppendRejected) as exc:
        parse_append_request(_payload(sourceInterface="external shell"))
    assert exc.value.reason == "malformed_request"

    payload = _payload()
    payload["messages"][0]["createdAt"] = "2026-08-29T12:00:00"
    with pytest.raises(AppendRejected) as exc:
        parse_append_request(payload)
    assert exc.value.reason == "malformed_request"


def test_receipt_contains_only_bounded_identifiers(store):
    store.conn.execute(
        "INSERT INTO conversations (id, started_at, interface, journey) VALUES (?, ?, ?, ?)",
        ("conversation-1", "2026-08-29T00:00:00Z", "test", "journey-1"),
    )
    store.conn.commit()

    receipt = ConversationAppendService(store).append(_payload())

    encoded = json.dumps(receipt, ensure_ascii=False)
    assert "hello" not in encoded
    assert "callerMetadata" not in encoded
    assert receipt["messages"] == [{"id": "turn:2026-08-29T12:00:00.000Z", "state": "inserted"}]


@pytest.mark.parametrize(
    ("created_at", "expected"),
    [
        ("2026-08-29T12:00:00Z", "2026-08-29T12:00:00.000000Z"),
        ("2026-08-29T12:00:00.5Z", "2026-08-29T12:00:00.500000Z"),
        ("2026-08-29T12:00:00.12Z", "2026-08-29T12:00:00.120000Z"),
        ("2026-08-29T12:00:00.000Z", "2026-08-29T12:00:00.000000Z"),
        ("2026-08-29T12:00:00.123456Z", "2026-08-29T12:00:00.123456Z"),
        # More precision than microseconds is truncated, not rejected.
        ("2026-08-29T12:00:00.1234567Z", "2026-08-29T12:00:00.123456Z"),
        ("2026-08-29T12:00:00.999999999Z", "2026-08-29T12:00:00.999999Z"),
        ("2026-08-29T14:00:00.25+02:00", "2026-08-29T12:00:00.250000Z"),
    ],
)
def test_normalizes_every_rfc3339_fraction_width(created_at, expected):
    """Fractional seconds must not depend on the interpreter version.

    `datetime.fromisoformat` accepts only 3 or 6 fractional digits before
    Python 3.11, so delegating parsing to it made this published external-shell
    contract accept a request on one supported runtime and reject it on
    another. The regex advertises RFC 3339 (any number of digits), so every
    width must normalize identically on every supported Python.
    """
    payload = _payload()
    payload["messages"][0]["createdAt"] = created_at

    request = parse_append_request(payload)

    assert request.messages[0].created_at == expected


@pytest.mark.parametrize(
    "created_at",
    [
        "2026-08-29T12:00:00",  # no offset
        "2026-08-29T12:00:00.Z",  # empty fraction
        "2026-08-29T12:00:00+0200",  # offset without a colon
        "2026-08-29 12:00:00Z",  # space separator
    ],
)
def test_rejects_non_rfc3339_timestamps(created_at):
    payload = _payload()
    payload["messages"][0]["createdAt"] = created_at

    with pytest.raises(AppendRejected) as exc:
        parse_append_request(payload)
    assert exc.value.reason == "malformed_request"
