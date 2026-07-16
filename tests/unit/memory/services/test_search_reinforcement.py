"""CV9.E2.S11 (AI-12) — only genuine context loads reinforce retrieval.

`search()` reinforces (`log_access`) every returned memory, and `access_count`
feeds the ranker. Internal machinery — the extraction curation pass, MCP agent
searches, exploratory CLI searches — must opt out so the ranker does not learn
from its own exhaust.
"""

import numpy as np

from memory.models import ExtractedMemory

_UNIT = np.ones(1536, dtype=np.float32) / np.sqrt(1536)


def _patch_search_embeddings(mocker):
    mocker.patch("memory.services.memory.generate_embedding", return_value=_UNIT)
    mocker.patch("memory.intelligence.search.generate_embedding", return_value=_UNIT)


class TestLogAccessFlag:
    def test_log_access_false_does_not_reinforce(self, memory_service, store, mocker):
        _patch_search_embeddings(mocker)
        memory_service.add_memory(title="Nomad", content="freedom", memory_type="insight")
        spy = mocker.spy(store, "log_access")

        memory_service.search_with_status("nomad freedom", log_access=False)

        spy.assert_not_called()

    def test_search_reinforces_by_default(self, memory_service, store, mocker):
        _patch_search_embeddings(mocker)
        memory_service.add_memory(title="Nomad", content="freedom", memory_type="insight")
        spy = mocker.spy(store, "log_access")

        outcome = memory_service.search_with_status("nomad freedom")

        assert len(outcome.results) >= 1
        assert spy.call_count == len(outcome.results)


class TestCurationDoesNotReinforce:
    def test_two_pass_extraction_reinforces_nothing(self, conversation_service, store, mocker):
        mocker.patch("memory.services.conversation.TWO_PASS_ENABLED", True)
        mocker.patch("memory.services.conversation.generate_embedding", return_value=_UNIT)
        _patch_search_embeddings(mocker)
        mocker.patch(
            "memory.services.conversation.extract_memories",
            return_value=[
                ExtractedMemory(title="New", content="c", memory_type="insight", layer="ego")
            ],
        )
        mocker.patch("memory.services.conversation.extract_tasks", return_value=[])
        mocker.patch(
            "memory.services.conversation.curate_against_existing",
            side_effect=lambda candidates, existing, **kwargs: candidates,
        )
        # A prior memory so the curation search has a candidate to (not) reinforce.
        conversation_service.memories.add_memory(
            title="Existing insight",
            content="nomad freedom prior",
            memory_type="insight",
            journey="mirror",
        )
        conv = conversation_service.start_conversation(interface="cli", journey="mirror")
        for i in range(4):
            conversation_service.add_message(conv.id, role="user", content=f"message {i}")

        spy = mocker.spy(store, "log_access")
        conversation_service.extract_conversation(conv.id)

        spy.assert_not_called()
