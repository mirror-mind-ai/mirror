"""Focused tests for conversation storage read models."""

import json

from memory.models import Conversation, Message


def test_find_conversation_by_id_prefix_returns_latest_matching_conversation(store):
    older = store.create_conversation(
        Conversation(
            id="abc11111",
            interface="cli",
            title="Older",
            started_at="2026-01-01T00:00:00Z",
        )
    )
    newer = store.create_conversation(
        Conversation(
            id="abc22222",
            interface="cli",
            title="Newer",
            started_at="2026-01-02T00:00:00Z",
        )
    )

    result = store.find_conversation_by_id_prefix("abc")

    assert result is not None
    assert result.id == newer.id
    assert result.id != older.id


def test_find_conversation_by_id_prefix_returns_none_when_missing(store):
    assert store.find_conversation_by_id_prefix("missing") is None


def test_list_recent_conversation_summaries_includes_message_count(store):
    older = store.create_conversation(
        Conversation(id="older", interface="cli", title="Older", started_at="2026-01-01T00:00:00Z")
    )
    newer = store.create_conversation(
        Conversation(id="newer", interface="cli", title="Newer", started_at="2026-01-02T00:00:00Z")
    )
    store.add_message(Message(conversation_id=newer.id, role="user", content="hello"))
    store.add_message(Message(conversation_id=newer.id, role="assistant", content="hi"))

    summaries = store.list_recent_conversation_summaries(limit=10)

    assert [summary.id for summary in summaries] == [newer.id, older.id]
    assert summaries[0].message_count == 2
    assert summaries[1].message_count == 0


def test_list_recent_conversation_summaries_filters_by_journey_and_persona(store):
    match = store.create_conversation(
        Conversation(
            id="match",
            interface="cli",
            journey="mirror",
            persona="engineer",
            started_at="2026-01-03T00:00:00Z",
        )
    )
    store.create_conversation(
        Conversation(
            id="wrong-journey",
            interface="cli",
            journey="other",
            persona="engineer",
            started_at="2026-01-02T00:00:00Z",
        )
    )
    store.create_conversation(
        Conversation(
            id="wrong-persona",
            interface="cli",
            journey="mirror",
            persona="writer",
            started_at="2026-01-01T00:00:00Z",
        )
    )

    summaries = store.list_recent_conversation_summaries(
        limit=10,
        journey="mirror",
        persona="engineer",
    )

    assert [summary.id for summary in summaries] == [match.id]


# --- CV9.E2.S7 (AI-02) — quarantine exclusion & count ---


def _make_eligible(store, conv_id, *, quarantined=False, extracted=False):
    """An ended, journey-bound, 4-message conversation eligible for extraction."""
    meta = {}
    if quarantined:
        meta["extraction_quarantined"] = True
    if extracted:
        meta["extracted"] = True
    store.create_conversation(
        Conversation(
            id=conv_id,
            interface="cli",
            journey="mirror",
            ended_at="2026-01-01T00:00:00Z",
            metadata=json.dumps(meta) if meta else None,
        )
    )
    for i in range(4):
        store.add_message(Message(conversation_id=conv_id, role="user", content=f"m{i}"))


def test_get_unextracted_conversations_excludes_quarantined(store):
    _make_eligible(store, "healthy")
    _make_eligible(store, "quarantined", quarantined=True)

    ids = {c.id for c in store.get_unextracted_conversations()}

    assert "healthy" in ids
    assert "quarantined" not in ids


def test_count_quarantined_conversations(store):
    _make_eligible(store, "q1", quarantined=True)
    _make_eligible(store, "q2", quarantined=True)
    _make_eligible(store, "healthy")

    assert store.count_quarantined_conversations() == 2


# --- CV9.E2.S26 (AI-05) — budgeted maintenance extraction ---


def _make_eligible_at(store, conv_id, ended_at):
    """An eligible conversation with an explicit ended_at, for ordering tests."""
    store.create_conversation(
        Conversation(
            id=conv_id,
            interface="cli",
            journey="mirror",
            ended_at=ended_at,
        )
    )
    for i in range(4):
        store.add_message(Message(conversation_id=conv_id, role="user", content=f"m{i}"))


class TestGetUnextractedConversationsLimit:
    def test_no_limit_returns_all_eligible(self, store):
        _make_eligible(store, "a")
        _make_eligible(store, "b")
        assert len(store.get_unextracted_conversations()) == 2

    def test_limit_caps_the_result_count(self, store):
        for i in range(15):
            _make_eligible_at(store, f"c{i}", f"2026-01-{i + 1:02d}T00:00:00Z")
        result = store.get_unextracted_conversations(limit=10)
        assert len(result) == 10

    def test_limit_returns_oldest_first(self, store):
        _make_eligible_at(store, "newest", "2026-01-03T00:00:00Z")
        _make_eligible_at(store, "oldest", "2026-01-01T00:00:00Z")
        _make_eligible_at(store, "middle", "2026-01-02T00:00:00Z")
        result = store.get_unextracted_conversations(limit=2)
        assert [c.id for c in result] == ["oldest", "middle"]

    def test_limit_larger_than_pending_returns_all(self, store):
        _make_eligible(store, "only-one")
        result = store.get_unextracted_conversations(limit=10)
        assert len(result) == 1

    def test_limit_none_still_excludes_quarantined(self, store):
        _make_eligible(store, "healthy")
        _make_eligible(store, "quarantined", quarantined=True)
        result = store.get_unextracted_conversations(limit=10)
        assert {c.id for c in result} == {"healthy"}


class TestCountUnextractedConversations:
    def test_counts_all_eligible(self, store):
        _make_eligible(store, "a")
        _make_eligible(store, "b")
        _make_eligible(store, "c")
        assert store.count_unextracted_conversations() == 3

    def test_excludes_quarantined(self, store):
        _make_eligible(store, "healthy")
        _make_eligible(store, "quarantined", quarantined=True)
        assert store.count_unextracted_conversations() == 1

    def test_excludes_already_extracted(self, store):
        _make_eligible(store, "healthy")
        _make_eligible(store, "done", extracted=True)
        assert store.count_unextracted_conversations() == 1

    def test_zero_when_none_pending(self, store):
        assert store.count_unextracted_conversations() == 0

    def test_matches_get_unextracted_conversations_predicate(self, store):
        # The count must reflect the SAME eligible set get_unextracted_conversations
        # returns, regardless of any limit passed to the latter — this is what lets
        # session_maintenance compute "carried over" as count() after a capped run.
        for i in range(5):
            _make_eligible_at(store, f"c{i}", f"2026-01-{i + 1:02d}T00:00:00Z")
        assert store.count_unextracted_conversations() == len(store.get_unextracted_conversations())


def test_count_conversations_with_extraction_status(store):
    for cid, status in (("p1", "parse_failed"), ("p2", "parse_failed"), ("ok1", "ok")):
        store.create_conversation(
            Conversation(
                id=cid,
                interface="cli",
                journey="mirror",
                ended_at="2026-01-01T00:00:00Z",
                metadata=json.dumps({"extraction_status": status}),
            )
        )
    assert store.count_conversations_with_extraction_status("parse_failed") == 2
    assert store.count_conversations_with_extraction_status("ok") == 1
