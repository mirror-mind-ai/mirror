"""Tests for journey CLI behavior."""

import io
import json

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


def test_journey_admin_cli_round_trips_json_without_provider(tmp_path, capsys, monkeypatch):
    mirror_home = tmp_path / ".mirror" / "pati"
    mem = MemoryClient(env="test", db_path=default_db_path_for_home(mirror_home))
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)

    from memory.cli.journey import main

    main(["export-registry", "--mirror-home", str(mirror_home)])
    registry = json.loads(capsys.readouterr().out)
    monkeypatch.setattr(
        "sys.stdin",
        io.StringIO(
            json.dumps(
                {
                    "schemaVersion": "mirror.journey-mutation@1.0",
                    "requestId": "cli-request-001",
                    "expectedSourceVersion": registry["sourceVersion"],
                    "operation": "create_journey",
                    "payload": {
                        "slug": "child-poc",
                        "name": "Child POC",
                        "description": "A sufficiently detailed child Journey description.",
                        "parentId": "mirror-poc",
                        "position": 0,
                    },
                }
            )
        ),
    )
    main(["mutate", "--mirror-home", str(mirror_home)])
    result = json.loads(capsys.readouterr().out)

    assert result["registry"]["roots"][0]["children"][0]["id"] == "child-poc"
    assert result["receipt"]["operation"] == "create_journey"


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
