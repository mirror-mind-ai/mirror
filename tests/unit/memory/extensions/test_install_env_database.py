"""Extension install/uninstall resolve the env-aware database.

Companion to tests/unit/memory/cli/test_ext_env_database.py, which pins the
same (mirror home, MEMORY_ENV) -> one database rule for the ``ext <id> <cmd>``
dispatch path. The install path previously hardcoded ``<home>/memory.db`` for
its migration + register step (and uninstall for its binding sweep), so in any
non-production environment it wrote extension tables into — and swept bindings
from — a database the runtime never reads.
"""

from __future__ import annotations

import importlib
import os
import shutil
from contextlib import contextmanager
from pathlib import Path

import pytest

from memory import config
from memory.cli.extensions import install_extension, uninstall_extension
from memory.db.connection import get_connection

_CONFIG_ENV_KEYS = (
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


@pytest.fixture
def source_root(tmp_path: Path, hello_fixture_dir: Path) -> Path:
    root = tmp_path / "sources"
    root.mkdir()
    shutil.copytree(hello_fixture_dir, root / "hello")
    return root


def _hello_table_exists(db_path: Path) -> bool:
    conn = get_connection(db_path)
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='ext_hello_pings'"
        ).fetchall()
    finally:
        conn.close()
    return len(rows) == 1


def test_install_applies_migrations_to_development_database(source_root, tmp_path):
    mirror_home = tmp_path / "home"

    with _config_with_env(MIRROR_HOME=str(mirror_home), MEMORY_ENV="development"):
        install_extension("hello", source_root=source_root, mirror_home=mirror_home)

    assert (mirror_home / "memory_dev.db").exists()
    assert _hello_table_exists(mirror_home / "memory_dev.db")
    assert not (mirror_home / "memory.db").exists()


def test_install_applies_migrations_to_production_database_by_default(source_root, tmp_path):
    mirror_home = tmp_path / "home"

    with _config_with_env(MIRROR_HOME=str(mirror_home)):
        install_extension("hello", source_root=source_root, mirror_home=mirror_home)

    assert (mirror_home / "memory.db").exists()
    assert _hello_table_exists(mirror_home / "memory.db")


def test_uninstall_sweeps_bindings_from_development_database(source_root, tmp_path):
    mirror_home = tmp_path / "home"

    with _config_with_env(MIRROR_HOME=str(mirror_home), MEMORY_ENV="development"):
        install_extension("hello", source_root=source_root, mirror_home=mirror_home)

        conn = get_connection(mirror_home / "memory_dev.db")
        conn.execute(
            "INSERT INTO _ext_bindings VALUES (?, ?, ?, ?, ?)",
            ("hello", "greeting", "persona", "tester", "2026-05-11T00:00:00Z"),
        )
        conn.commit()
        conn.close()

        result = uninstall_extension("hello", mirror_home=mirror_home)

    assert result["bindings_removed"] == 1
