"""Explicit, atomic conversation append contract and service."""

from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from memory.storage.messages import ConversationAppendStorageError
from memory.storage.store import Store

SCHEMA_VERSION = "1.0.0"
MAX_PAYLOAD_BYTES = 262_144
MAX_MESSAGES = 20
MAX_CONTENT_BYTES = 51_200
MAX_METADATA_BYTES = 4_096
MESSAGE_ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\Z", re.ASCII)
SOURCE_INTERFACE_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z", re.ASCII)
RFC3339_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\Z",
    re.ASCII,
)

PUBLIC_MESSAGES = {
    "malformed_request": "Request does not match the conversation append contract.",
    "unsupported_schema_version": "Request schema version is unsupported.",
    "limit_exceeded": "Request exceeds a conversation append limit.",
    "conversation_not_found": "Conversation was not found.",
    "journey_mismatch": "Conversation belongs to a different journey.",
    "duplicate_request_message_id": "Request contains a duplicate message ID.",
    "idempotency_conflict": "Message ID conflicts with persisted conversation data.",
    "persistence_failure": "Conversation append could not be persisted.",
}


class AppendRejected(Exception):
    """Bounded public rejection from the explicit append boundary."""

    def __init__(self, reason: str):
        self.reason = reason
        self.public_message = PUBLIC_MESSAGES[reason]
        super().__init__(self.public_message)

    def receipt(self) -> dict[str, str]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "status": "rejected",
            "reason": self.reason,
            "message": self.public_message,
        }


@dataclass(frozen=True)
class AppendMessage:
    id: str
    role: str
    content: str
    created_at: str
    metadata_json: str


@dataclass(frozen=True)
class ConversationAppendRequest:
    conversation_id: str
    journey_id: str
    source_interface: str
    messages: tuple[AppendMessage, ...]


def canonical_json(value: Mapping[str, Any]) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise AppendRejected("malformed_request") from exc


def parse_append_request(payload: object) -> ConversationAppendRequest:
    """Parse one request while containing pathological JSON/Unicode values."""
    try:
        return _parse_append_request(payload)
    except AppendRejected:
        raise
    except (RecursionError, UnicodeError) as exc:
        raise AppendRejected("malformed_request") from exc


def _parse_append_request(payload: object) -> ConversationAppendRequest:
    if not isinstance(payload, dict) or set(payload) != {
        "schemaVersion",
        "conversationId",
        "journeyId",
        "sourceInterface",
        "messages",
    }:
        raise AppendRejected("malformed_request")
    if payload["schemaVersion"] != SCHEMA_VERSION:
        if not isinstance(payload["schemaVersion"], str):
            raise AppendRejected("malformed_request")
        raise AppendRejected("unsupported_schema_version")

    conversation_id = _required_string(payload["conversationId"])
    journey_id = _required_string(payload["journeyId"])
    source_interface = payload["sourceInterface"]
    if not isinstance(source_interface, str) or not SOURCE_INTERFACE_RE.fullmatch(source_interface):
        raise AppendRejected("malformed_request")

    raw_messages = payload["messages"]
    if not isinstance(raw_messages, list):
        raise AppendRejected("malformed_request")
    if not 1 <= len(raw_messages) <= MAX_MESSAGES:
        raise AppendRejected("limit_exceeded")

    messages: list[AppendMessage] = []
    seen: set[str] = set()
    for raw in raw_messages:
        message = _parse_message(raw, source_interface)
        if message.id in seen:
            raise AppendRejected("duplicate_request_message_id")
        seen.add(message.id)
        messages.append(message)
    return ConversationAppendRequest(
        conversation_id=conversation_id,
        journey_id=journey_id,
        source_interface=source_interface,
        messages=tuple(messages),
    )


def _parse_message(raw: object, source_interface: str) -> AppendMessage:
    if not isinstance(raw, dict):
        raise AppendRejected("malformed_request")
    required = {"id", "role", "content", "createdAt"}
    if not required.issubset(raw) or not set(raw).issubset(required | {"metadata"}):
        raise AppendRejected("malformed_request")

    message_id = raw["id"]
    if not isinstance(message_id, str) or not MESSAGE_ID_RE.fullmatch(message_id):
        raise AppendRejected("malformed_request")
    role = raw["role"]
    if not isinstance(role, str) or role not in {"user", "assistant"}:
        raise AppendRejected("malformed_request")
    content = raw["content"]
    if not isinstance(content, str) or not content:
        raise AppendRejected("malformed_request")
    if len(content.encode("utf-8")) > MAX_CONTENT_BYTES:
        raise AppendRejected("limit_exceeded")

    caller_metadata = raw.get("metadata", {})
    if not isinstance(caller_metadata, dict) or not _is_finite_json(caller_metadata):
        raise AppendRejected("malformed_request")
    metadata_json = canonical_json(
        {
            "callerMetadata": caller_metadata,
            "mirrorAppend": {
                "schemaVersion": SCHEMA_VERSION,
                "sourceInterface": source_interface,
            },
        }
    )
    if len(metadata_json.encode("utf-8")) > MAX_METADATA_BYTES:
        raise AppendRejected("limit_exceeded")

    return AppendMessage(
        id=message_id,
        role=role,
        content=content,
        created_at=_normalize_timestamp(raw["createdAt"]),
        metadata_json=metadata_json,
    )


def _required_string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise AppendRejected("malformed_request")
    return value


def _normalize_timestamp(value: object) -> str:
    if not isinstance(value, str) or not RFC3339_RE.fullmatch(value):
        raise AppendRejected("malformed_request")
    candidate = f"{value[:-1]}+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise AppendRejected("malformed_request") from exc
    if parsed.tzinfo is None:
        raise AppendRejected("malformed_request")
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _is_finite_json(value: object) -> bool:
    if value is None or isinstance(value, (str, bool, int)):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, list):
        return all(_is_finite_json(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _is_finite_json(item) for key, item in value.items())
    return False


class ConversationAppendService:
    """Validate and append to one exact conversation without ambient routing."""

    def __init__(self, store: Store):
        self.store = store

    def append(self, payload: object) -> dict[str, Any]:
        return self.append_request(parse_append_request(payload))

    def append_request(self, request: ConversationAppendRequest) -> dict[str, Any]:
        try:
            states = self.store.append_conversation_messages(
                request.conversation_id,
                request.journey_id,
                [
                    {
                        "id": message.id,
                        "role": message.role,
                        "content": message.content,
                        "created_at": message.created_at,
                        "metadata": message.metadata_json,
                    }
                    for message in request.messages
                ],
            )
        except ConversationAppendStorageError as exc:
            raise AppendRejected(exc.reason) from exc
        inserted = sum(state == "inserted" for state in states)
        existing = len(states) - inserted
        return {
            "schemaVersion": SCHEMA_VERSION,
            "status": "accepted",
            "conversationId": request.conversation_id,
            "journeyId": request.journey_id,
            "insertedCount": inserted,
            "existingCount": existing,
            "messages": [
                {"id": message.id, "state": state}
                for message, state in zip(request.messages, states, strict=True)
            ],
        }
