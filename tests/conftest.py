"""Fixtures compartilhadas para todos os testes."""

import sqlite3

import numpy as np
import pytest

from memory.db.schema import SCHEMA


@pytest.fixture(autouse=True)
def _isolate_developer_env(monkeypatch):
    """Neutralize developer-only env leaked from a personal .env.

    ``memory.config`` loads .env at import time via ``os.environ.setdefault``.
    On a developer machine, ``BACKUP_DIR`` then points at a real personal
    backup location and silently overrides the explicit ``mirror_home`` that
    backup tests pass, so those tests fail locally while passing in CI (where
    no .env exists). Clearing it makes local runs match CI.
    """
    monkeypatch.delenv("BACKUP_DIR", raising=False)


@pytest.fixture
def db_conn():
    """Conexão SQLite em memória com schema completo. Isolada por teste."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    yield conn
    conn.close()


@pytest.fixture
def store(db_conn):
    """Store com banco em memória."""
    from memory.storage.store import Store

    return Store(db_conn)


@pytest.fixture
def mock_embeddings(mocker):
    """Vetor determinístico unitário (1536-dim). Nenhuma chamada à OpenAI.

    Patched at the source module and at each service module that imports generate_embedding
    at the top level (top-level imports create a local binding that must be patched separately).
    """
    vec = np.ones(1536, dtype=np.float32) / np.sqrt(1536)
    mocker.patch("memory.intelligence.embeddings.generate_embedding", return_value=vec)
    mocker.patch("memory.intelligence.search.generate_embedding", return_value=vec)
    mocker.patch("memory.services.memory.generate_embedding", return_value=vec)
    mocker.patch("memory.services.attachment.generate_embedding", return_value=vec)
    mocker.patch("memory.services.conversation.generate_embedding", return_value=vec)
    return vec


@pytest.fixture
def mock_extraction(mocker):
    """Mocks send_to_model inside the extraction module. No real LLM calls."""
    from memory.intelligence.llm_router import LLMResponse

    mock_response = LLMResponse(
        model="google/gemini-2.5-flash-lite",
        content=(
            '[{"title":"Test insight","content":"Test content",'
            '"memory_type":"insight","layer":"ego","tags":["test"]}]'
        ),
        prompt_tokens=10,
        completion_tokens=5,
        latency_ms=50,
        prompt="[mocked prompt]",
    )
    mock_send = mocker.patch(
        "memory.intelligence.extraction.send_to_model",
        return_value=mock_response,
    )
    return mock_send
