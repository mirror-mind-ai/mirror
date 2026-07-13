"""Integration tests for MemoryClient and path configuration."""

import importlib
import os
from contextlib import contextmanager
from unittest.mock import MagicMock

from memory import config
from memory.client import MemoryClient

_CONFIG_ENV_KEYS = (
    "DB_BACKUP_PATH",
    "DB_PATH",
    "MEMORY_DIR",
    "MEMORY_ENV",
    "MEMORY_PROD_DIR",
    "MIRROR_HOME",
    "MIRROR_USER",
)


@contextmanager
def _config_with_env(**env):
    original_env = {key: os.environ[key] for key in _CONFIG_ENV_KEYS if key in os.environ}
    try:
        for key in _CONFIG_ENV_KEYS:
            os.environ[key] = ""
        for key, value in env.items():
            os.environ[key] = value
        yield importlib.reload(config)
    finally:
        for key in _CONFIG_ENV_KEYS:
            os.environ.pop(key, None)
            if key in original_env:
                os.environ[key] = original_env[key]
        importlib.reload(config)


def test_client_raises_actionable_error_without_home_or_overrides(mocker):
    """CV9.E2.S6: no silent homes-root fallback — unconfigured clients fail loudly."""
    mocker.patch("memory.client.get_connection", return_value=MagicMock())

    with _config_with_env():
        try:
            MemoryClient()
            raise AssertionError("Expected MemoryClient() to fail without a mirror home")
        except ValueError as exc:
            assert "MIRROR_HOME" in str(exc)
            assert "MIRROR_USER" in str(exc)


def test_client_uses_configured_db_path_when_env_is_not_explicit(mocker, tmp_path):
    configured_db_path = tmp_path / "configured.db"
    get_connection = mocker.patch("memory.client.get_connection", return_value=MagicMock())

    with _config_with_env(DB_PATH=str(configured_db_path)):
        client = MemoryClient()

    assert client.db_path == configured_db_path
    get_connection.assert_called_once_with(configured_db_path)


def test_client_uses_env_specific_default_when_env_is_explicit(mocker, tmp_path):
    configured_db_path = tmp_path / "configured.db"
    get_connection = mocker.patch("memory.client.get_connection", return_value=MagicMock())

    mirror_home = tmp_path / ".mirror-minds" / "testuser"

    with _config_with_env(DB_PATH=str(configured_db_path), MIRROR_HOME=str(mirror_home)) as cfg:
        expected_db_path = cfg.db_path_for_env("test")
        client = MemoryClient(env="test")

    assert client.env == "test"
    assert client.db_path == expected_db_path
    assert client.db_path != configured_db_path
    get_connection.assert_called_once_with(expected_db_path)


def test_client_uses_db_path_for_current_memory_env(mocker, tmp_path):
    memory_dir = tmp_path / "memory"
    get_connection = mocker.patch("memory.client.get_connection", return_value=MagicMock())

    with _config_with_env(MEMORY_ENV="development", MEMORY_DIR=str(memory_dir)) as cfg:
        expected_db_path = cfg.DB_PATH
        client = MemoryClient()

    assert client.env == "development"
    assert client.db_path == expected_db_path
    assert client.db_path == memory_dir / "memory_dev.db"
    get_connection.assert_called_once_with(memory_dir / "memory_dev.db")


def test_client_uses_mirror_home_db_path_by_default_in_production(mocker, tmp_path):
    mirror_home = tmp_path / ".mirror" / "testuser"
    get_connection = mocker.patch("memory.client.get_connection", return_value=MagicMock())

    with _config_with_env(MIRROR_HOME=str(mirror_home)):
        client = MemoryClient()

    assert client.env == "production"
    assert client.db_path == mirror_home / "memory.db"
    get_connection.assert_called_once_with(mirror_home / "memory.db")


def test_client_uses_explicit_db_path_even_when_env_is_provided(mocker, tmp_path):
    explicit_db_path = tmp_path / "explicit.db"
    get_connection = mocker.patch("memory.client.get_connection", return_value=MagicMock())

    with _config_with_env(MEMORY_ENV="development", MEMORY_DIR=str(tmp_path / "memory")):
        client = MemoryClient(env="test", db_path=explicit_db_path)

    assert client.env == "test"
    assert client.db_path == explicit_db_path
    get_connection.assert_called_once_with(explicit_db_path)
