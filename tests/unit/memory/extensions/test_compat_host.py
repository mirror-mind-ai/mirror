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


# --- mirror-cli-v1: the command bridge (CV22.DS7.TS4 plateau 4) -------------
#
# The SECOND request kind of the same host, never a second host: D1 (2026-09-16)
# chose one Python bridge under DS10's single deletion gate. Everything the
# dispatcher itself decides -- argv splitting, the built-in verbs, the help
# guard, the installed check -- stays in TypeScript. This mode answers only the
# part that needs Python: loading the extension and running its registered
# handler.


def _cli_request(mirror_home: Path, subcommand: str, argv: list[str]) -> dict[str, object]:
    from memory.config import db_path_for_home

    return {
        "protocol": "mirror-cli-v1",
        "extension_id": "hello",
        "subcommand": subcommand,
        "argv": argv,
        "mirror_home": str(mirror_home),
        "extension_root": str(mirror_home / "extensions" / "hello"),
        "database_path": str(db_path_for_home(mirror_home)),
    }


def _cli_home(tmp_path: Path, hello_fixture_dir: Path) -> Path:
    from memory.config import db_path_for_home
    from memory.db.connection import get_connection
    from memory.extensions.migrations import run_migrations

    home = tmp_path / "mirror"
    extension_root = home / "extensions" / "hello"
    extension_root.parent.mkdir(parents=True)
    shutil.copytree(hello_fixture_dir, extension_root)
    conn = get_connection(db_path_for_home(home))
    run_migrations(conn, extension_id="hello", migrations_dir=extension_root / "migrations")
    conn.close()
    return home


def test_cli_mode_runs_the_handler_with_argv_verbatim(tmp_path, hello_fixture_dir, capsys):
    from memory.extensions.compat_host import invoke_cli

    home = _cli_home(tmp_path, hello_fixture_dir)

    assert invoke_cli(_cli_request(home, "ping", ["a b", "--flag"])) == 0
    assert capsys.readouterr().out == "ping: a b --flag\n"


def test_cli_mode_does_not_suppress_handler_output(tmp_path, hello_fixture_dir, capsys):
    """The context mode swallows streams; the command mode must not.

    For a context provider the text is the payload and stray prints corrupt the
    protocol envelope. For a command the streams ARE the product: a handler
    that prints a report and a progress line must reach the user unchanged.
    """
    from memory.extensions.compat_host import invoke_cli

    home = _cli_home(tmp_path, hello_fixture_dir)
    (home / "extensions" / "hello" / "extension.py").write_text(
        "import sys\n"
        "def register(api):\n"
        "    api.register_cli('speak', _speak)\n"
        "def _speak(api, args):\n"
        "    print('to stdout')\n"
        "    print('to stderr', file=sys.stderr)\n"
        "    return 4\n"
    )

    assert invoke_cli(_cli_request(home, "speak", [])) == 4
    captured = capsys.readouterr()
    assert captured.out == "to stdout\n"
    assert captured.err == "to stderr\n"


def test_cli_mode_answers_the_subcommand_listing(tmp_path, hello_fixture_dir, capsys):
    from memory.extensions.compat_host import invoke_cli

    home = _cli_home(tmp_path, hello_fixture_dir)

    assert invoke_cli(_cli_request(home, "--help", [])) == 0
    assert capsys.readouterr().out == (
        "=== subcommands of extension/hello ===\n"
        "  list — List recent pings\n"
        "  ping — Record a ping\n"
    )


def test_cli_mode_refuses_a_database_outside_the_named_home(tmp_path, hello_fixture_dir):
    """One database per (mirror home, environment) -- the host refuses to straddle.

    TypeScript resolves the database path and Python resolves it again from the
    home. If the two ever disagree, the handler would write to a file the front
    door never opened, and a binding written through TS would be invisible to
    the extension. The host fails closed instead.
    """
    from memory.extensions.compat_host import invoke_cli

    home = _cli_home(tmp_path, hello_fixture_dir)
    request = _cli_request(home, "ping", [])
    other = tmp_path / "elsewhere.db"
    other.touch()
    request["database_path"] = str(other)

    with pytest.raises(ValueError, match="database path mismatch"):
        invoke_cli(request)


def test_cli_mode_refuses_a_root_or_id_that_escapes_the_home(tmp_path, hello_fixture_dir):
    from memory.extensions.compat_host import invoke_cli

    home = _cli_home(tmp_path, hello_fixture_dir)

    escaping = _cli_request(home, "ping", [])
    escaping["extension_root"] = str(tmp_path)
    with pytest.raises(ValueError, match="extension root mismatch"):
        invoke_cli(escaping)

    bad_id = _cli_request(home, "ping", [])
    bad_id["extension_id"] = "../../etc"
    with pytest.raises(ValueError, match="invalid extension id"):
        invoke_cli(bad_id)


def test_cli_mode_refuses_a_context_protocol_request(tmp_path, hello_fixture_dir):
    from memory.extensions.compat_host import invoke_cli

    home = _cli_home(tmp_path, hello_fixture_dir)
    request = _cli_request(home, "ping", [])
    request["protocol"] = "mirror-context-v1"
    with pytest.raises(ValueError, match="unsupported protocol"):
        invoke_cli(request)


def test_cli_mode_refuses_non_string_argv(tmp_path, hello_fixture_dir):
    from memory.extensions.compat_host import invoke_cli

    home = _cli_home(tmp_path, hello_fixture_dir)
    request = _cli_request(home, "ping", [])
    request["argv"] = ["fine", 7]
    with pytest.raises(ValueError, match="invalid argv"):
        invoke_cli(request)


def test_cli_mode_dispatches_the_home_as_given_not_resolved(tmp_path, hello_fixture_dir):
    """A symlinked home must appear in messages as the user wrote it.

    The host validates the home RESOLVED -- that is how it refuses an escape --
    but dispatches it RAW. Resolving what the dispatcher receives would rewrite
    every path it interpolates (on macOS a home under /var is really
    /private/var), and those strings are graded parity output, not diagnostics.
    The manifest error below is the reachable one: the caller has already
    checked that the directory exists, so it is a real extension with a broken
    manifest that still names its path.
    """
    import pytest as _pytest

    from memory.cli.extensions import ExtensionValidationError
    from memory.extensions.compat_host import invoke_cli

    home = _cli_home(tmp_path, hello_fixture_dir)
    (home / "extensions" / "hello" / "skill.yaml").write_text("id: hello\n")
    link = tmp_path / "linked-home"
    link.symlink_to(home, target_is_directory=True)

    request = _cli_request(home, "ping", [])
    request["mirror_home"] = str(link)
    request["extension_root"] = str(link / "extensions" / "hello")

    with _pytest.raises(ExtensionValidationError) as failure:
        invoke_cli(request)
    assert str(failure.value) == (
        f"missing required field 'name' in {link}/extensions/hello/skill.yaml"
    )
