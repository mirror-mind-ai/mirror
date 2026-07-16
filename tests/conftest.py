"""Fixtures compartilhadas para todos os testes."""

import sqlite3

import numpy as np
import pytest

from memory.db.schema import SCHEMA


@pytest.fixture(autouse=True)
def _isolate_developer_env(monkeypatch):
    """Neutralize developer-only env leaked from a personal .env.

    ``memory.config`` loads .env at import time via ``os.environ.setdefault``.
    On a developer machine this leaks values that make local runs diverge from
    CI (which has no .env):

    - ``BACKUP_DIR`` points at a real personal backup location and silently
      overrides the explicit ``mirror_home`` that backup tests pass.
    - ``MEMORY_ENV=development`` switches the resolved database name to
      ``memory_dev.db``; CI resolves the production default ``memory.db``.
      Any test that exercises env-aware database resolution without managing
      the environment itself would then pass in one place and fail in the
      other (e.g. the extension install path once its migration step became
      env-aware).

    Clearing both makes local runs match CI. Tests that need a specific
    environment set it explicitly and reload ``memory.config`` (see
    tests/unit/memory/cli/test_ext_env_database.py).
    """
    monkeypatch.delenv("BACKUP_DIR", raising=False)
    monkeypatch.delenv("MEMORY_ENV", raising=False)
    # config.MEMORY_ENV was already computed at import time from the leaked
    # .env; delenv alone cannot undo that. Pin the module global to the CI
    # default so env-aware resolvers (db_name_for_env / db_path_for_home)
    # agree with CI for tests that do not manage the environment themselves.
    monkeypatch.setattr("memory.config.MEMORY_ENV", "production")


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
