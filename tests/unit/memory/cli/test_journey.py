"""Tests for journey CLI behavior."""

import io
import json

import pytest

from memory import MemoryClient
from memory.config import default_db_path_for_home

JOURNEY_CONTENT = """# Mirror POC
**Status:** active

## Description

Scoped journey description.
"""


def test_journey_status_reads_from_explicit_mirror_home(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)
    mem.set_journey_path("mirror-poc", "# Journey path")
    mem.add_message(
        mem.start_conversation("cli", journey="mirror-poc", title="Scoped conversation").id,
        "user",
        "hello",
    )

    from memory.cli.journey import main

    main(["status", "mirror-poc", "--mirror-home", str(mirror_home)])

    captured = capsys.readouterr()
    assert "=== journey: mirror-poc ===" in captured.out
    assert "Scoped journey description." in captured.out
    assert "Scoped conversation" in captured.out


def test_journey_set_path_uses_journey_service(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)
    project_path = tmp_path / "project"

    from memory.cli.journey import main

    main(["set-path", "mirror-poc", str(project_path), "--mirror-home", str(mirror_home)])

    captured = capsys.readouterr()
    assert "project_path set" in captured.err
    assert captured.out.strip() == str(project_path.resolve())
    assert mem.journeys.get_project_path("mirror-poc") == str(project_path.resolve())


@pytest.mark.parametrize("verb", ["export-registry", "mutate"])
def test_retired_admin_verbs_are_not_dispatched_and_never_read_stdin(
    verb, tmp_path, capsys, monkeypatch
):
    """CV22.DS10.TS4 / CR089: the two admin verbs are gone from the dispatcher.

    They now fall to the status read, which treats the verb as a slug -- the
    long-standing Python behavior this story deliberately did NOT change
    (CR095, after TS5). What matters here is the pair of properties the
    deletion owes: no JourneyAdminService is reachable, and `mutate` cannot
    consume stdin, because there is no code left to read it.
    """
    mirror_home = tmp_path / ".mirror" / "pati"
    mem = MemoryClient(env="test", db_path=default_db_path_for_home(mirror_home))
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)

    stdin = io.StringIO('{"operation": "create_journey"}')
    monkeypatch.setattr("sys.stdin", stdin)

    from memory.cli.journey import main

    main([verb, "--mirror-home", str(mirror_home)])

    assert f"=== journey: {verb} ===" in capsys.readouterr().out
    assert stdin.tell() == 0, "the retired write verb must not consume stdin"
    assert not hasattr(mem, "journey_admin")


def test_journey_update_explicit_mirror_home_overrides_environment_selection(
    mocker, tmp_path, capsys
):
    env_home = tmp_path / ".mirror" / "testuser"
    env_db_path = default_db_path_for_home(env_home)
    env_mem = MemoryClient(env="test", db_path=env_db_path)
    env_mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)

    explicit_home = tmp_path / ".mirror" / "pati"
    explicit_db_path = default_db_path_for_home(explicit_home)
    explicit_mem = MemoryClient(env="test", db_path=explicit_db_path)
    explicit_mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)

    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)

    from memory.cli.journey import main

    main(["update", "mirror-poc", "# Explicit path", "--mirror-home", str(explicit_home)])

    captured = capsys.readouterr()
    assert "updated" in captured.err
    assert explicit_mem.get_journey_path("mirror-poc") == "# Explicit path"
    assert env_mem.get_journey_path("mirror-poc") is None


# --- CR073: journey update refuses a mistyped stdin sentinel ---------------
#
# The stdin sentinel is exactly "-". The usage string used to read
# "<content|-stdin>", which a caller (a model, in the 2026-09-09 incident) can
# follow literally -- storing the six characters "-stdin" as the journey path,
# discarding the piped document, and printing success. The guard refuses
# FLAG-SHAPED input (^--?[A-Za-z]) and nothing else: four of six journey-path
# rows in the real database carry markdown lists, so "- item" must stay valid.


def _updater(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)
    mem.set_journey_path("mirror-poc", "# Before")
    from memory.cli.journey import main

    def run(content: str):
        main(["update", "mirror-poc", content, "--mirror-home", str(mirror_home)])

    def current() -> str:
        return mem.get_journey_status("mirror-poc")["mirror-poc"]["journey_path"]

    return run, current


@pytest.mark.parametrize("bad", ["-stdin", "--stdin", "-s", "--content"])
def test_journey_update_refuses_flag_shaped_content(tmp_path, capsys, bad):
    run, current = _updater(tmp_path)
    with pytest.raises(SystemExit) as exit_info:
        run(bad)
    assert exit_info.value.code == 1
    err = capsys.readouterr().err
    assert bad in err and "'-'" in err, err
    assert current() == "# Before"


@pytest.mark.parametrize("empty", ["", "   ", "\n"])
def test_journey_update_refuses_empty_content(tmp_path, capsys, empty):
    run, current = _updater(tmp_path)
    with pytest.raises(SystemExit) as exit_info:
        run(empty)
    assert exit_info.value.code == 1
    assert "empty" in capsys.readouterr().err
    assert current() == "# Before"


@pytest.mark.parametrize(
    "good",
    ["- phase 1\n- phase 2", "— em-dash lead", "DS7 — Command Burn-Down (11/15)"],
)
def test_journey_update_accepts_list_shaped_and_ordinary_content(tmp_path, capsys, good):
    run, current = _updater(tmp_path)
    run(good)
    assert "updated" in capsys.readouterr().err
    assert current() == good


def test_journey_update_dash_sentinel_still_reads_stdin(tmp_path, capsys, monkeypatch):
    run, current = _updater(tmp_path)
    monkeypatch.setattr("sys.stdin", io.StringIO("# From stdin\n"))
    run("-")
    assert current() == "# From stdin\n"


def test_journey_update_usage_names_the_sentinel_unambiguously(capsys):
    from memory.cli.journey import main

    with pytest.raises(SystemExit):
        main(["update", "only-a-slug"])
    err = capsys.readouterr().err
    assert "-stdin" not in err
    assert "'-'" in err
