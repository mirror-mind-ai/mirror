"""Characterization for the finite DS7.TS2 legacy provider host."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from memory.extensions.compat_host import invoke


def _fixture(tmp_path: Path, hello_fixture_dir: Path) -> tuple[Path, Path]:
    home = tmp_path / "mirror"
    extension_root = home / "extensions" / "hello"
    extension_root.parent.mkdir(parents=True)
    shutil.copytree(hello_fixture_dir, extension_root)

    from memory.db.connection import get_connection
    from memory.extensions.migrations import run_migrations

    database_path = home / "memory.db"
    conn = get_connection(database_path)
    run_migrations(conn, extension_id="hello", migrations_dir=extension_root / "migrations")
    conn.execute(
        "INSERT INTO ext_hello_pings (message, created_at) VALUES (?, ?)",
        ("from legacy host", "t"),
    )
    conn.commit()
    conn.close()
    return extension_root, database_path


def _request(extension_root: Path, database_path: Path) -> dict[str, object]:
    return {
        "protocol": "mirror-context-v1",
        "extension_id": "hello",
        "capability_id": "greeting",
        "extension_root": str(extension_root),
        "table_prefix": "ext_hello_",
        "database_path": str(database_path),
        "persona_id": "engineer",
        "journey_id": "mirror-ts-core",
        "user": "fixture-user",
        "query": "fixture query",
        "binding_kind": "journey",
        "binding_target": "mirror-ts-core",
    }


def test_invokes_one_named_legacy_provider(tmp_path, hello_fixture_dir):
    extension_root, database_path = _fixture(tmp_path, hello_fixture_dir)
    assert invoke(_request(extension_root, database_path)) == "Latest ping: from legacy host"


def test_preserves_every_context_request_field(tmp_path, hello_fixture_dir):
    extension_root, database_path = _fixture(tmp_path, hello_fixture_dir)
    (extension_root / "extension.py").write_text(
        "def register(api):\n"
        "    api.register_mirror_context('greeting', _provide)\n"
        "def _provide(api, request):\n"
        "    return '|'.join([request.persona_id, request.journey_id, request.user, "
        "request.query, request.binding_kind, request.binding_target])\n"
    )

    assert invoke(_request(extension_root, database_path)) == (
        "engineer|mirror-ts-core|fixture-user|fixture query|journey|mirror-ts-core"
    )


def test_suppresses_legacy_provider_stdout_and_stderr(tmp_path, hello_fixture_dir, capsys):
    extension_root, database_path = _fixture(tmp_path, hello_fixture_dir)
    (extension_root / "extension.py").write_text(
        "import sys\n"
        "def register(api):\n"
        "    print('private registration payload')\n"
        "    api.register_mirror_context('greeting', _provide)\n"
        "def _provide(api, request):\n"
        "    print('private provider stdout')\n"
        "    print('private provider stderr', file=sys.stderr)\n"
        "    return 'safe result'\n"
    )

    assert invoke(_request(extension_root, database_path)) == "safe result"
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == ""


def test_rejects_extension_root_and_database_path_escape(tmp_path, hello_fixture_dir):
    extension_root, database_path = _fixture(tmp_path, hello_fixture_dir)
    request = _request(extension_root, database_path)
    request["extension_root"] = str(tmp_path)
    with pytest.raises(ValueError, match="extension root mismatch"):
        invoke(request)

    request = _request(extension_root, database_path)
    outside = tmp_path / "outside.db"
    outside.touch()
    request["database_path"] = str(outside)
    with pytest.raises(ValueError, match="database path mismatch"):
        invoke(request)


def test_unknown_capability_is_not_silently_substituted(tmp_path, hello_fixture_dir):
    extension_root, database_path = _fixture(tmp_path, hello_fixture_dir)
    request = _request(extension_root, database_path)
    request["capability_id"] = "missing"
    with pytest.raises(ValueError, match="unknown capability"):
        invoke(request)
