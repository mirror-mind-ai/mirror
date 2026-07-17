"""CV9.E2.S9 (AI-03) — extraction is idempotent across partial failure.

A failure partway through persisting extracted memories must leave nothing
behind, so the CV9.E2.S7 retry does not duplicate rows or re-spend on
embeddings. Embeddings are staged (all generated up front) before any write.
"""

import json

import numpy as np
import pytest

from memory.models import ExtractedMemory

_UNIT = np.ones(1536, dtype=np.float32) / np.sqrt(1536)


def _embed_or_fail(text: str, **kwargs):
    """Fake embedding provider that fails for any text carrying the poison marker."""
    if "FAIL_EMB" in text:
        raise RuntimeError("embedding provider down")
    return _UNIT


def _memory(title: str, *, poison: bool = False) -> ExtractedMemory:
    content = "FAIL_EMB content" if poison else f"{title} content"
    return ExtractedMemory(title=title, content=content, memory_type="insight", layer="ego")


def _eligible_conversation(conversation_service, *, messages: str = "hello"):
    conv = conversation_service.start_conversation(interface="cli", journey="mirror")
    for i in range(4):
        conversation_service.add_message(conv.id, role="user", content=f"{messages} {i}")
    return conv


def _memory_count(store, conversation_id: str) -> int:
    row = store.conn.execute(
        "SELECT COUNT(*) AS n FROM memories WHERE conversation_id = ?", (conversation_id,)
    ).fetchone()
    return int(row["n"])


def _patch_embeddings(mocker, side_effect):
    mocker.patch("memory.services.conversation.generate_embedding", side_effect=side_effect)
    mocker.patch("memory.services.memory.generate_embedding", side_effect=side_effect)


class TestPartialFailureIsAtomic:
    def test_partial_embedding_failure_persists_nothing(self, conversation_service, store, mocker):
        mocker.patch(
            "memory.services.conversation.extract_memories",
            return_value=[_memory("mem0"), _memory("mem1"), _memory("mem2", poison=True)],
        )
        mocker.patch("memory.services.conversation.extract_tasks", return_value=[])
        _patch_embeddings(mocker, _embed_or_fail)
        conv = _eligible_conversation(conversation_service)

        with pytest.raises(RuntimeError):
            conversation_service.extract_conversation(conv.id)

        assert _memory_count(store, conv.id) == 0
        meta = json.loads(store.get_conversation(conv.id).metadata or "{}")
        assert meta.get("extracted") is not True
        assert meta.get("extraction_attempts") == 1  # S7 still records the attempt

    def test_summary_embedding_failure_persists_nothing(self, conversation_service, store, mocker):
        mocker.patch(
            "memory.services.conversation.extract_memories", return_value=[_memory("mem0")]
        )
        mocker.patch("memory.services.conversation.extract_tasks", return_value=[])
        _patch_embeddings(mocker, _embed_or_fail)
        # The naive summary is built from message content; poison it so the
        # summary embedding (staged first) fails.
        conv = _eligible_conversation(conversation_service, messages="FAIL_EMB msg")

        with pytest.raises(RuntimeError):
            conversation_service.extract_conversation(conv.id)

        assert _memory_count(store, conv.id) == 0


class TestRetryDoesNotDuplicate:
    def test_retry_after_partial_failure_yields_the_successful_set_once(
        self, conversation_service, store, mocker
    ):
        mocker.patch(
            "memory.services.conversation.extract_memories",
            side_effect=[
                [_memory("mem0"), _memory("mem1"), _memory("mem2", poison=True)],  # attempt 1
                [_memory("mem0"), _memory("mem1"), _memory("mem2")],  # attempt 2
            ],
        )
        mocker.patch("memory.services.conversation.extract_tasks", return_value=[])
        _patch_embeddings(mocker, _embed_or_fail)
        conv = _eligible_conversation(conversation_service)

        with pytest.raises(RuntimeError):
            conversation_service.extract_conversation(conv.id)  # attempt 1 fails mid-way
        conversation_service.extract_conversation(conv.id)  # attempt 2 succeeds

        assert _memory_count(store, conv.id) == 3
        meta = json.loads(store.get_conversation(conv.id).metadata or "{}")
        assert meta.get("extracted") is True


class TestPrecomputedEmbedding:
    def test_add_memory_with_embedding_skips_generation(self, memory_service, mocker):
        from memory.intelligence.embeddings import bytes_to_embedding

        gen = mocker.patch("memory.services.memory.generate_embedding")
        stored = memory_service.add_memory(
            title="t", content="c", memory_type="insight", embedding=_UNIT
        )

        gen.assert_not_called()
        persisted = memory_service.store.get_memory(stored.id)
        assert np.allclose(bytes_to_embedding(persisted.embedding), _UNIT)


class TestHappyPathRegression:
    def test_normal_extraction_stores_all_and_marks_extracted(
        self, conversation_service, store, mocker, mock_conversation_embedding
    ):
        mocker.patch(
            "memory.services.conversation.extract_memories",
            return_value=[_memory("mem0"), _memory("mem1")],
        )
        mocker.patch("memory.services.conversation.extract_tasks", return_value=[])
        conv = _eligible_conversation(conversation_service)

        result = conversation_service.extract_conversation(conv.id)

        assert len(result) == 2
        assert _memory_count(store, conv.id) == 2
        meta = json.loads(store.get_conversation(conv.id).metadata or "{}")
        assert meta.get("extracted") is True
