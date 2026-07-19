"""CV9.E2.S1 — an embedding failure during extraction persists nothing.

Locks the interaction with S7 (isolation/quarantine) and S9 (staging-first
idempotency): when ``generate_embedding`` raises mid-extraction, the attempt is
counted, the ``EmbeddingError`` propagates for the maintenance loop to isolate,
and no partial memory rows are written.
"""

import json

import pytest

from memory.intelligence.embeddings import EmbeddingError
from memory.models import ExtractedMemory


def _eligible(conversation_service):
    conv = conversation_service.start_conversation(interface="cli", journey="mirror")
    for i in range(4):
        conversation_service.add_message(conv.id, role="user", content=f"message {i}")
    return conv


class TestExtractionEmbeddingResilience:
    def test_embedding_failure_persists_nothing_and_counts_attempt(
        self, conversation_service, store, mocker
    ):
        mocker.patch(
            "memory.services.conversation.extract_memories",
            return_value=[
                ExtractedMemory(title="a", content="b", memory_type="insight", layer="ego"),
                ExtractedMemory(title="c", content="d", memory_type="insight", layer="ego"),
            ],
        )
        mocker.patch("memory.services.conversation.extract_tasks", return_value=[])
        mocker.patch(
            "memory.services.conversation.generate_embedding",
            side_effect=EmbeddingError("No embedding generated after 3 attempts"),
        )
        before = len(store.get_all_memories_with_embeddings())
        conv = _eligible(conversation_service)

        with pytest.raises(EmbeddingError):
            conversation_service.extract_conversation(conv.id)

        assert len(store.get_all_memories_with_embeddings()) == before
        meta = json.loads(store.get_conversation(conv.id).metadata or "{}")
        assert meta.get("extraction_attempts") == 1
        assert meta.get("extracted") is not True
