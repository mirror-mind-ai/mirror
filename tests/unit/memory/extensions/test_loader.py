"""Tests for the command-skill extension loader."""

from __future__ import annotations

import pytest

from memory.cli.extensions import ExtensionValidationError
from memory.extensions.errors import ExtensionLoadError
from memory.extensions.loader import load_extension


def test_load_extension_returns_api_with_populated_registries(db_conn, hello_fixture_dir):
    # The fixture's migrations need to run before extension.py touches the
    # ext_hello_pings table; loader does not run migrations itself.
    from memory.extensions.migrations import run_migrations

    run_migrations(
        db_conn,
        extension_id="hello",
        migrations_dir=hello_fixture_dir / "migrations",
    )

    api = load_extension(hello_fixture_dir, connection=db_conn)

    assert api.extension_id == "hello"
    assert api.table_prefix == "ext_hello_"
    assert set(api.cli_registry.keys()) == {"ping", "list"}
    assert set(api.context_registry.keys()) == {"greeting"}
    assert api.journey_projections.extension_id == "hello"


def test_loader_passes_projection_service_into_bound_facade(db_conn, hello_fixture_dir):
    class StubProjectionService:
        def inspect(self, journey_id, namespace, projection, *, domain):
            return (journey_id, namespace, projection, domain)

    api = load_extension(
        hello_fixture_dir,
        connection=db_conn,
        journey_projection_service=StubProjectionService(),  # type: ignore[arg-type]
        reload=True,
    )

    assert api.journey_projections.inspect("synthetic-journey", "tactical") == (
        "synthetic-journey",
        "hello",
        "tactical",
        "extension",
    )


def test_load_extension_is_idempotent_within_a_process(db_conn, hello_fixture_dir):
    first = load_extension(hello_fixture_dir, connection=db_conn)
    second = load_extension(hello_fixture_dir, connection=db_conn)
    assert first is second


def test_load_extension_can_force_reload(db_conn, hello_fixture_dir):
    first = load_extension(hello_fixture_dir, connection=db_conn)
    second = load_extension(hello_fixture_dir, connection=db_conn, reload=True)
    assert first is not second
    # Same shape though.
    assert set(second.cli_registry.keys()) == set(first.cli_registry.keys())


def test_load_extension_rejects_prompt_skill(db_conn, tmp_path):
    ext_dir = tmp_path / "prompt-only"
    ext_dir.mkdir()
    (ext_dir / "SKILL.md").write_text("# prompt skill\n")
    (ext_dir / "skill.yaml").write_text(
        "id: prompt-only\n"
        "name: Prompt Only\n"
        "category: extension\n"
        "kind: prompt-skill\n"
        "summary: Pure prompt skill\n"
        "runtimes:\n"
        "  pi:\n"
        "    command_name: ext-prompt-only\n"
        "    skill_file: SKILL.md\n"
    )

    with pytest.raises(ExtensionValidationError) as excinfo:
        load_extension(ext_dir, connection=db_conn)
    assert "command-skill" in str(excinfo.value)


def test_load_extension_raises_when_register_missing(db_conn, tmp_path):
    ext_dir = tmp_path / "no-register"
    ext_dir.mkdir()
    (ext_dir / "extension.py").write_text("# no register function here\n")
    (ext_dir / "skill.yaml").write_text(
        "id: no-register\n"
        "name: No Register\n"
        "category: extension\n"
        "kind: command-skill\n"
        "summary: Module without register\n"
        "entrypoint:\n"
        "  module: extension\n"
        "runtimes:\n"
        "  pi:\n"
        "    command_name: ext-no-register\n"
    )

    with pytest.raises(ExtensionLoadError) as excinfo:
        load_extension(ext_dir, connection=db_conn)
    assert "register" in str(excinfo.value)


def test_load_extension_wraps_register_failure(db_conn, tmp_path):
    ext_dir = tmp_path / "boom"
    ext_dir.mkdir()
    (ext_dir / "extension.py").write_text(
        "def register(api):\n    raise RuntimeError('boom on purpose')\n"
    )
    (ext_dir / "skill.yaml").write_text(
        "id: boom\n"
        "name: Boom\n"
        "category: extension\n"
        "kind: command-skill\n"
        "summary: Extension whose register raises\n"
        "entrypoint:\n"
        "  module: extension\n"
        "runtimes:\n"
        "  pi:\n"
        "    command_name: ext-boom\n"
    )

    with pytest.raises(ExtensionLoadError) as excinfo:
        load_extension(ext_dir, connection=db_conn)
    assert "boom on purpose" in str(excinfo.value)
    assert excinfo.value.extension_id == "boom"


def test_load_extension_wraps_import_failure(db_conn, tmp_path):
    ext_dir = tmp_path / "syntax-err"
    ext_dir.mkdir()
    (ext_dir / "extension.py").write_text("def register(api:  # bad syntax\n")
    (ext_dir / "skill.yaml").write_text(
        "id: syntax-err\n"
        "name: Syntax Error\n"
        "category: extension\n"
        "kind: command-skill\n"
        "summary: Module that fails to import\n"
        "entrypoint:\n"
        "  module: extension\n"
        "runtimes:\n"
        "  pi:\n"
        "    command_name: ext-syntax-err\n"
    )

    with pytest.raises(ExtensionLoadError):
        load_extension(ext_dir, connection=db_conn)


def test_loaded_extension_can_actually_execute_its_handler(db_conn, hello_fixture_dir):
    from memory.extensions.migrations import run_migrations

    run_migrations(
        db_conn,
        extension_id="hello",
        migrations_dir=hello_fixture_dir / "migrations",
    )

    api = load_extension(hello_fixture_dir, connection=db_conn)
    ping = api.cli_registry["ping"]
    rc = ping(api, ["from", "the", "test"])
    assert rc == 0

    row = db_conn.execute("SELECT message FROM ext_hello_pings ORDER BY id DESC LIMIT 1").fetchone()
    assert row["message"] == "from the test"


def test_loaded_extension_context_provider_returns_text(db_conn, hello_fixture_dir):
    from memory.extensions.api import ContextRequest
    from memory.extensions.migrations import run_migrations

    run_migrations(
        db_conn,
        extension_id="hello",
        migrations_dir=hello_fixture_dir / "migrations",
    )
    api = load_extension(hello_fixture_dir, connection=db_conn)
    # Seed a ping so the provider has something to say.
    api.cli_registry["ping"](api, ["alive"])

    provider = api.context_registry["greeting"]
    out = provider(
        api,
        ContextRequest(
            persona_id="tester",
            journey_id=None,
            user="test-user",
            query=None,
            binding_kind="persona",
            binding_target="tester",
        ),
    )
    assert out == "Latest ping: alive"


# --- CV14.E2.S2: loader exposes extension root on sys.path -----------


def test_loader_makes_src_imports_work_without_prelude(db_conn, with_src_fixture_dir):
    """`extension.py` does `from src.greet import hello` with no
    `sys.path` manipulation of its own. The loader is expected to
    insert the extension directory on `sys.path` before exec'ing the
    module so the import resolves to the extension's own `src/` package.
    """
    from memory.extensions.migrations import run_migrations

    run_migrations(
        db_conn,
        extension_id="with-src",
        migrations_dir=with_src_fixture_dir / "migrations",
    )
    # No prelude in extension.py; if the loader does not arrange for
    # `src` to be importable, exec_module raises ModuleNotFoundError
    # and load_extension wraps it as ExtensionLoadError.
    api = load_extension(with_src_fixture_dir, connection=db_conn)
    say = api.cli_registry["say"]
    rc = say(api, [])
    assert rc == 0


def test_loader_keeps_sys_path_insertion_idempotent(db_conn, with_src_fixture_dir):
    """Loading the same extension twice must not stack duplicate entries
    on `sys.path`. The loader inserts the extension root only when it
    is not already present.
    """
    import sys

    extension_root_str = str(with_src_fixture_dir.resolve())

    load_extension(with_src_fixture_dir, connection=db_conn)
    first_count = sys.path.count(extension_root_str)
    load_extension(with_src_fixture_dir, connection=db_conn, reload=True)
    second_count = sys.path.count(extension_root_str)
    assert first_count == 1
    assert second_count == 1
