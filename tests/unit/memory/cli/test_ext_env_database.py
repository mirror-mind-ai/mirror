"""CV9.E2.S6 — extension CLI resolves the same env-aware database as the core.

One (mirror home, MEMORY_ENV) pair maps to exactly one database file. The ext
dispatch previously pinned `<home>/memory.db` regardless of environment, which
let a single session straddle two databases (extension state in one file,
session/conversation state in another).
"""

import importlib
import os
from contextlib import contextmanager

from memory import config
from memory.cli import ext as ext_cli

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


def test_open_connection_uses_environment_database_name(tmp_path):
    mirror_home = tmp_path / "home"

    with _config_with_env(MIRROR_HOME=str(mirror_home), MEMORY_ENV="development"):
        conn = ext_cli._open_connection(mirror_home)
        conn.close()

    assert (mirror_home / "memory_dev.db").exists()
    assert not (mirror_home / "memory.db").exists()


def test_open_connection_uses_production_database_by_default(tmp_path):
    mirror_home = tmp_path / "home"

    with _config_with_env(MIRROR_HOME=str(mirror_home)):
        conn = ext_cli._open_connection(mirror_home)
        conn.close()

    assert (mirror_home / "memory.db").exists()
