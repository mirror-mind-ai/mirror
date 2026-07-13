"""Tests for python -m memory ext (cmd_ext dispatcher).

These tests are integration-y by necessity: the dispatcher opens a
sqlite3.Connection against a real on-disk memory.db so the extension can
read and write through its API. Each test gets a fresh ``mirror_home``
under ``tmp_path``.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from memory.cli.ext import cmd_ext
from memory.config import db_path_for_home


@pytest.fixture
def mirror_home(tmp_path: Path, hello_fixture_dir: Path) -> Path:
    """Build a fresh mirror home with the hello fixture installed.

    Mirrors what `extensions install` will eventually do once that path
    is wired (next commit): copy the source tree into
    <mirror_home>/extensions/<id>/ and run its SQL migrations.
    """
    home = tmp_path / "mirror"
    (home / "extensions").mkdir(parents=True)
    shutil.copytree(hello_fixture_dir, home / "extensions" / "hello")

    # Apply migrations against the shared env-aware database so the
    # extension can read/write its own tables. CV9.E2.S6: the fixture must
    # bootstrap the same file the dispatcher resolves — one database per
    # (mirror home, environment).
    from memory.config import db_path_for_home
    from memory.db.connection import get_connection
    from memory.extensions.migrations import run_migrations

    conn = get_connection(db_path_for_home(home))
    try:
        run_migrations(
            conn,
            extension_id="hello",
            migrations_dir=home / "extensions" / "hello" / "migrations",
        )
    finally:
        conn.close()

    return home


def _run(args: list[str], mirror_home: Path) -> int:
    return cmd_ext([*args, "--mirror-home", str(mirror_home)])


# --- list -----------------------------------------------------------------


def test_list_shows_command_skill_extensions(mirror_home, capsys):
    rc = _run(["list"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "hello: Minimal fixture extension" in out


def test_list_with_no_extensions(tmp_path, capsys):
    home = tmp_path / "mirror"
    (home / "extensions").mkdir(parents=True)
    rc = _run(["list"], home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "(none)" in out


# --- Extension subcommand dispatch ---------------------------------------


def test_dispatches_ping_handler(mirror_home, capsys):
    rc = _run(["hello", "ping", "first message"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "ping: first message" in out


def test_dispatches_list_after_ping(mirror_home, capsys):
    _run(["hello", "ping", "alpha"], mirror_home)
    capsys.readouterr()  # discard
    _run(["hello", "ping", "beta"], mirror_home)
    capsys.readouterr()
    rc = _run(["hello", "list"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    # Most recent first.
    assert out.index("beta") < out.index("alpha")


def test_unknown_subcommand_errors_with_help(mirror_home, capsys):
    rc = _run(["hello", "nope"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 1
    assert "unknown subcommand 'nope'" in out
    # The help text follows the error.
    assert "ping" in out
    assert "list" in out


def test_no_subcommand_shows_help(mirror_home, capsys):
    rc = _run(["hello"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "subcommands of extension/hello" in out
    assert "ping" in out


def test_help_alias_shows_subcommands(mirror_home, capsys):
    rc = _run(["hello", "--help"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "subcommands of extension/hello" in out


def test_uninstalled_extension_returns_error(mirror_home, capsys):
    rc = _run(["nonexistent", "ping"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 1
    assert "not installed" in out


# --- Bindings -------------------------------------------------------------


def test_bind_persona_creates_row(mirror_home, capsys):
    rc = _run(["hello", "bind", "greeting", "--persona", "tester"], mirror_home)
    assert rc == 0
    assert "bound hello/greeting -> persona/tester" in capsys.readouterr().out

    from memory.db.connection import get_connection

    conn = get_connection(db_path_for_home(mirror_home))
    rows = conn.execute("SELECT * FROM _ext_bindings WHERE extension_id='hello'").fetchall()
    conn.close()
    assert len(rows) == 1
    assert rows[0]["target_kind"] == "persona"
    assert rows[0]["target_id"] == "tester"


def test_bind_is_idempotent(mirror_home, capsys):
    _run(["hello", "bind", "greeting", "--persona", "tester"], mirror_home)
    _run(["hello", "bind", "greeting", "--persona", "tester"], mirror_home)
    capsys.readouterr()

    from memory.db.connection import get_connection

    conn = get_connection(db_path_for_home(mirror_home))
    rows = conn.execute("SELECT * FROM _ext_bindings WHERE extension_id='hello'").fetchall()
    conn.close()
    assert len(rows) == 1


def test_bind_multiple_targets_for_same_capability(mirror_home):
    _run(["hello", "bind", "greeting", "--persona", "writer"], mirror_home)
    _run(["hello", "bind", "greeting", "--persona", "engineer"], mirror_home)

    from memory.db.connection import get_connection

    conn = get_connection(db_path_for_home(mirror_home))
    rows = conn.execute(
        "SELECT * FROM _ext_bindings WHERE extension_id='hello' ORDER BY target_id"
    ).fetchall()
    conn.close()
    assert [r["target_id"] for r in rows] == ["engineer", "writer"]


def test_unbind_removes_binding(mirror_home, capsys):
    _run(["hello", "bind", "greeting", "--persona", "tester"], mirror_home)
    capsys.readouterr()
    rc = _run(["hello", "unbind", "greeting", "--persona", "tester"], mirror_home)
    assert rc == 0
    assert "unbound hello/greeting -> persona/tester" in capsys.readouterr().out

    from memory.db.connection import get_connection

    conn = get_connection(db_path_for_home(mirror_home))
    rows = conn.execute("SELECT * FROM _ext_bindings WHERE extension_id='hello'").fetchall()
    conn.close()
    assert rows == []


def test_unbind_no_match_reports_so(mirror_home, capsys):
    rc = _run(["hello", "unbind", "greeting", "--persona", "ghost"], mirror_home)
    assert rc == 0
    assert "no matching binding" in capsys.readouterr().out


def test_bind_journey(mirror_home):
    _run(["hello", "bind", "greeting", "--journey", "eudaimon"], mirror_home)

    from memory.db.connection import get_connection

    conn = get_connection(db_path_for_home(mirror_home))
    rows = conn.execute("SELECT * FROM _ext_bindings WHERE target_kind='journey'").fetchall()
    conn.close()
    assert len(rows) == 1
    assert rows[0]["target_id"] == "eudaimon"


def test_bind_global(mirror_home):
    _run(["hello", "bind", "greeting", "--global"], mirror_home)

    from memory.db.connection import get_connection

    conn = get_connection(db_path_for_home(mirror_home))
    rows = conn.execute("SELECT * FROM _ext_bindings WHERE target_kind='global'").fetchall()
    conn.close()
    assert len(rows) == 1
    assert rows[0]["target_id"] is None


def test_bind_without_target_errors(mirror_home, capsys):
    rc = _run(["hello", "bind", "greeting"], mirror_home)
    assert rc == 1
    assert "missing target" in capsys.readouterr().out


def test_bindings_lists_known_bindings(mirror_home, capsys):
    _run(["hello", "bind", "greeting", "--persona", "writer"], mirror_home)
    _run(["hello", "bind", "greeting", "--persona", "engineer"], mirror_home)
    capsys.readouterr()

    rc = _run(["hello", "bindings"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "bindings for extension/hello" in out
    assert "greeting -> persona/engineer" in out
    assert "greeting -> persona/writer" in out


def test_bindings_empty(mirror_home, capsys):
    rc = _run(["hello", "bindings"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "no bindings" in out


# --- Migrate --------------------------------------------------------------


def test_migrate_reapplies_pending_migrations(mirror_home, capsys):
    # The fixture set-up already ran migrations once, so a re-run is a
    # no-op (zero applied).
    rc = _run(["hello", "migrate"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "applied 0 migration(s)" in out


def test_migrate_uninstalled_returns_error(mirror_home, capsys):
    rc = _run(["nope", "migrate"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 1
    assert "not installed" in out


# --- Top-level help -------------------------------------------------------


def test_empty_args_prints_usage(mirror_home, capsys):
    rc = _run([], mirror_home)
    out = capsys.readouterr().out
    assert rc == 1
    assert "Usage:" in out


def test_help_alias_prints_usage(mirror_home, capsys):
    rc = _run(["--help"], mirror_home)
    out = capsys.readouterr().out
    assert rc == 0
    assert "Usage:" in out
