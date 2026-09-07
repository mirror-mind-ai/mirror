"""Runtime session service behavior."""

import sqlite3

import pytest

from memory.models import Conversation, _now
from memory.services.runtime_session import RuntimeSessionService
from memory.storage.store import Store


def test_get_or_create_conversation_creates_conversation_and_runtime_session(db_conn):
    store = Store(db_conn)
    service = RuntimeSessionService(store)

    conversation = service.get_or_create_conversation(
        "sess-1",
        interface="pi",
        persona="engineer",
        journey="mirror",
        title="Initial title",
    )

    stored_conversation = store.get_conversation(conversation.id)
    runtime_session = store.get_runtime_session("sess-1")

    assert stored_conversation is not None
    assert stored_conversation.id == conversation.id
    assert stored_conversation.interface == "pi"
    assert stored_conversation.persona == "engineer"
    assert stored_conversation.journey == "mirror"
    assert stored_conversation.title == "Initial title"

    assert runtime_session is not None
    assert runtime_session.conversation_id == conversation.id
    assert runtime_session.interface == "pi"
    assert runtime_session.persona == "engineer"
    assert runtime_session.journey == "mirror"
    assert runtime_session.active is True


def test_get_or_create_conversation_returns_existing_conversation(db_conn):
    store = Store(db_conn)
    service = RuntimeSessionService(store)
    existing = store.create_conversation(Conversation(interface="pi", journey="mirror"))
    store.upsert_runtime_session(
        "sess-1",
        conversation_id=existing.id,
        interface="pi",
        journey="mirror",
    )

    conversation = service.get_or_create_conversation(
        "sess-1",
        interface="pi",
        persona="engineer",
        journey="mirror",
    )

    assert conversation.id == existing.id
    count = db_conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
    assert count == 1


def test_get_or_create_conversation_replaces_stale_conversation_binding(db_conn):
    store = Store(db_conn)
    service = RuntimeSessionService(store)
    db_conn.execute("PRAGMA foreign_keys=OFF")
    now = _now()
    db_conn.execute(
        """INSERT INTO runtime_sessions
           (session_id, conversation_id, interface, mirror_active, persona, journey,
            hook_injected, active, started_at, updated_at, closed_at, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "sess-1",
            "missing-conversation",
            "pi",
            0,
            "writer",
            "old-journey",
            0,
            1,
            now,
            now,
            None,
            None,
        ),
    )
    db_conn.commit()
    db_conn.execute("PRAGMA foreign_keys=ON")

    conversation = service.get_or_create_conversation(
        "sess-1",
        interface="claude_code",
        persona="engineer",
        journey="mirror",
    )
    runtime_session = store.get_runtime_session("sess-1")

    assert conversation.id != "missing-conversation"
    assert conversation.interface == "claude_code"
    assert conversation.persona == "engineer"
    assert conversation.journey == "mirror"
    assert runtime_session is not None
    assert runtime_session.conversation_id == conversation.id
    assert runtime_session.interface == "claude_code"
    assert runtime_session.persona == "engineer"
    assert runtime_session.journey == "mirror"
    assert runtime_session.active is True
    assert runtime_session.closed_at is None


# --- import_closed_conversation (US10 resolved decision 4B) ---


def _import_messages() -> list[dict]:
    return [
        {"role": "user", "content": "hello", "created_at": "2026-04-17T10:00:00+00:00"},
        {"role": "assistant", "content": "hi there", "created_at": "2026-04-17T10:00:01+00:00"},
    ]


def test_import_closed_conversation_imports_atomically(db_conn):
    store = Store(db_conn)
    service = RuntimeSessionService(store)

    conversation = service.import_closed_conversation(
        "/sessions/s1.jsonl",
        interface="pi",
        messages=_import_messages(),
        ended_at="2026-04-17T10:00:01+00:00",
    )

    assert conversation is not None
    stored = store.get_conversation(conversation.id)
    assert stored is not None
    assert stored.interface == "pi"
    assert stored.title is None
    assert stored.ended_at == "2026-04-17T10:00:01+00:00"

    messages = store.get_messages(conversation.id)
    assert [(m.role, m.content, m.created_at) for m in messages] == [
        ("user", "hello", "2026-04-17T10:00:00+00:00"),
        ("assistant", "hi there", "2026-04-17T10:00:01+00:00"),
    ]

    session = store.get_runtime_session("/sessions/s1.jsonl")
    assert session is not None
    assert session.conversation_id == conversation.id
    assert session.interface == "pi"
    assert session.active is False
    assert session.closed_at == "2026-04-17T10:00:01+00:00"


def test_import_closed_conversation_skips_when_session_already_bound(db_conn):
    store = Store(db_conn)
    service = RuntimeSessionService(store)
    live = service.get_or_create_conversation("/sessions/s1.jsonl", interface="pi")

    result = service.import_closed_conversation(
        "/sessions/s1.jsonl",
        interface="pi",
        messages=_import_messages(),
        ended_at="2026-04-17T10:00:01+00:00",
    )

    assert result is None
    session = store.get_runtime_session("/sessions/s1.jsonl")
    assert session.conversation_id == live.id
    assert session.active is True
    assert session.closed_at is None
    assert db_conn.execute("SELECT COUNT(*) AS n FROM conversations").fetchone()["n"] == 1
    assert db_conn.execute("SELECT COUNT(*) AS n FROM messages").fetchone()["n"] == 0


class _FailOnSql:
    """Delegating connection wrapper that raises on a matching statement."""

    def __init__(self, conn, needle: str):
        self._conn = conn
        self._needle = needle

    def execute(self, sql, *args, **kwargs):
        if self._needle in sql:
            raise sqlite3.OperationalError("injected failure")
        return self._conn.execute(sql, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._conn, name)


def test_import_closed_conversation_rolls_back_completely_on_failure(db_conn):
    store = Store(db_conn)
    service = RuntimeSessionService(store)
    store.conn = _FailOnSql(db_conn, "INSERT INTO runtime_sessions")

    with pytest.raises(sqlite3.OperationalError):
        service.import_closed_conversation(
            "/sessions/s1.jsonl",
            interface="pi",
            messages=_import_messages(),
            ended_at="2026-04-17T10:00:01+00:00",
        )

    store.conn = db_conn
    assert db_conn.execute("SELECT COUNT(*) AS n FROM conversations").fetchone()["n"] == 0
    assert db_conn.execute("SELECT COUNT(*) AS n FROM messages").fetchone()["n"] == 0
    assert db_conn.execute("SELECT COUNT(*) AS n FROM runtime_sessions").fetchone()["n"] == 0
