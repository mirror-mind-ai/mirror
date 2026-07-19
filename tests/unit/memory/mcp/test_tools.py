"""Tool handler tests for the Mirror MCP server (CV21.E2.S2)."""

from __future__ import annotations

import json

import pytest

from memory.mcp import tools


def test_list_journeys_returns_json_list(mcp_client) -> None:
    assert isinstance(json.loads(tools._list_journeys(mcp_client, {})), list)


def test_journey_status_returns_json_object(mcp_client) -> None:
    assert isinstance(json.loads(tools._journey_status(mcp_client, {})), dict)


def test_list_conversations_returns_json_list(mcp_client) -> None:
    assert isinstance(json.loads(tools._list_conversations(mcp_client, {})), list)


def test_search_memories_requires_query_or_filter(mcp_client) -> None:
    with pytest.raises(ValueError):
        tools._search_memories(mcp_client, {})


def test_search_memories_does_not_reinforce(mcp_client, mocker) -> None:
    import numpy as np

    unit = np.ones(1536, dtype=np.float32) / np.sqrt(1536)
    mocker.patch("memory.services.memory.generate_embedding", return_value=unit)
    mocker.patch("memory.intelligence.search.generate_embedding", return_value=unit)
    mcp_client.add_memory(title="Nomad freedom", content="digital nomad", memory_type="insight")
    spy = mocker.spy(mcp_client.store, "log_access")

    tools._search_memories(mcp_client, {"query": "nomad"})

    spy.assert_not_called()


def test_recall_requires_conversation_id(mcp_client) -> None:
    with pytest.raises(ValueError):
        tools._recall_conversation(mcp_client, {})


def test_recall_unknown_conversation_raises(mcp_client) -> None:
    with pytest.raises(ValueError):
        tools._recall_conversation(mcp_client, {"conversation_id": "nope"})


def test_detect_persona_requires_query(mcp_client) -> None:
    with pytest.raises(ValueError):
        tools._detect_persona(mcp_client, {})


def test_mirror_context_returns_text_without_mutating_mirror_state(mcp_client) -> None:
    def session_count() -> int:
        return mcp_client.conn.execute("SELECT count(*) FROM runtime_sessions").fetchone()[0]

    before = session_count()
    out = tools._mirror_context(mcp_client, {})
    assert isinstance(out, str)
    # The read tool must not activate Mirror Mode or write runtime session state.
    assert session_count() == before
