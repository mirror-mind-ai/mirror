"""Tests for journeys CLI behavior."""

from memory import MemoryClient
from memory.config import default_db_path_for_home

JOURNEY_CONTENT = """# Mirror POC
**Status:** active

## Description

Scoped journey description.
"""


def test_journeys_reads_from_explicit_mirror_home(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)

    from memory.cli.journeys import main

    main(["--mirror-home", str(mirror_home)])

    captured = capsys.readouterr()
    assert "mirror-poc" in captured.out
    assert "Scoped journey description." in captured.out


def test_journeys_renders_arbitrary_depth_under_parent(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-mind", JOURNEY_CONTENT.replace("Mirror POC", "Mirror Mind"))
    mem.set_identity(
        "journey",
        "mirror-web-console",
        JOURNEY_CONTENT.replace("Mirror POC", "Mirror Web Console"),
        metadata='{"parent_journey": "mirror-mind"}',
    )
    mem.set_identity(
        "journey",
        "workspace",
        JOURNEY_CONTENT.replace("Mirror POC", "Workspace"),
        metadata='{"parent_journey": "mirror-web-console"}',
    )
    mem.set_identity(
        "journey",
        "journey-map",
        JOURNEY_CONTENT.replace("Mirror POC", "Journey Map"),
        metadata='{"parent_journey": "workspace"}',
    )

    from memory.cli.journeys import main

    main(["--mirror-home", str(mirror_home)])

    captured = capsys.readouterr()
    assert "🚧 **mirror-mind** (active)" in captured.out
    assert "│  └─ 🚧 **mirror-web-console** (active)" in captured.out
    assert "│  │  └─ 🚧 **workspace** (active)" in captured.out
    assert "│  │  │  └─ 🚧 **journey-map** (active)" in captured.out
    assert not any(line.startswith("    ") for line in captured.out.splitlines())
    assert captured.out.index("mirror-mind") < captured.out.index("mirror-web-console")
    assert captured.out.index("mirror-web-console") < captured.out.index("workspace")
    assert captured.out.index("workspace") < captured.out.index("journey-map")


def test_journeys_shows_last_interaction_date(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = default_db_path_for_home(mirror_home)
    mem = MemoryClient(env="test", db_path=db_path)
    mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)
    mem.set_identity("journey", "idle-journey", JOURNEY_CONTENT.replace("Mirror POC", "Idle"))

    conv = mem.start_conversation("test", journey="mirror-poc")
    msg = mem.add_message(conv.id, "user", "ping")

    from memory.cli.journeys import main

    main(["--mirror-home", str(mirror_home)])

    captured = capsys.readouterr()
    expected_date = msg.created_at[:10]
    assert f"Last: {expected_date}" in captured.out
    # journey without any interaction shows a placeholder
    assert "Last: \u2014" in captured.out


def test_journeys_explicit_mirror_home_overrides_environment_selection(mocker, tmp_path, capsys):
    env_home = tmp_path / ".mirror" / "testuser"
    env_db_path = default_db_path_for_home(env_home)
    env_mem = MemoryClient(env="test", db_path=env_db_path)
    env_mem.set_identity("journey", "env-journey", JOURNEY_CONTENT.replace("Mirror POC", "Env"))

    explicit_home = tmp_path / ".mirror" / "pati"
    explicit_db_path = default_db_path_for_home(explicit_home)
    explicit_mem = MemoryClient(env="test", db_path=explicit_db_path)
    explicit_mem.set_identity("journey", "mirror-poc", JOURNEY_CONTENT)

    mocker.patch.dict("os.environ", {"MIRROR_HOME": str(env_home)}, clear=False)

    from memory.cli.journeys import main

    main(["--mirror-home", str(explicit_home)])

    captured = capsys.readouterr()
    assert "mirror-poc" in captured.out
    assert "env-journey" not in captured.out
