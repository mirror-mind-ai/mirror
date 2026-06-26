"""Fixtures for Mirror MCP server tests."""

from pathlib import Path

import pytest

from memory import MemoryClient


@pytest.fixture
def mcp_client(tmp_path: Path) -> MemoryClient:
    """A MemoryClient backed by an isolated temporary database."""
    return MemoryClient(db_path=tmp_path / "memory.db")
