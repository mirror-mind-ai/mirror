"""Tests for the `python -m memory welcome` command."""

import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from memory import MemoryClient
from memory.cli.runtime import GitStatus, GitUpdatePlan, RuntimeUpdateAvailability, UpdateChannel
from memory.config import default_db_path_for_home

JOURNEY_ACTIVE = """# Sample journey
**Status:** active

## Description
A scoped journey.
"""

JOURNEY_PAUSED = """# Paused journey
**Status:** paused

## Description
A paused journey.
"""

PERSONA_BODY = """# Persona
A test persona.
"""


def _mem(tmp_path, user: str = "tester") -> tuple[MemoryClient, str]:
    home = tmp_path / ".mirror" / user
    mem = MemoryClient(env="test", db_path=default_db_path_for_home(home))
    return mem, str(home)


def _iso(offset: timedelta) -> str:
    return (datetime.now(timezone.utc) + offset).isoformat()


# ---------- silent states -----------------------------------------------


def test_welcome_empty_when_no_mirror_home_resolvable(monkeypatch, capsys):
    monkeypatch.delenv("MIRROR_HOME", raising=False)
    monkeypatch.delenv("MIRROR_USER", raising=False)

    from memory.cli.welcome import main

    main([])

    captured = capsys.readouterr()
    assert captured.out == ""


def test_welcome_empty_when_mirror_welcome_off(monkeypatch, tmp_path, capsys):
    _mem(tmp_path)

    monkeypatch.setenv("MIRROR_WELCOME", "off")

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "tester")])

    captured = capsys.readouterr()
    assert captured.out == ""


# ---------- structure ---------------------------------------------------


def test_welcome_has_version_stats_and_blank_before_invitation(monkeypatch, tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")
    monkeypatch.setenv("MIRROR_WELCOME_REMOTE_UPDATE_CHECK", "off")
    monkeypatch.setattr("memory.cli.welcome.package_version", lambda: "0.7.0")
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_update_channel", lambda start: UpdateChannel("stable", None)
    )
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_git",
        lambda start: GitStatus(None, None, None, None, "not a git repository"),
    )

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "alisson-vale")])

    out = capsys.readouterr().out
    lines = out.splitlines()
    assert lines[0] == "◇ Mirror · alisson-vale"
    assert lines[1] == "Version 0.7.0 · channel stable"
    # Stats line is always present, even for an empty database.
    assert "journeys" in lines[2]
    assert lines[3] == ""
    assert lines[4] == "→ Where shall we begin?"


def test_welcome_ends_with_invitation(tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "alisson-vale")])

    out = capsys.readouterr().out
    assert out.rstrip().endswith("→ Where shall we begin?")


# ---------- stats content -----------------------------------------------


def test_welcome_renders_zeroes_on_fresh_database(tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "alisson-vale")])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "journeys" in line)
    assert "0 journeys" in stats
    assert "0 personas" in stats
    assert "0 memories" in stats
    assert "0 conversations" in stats
    assert "since today" in stats


def test_welcome_counts_active_journeys_and_skips_paused(tmp_path, capsys):
    mem, home = _mem(tmp_path, user="alisson-vale")
    mem.set_identity("journey", "alpha", JOURNEY_ACTIVE)
    mem.set_identity("journey", "beta", JOURNEY_ACTIVE)
    mem.set_identity("journey", "gamma", JOURNEY_PAUSED)

    from memory.cli.welcome import main

    main(["--mirror-home", home])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "journeys" in line)
    assert "2 journeys" in stats


def test_welcome_counts_personas(tmp_path, capsys):
    mem, home = _mem(tmp_path, user="alisson-vale")
    mem.set_identity("persona", "therapist", PERSONA_BODY)
    mem.set_identity("persona", "strategist", PERSONA_BODY)
    mem.set_identity("persona", "researcher", PERSONA_BODY)

    from memory.cli.welcome import main

    main(["--mirror-home", home])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "personas" in line)
    assert "3 personas" in stats


def test_welcome_counts_memories(mocker, tmp_path, capsys):
    mocker.patch(
        "memory.services.memory.generate_embedding",
        return_value=np.zeros(1536, dtype=np.float32),
    )
    mem, home = _mem(tmp_path, user="alisson-vale")
    for i in range(4):
        mem.add_memory(
            title=f"m{i}",
            content="...",
            memory_type="insight",
            layer="self",
            journey="alpha",
        )

    from memory.cli.welcome import main

    main(["--mirror-home", home])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "memories" in line)
    assert "4 memories" in stats


def test_welcome_counts_conversations_and_renders_since_month(tmp_path, capsys):
    mem, home = _mem(tmp_path, user="alisson-vale")
    first = mem.conversations.start_conversation(interface="pi", journey="alpha")
    mem.store.update_conversation(first.id, started_at="2024-12-15T10:00:00+00:00")
    mem.conversations.start_conversation(interface="pi", journey="alpha")
    mem.conversations.start_conversation(interface="pi", journey="alpha")

    from memory.cli.welcome import main

    main(["--mirror-home", home])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "conversations" in line)
    assert "3 conversations" in stats
    assert "since Dec 2024" in stats


def test_welcome_uses_thousands_separator_above_a_thousand(mocker, tmp_path, capsys):
    mocker.patch(
        "memory.services.memory.generate_embedding",
        return_value=np.zeros(1536, dtype=np.float32),
    )
    mem, home = _mem(tmp_path, user="alisson-vale")

    # Bulk-insert via the store to keep the test fast.
    from memory.models import Memory

    for i in range(1247):
        m = Memory(
            title=f"m{i}",
            content="x",
            memory_type="insight",
            layer="self",
        )
        mem.store.create_memory(m)

    from memory.cli.welcome import main

    main(["--mirror-home", home])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "memories" in line)
    assert "1,247 memories" in stats


# ---------- order and shape --------------------------------------------


def test_welcome_stats_line_order_is_stable(tmp_path, capsys):
    mem, home = _mem(tmp_path, user="alisson-vale")
    mem.set_identity("journey", "alpha", JOURNEY_ACTIVE)
    mem.set_identity("persona", "p1", PERSONA_BODY)

    from memory.cli.welcome import main

    main(["--mirror-home", home])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "journeys" in line)
    # Order: journeys · personas · memories · conversations · since ...
    idx_j = stats.index("journeys")
    idx_p = stats.index("personas")
    idx_m = stats.index("memories")
    idx_c = stats.index("conversations")
    idx_s = stats.index("since")
    assert idx_j < idx_p < idx_m < idx_c < idx_s


def test_welcome_uses_middot_separator(tmp_path, capsys):
    mem, home = _mem(tmp_path, user="alisson-vale")
    mem.set_identity("journey", "alpha", JOURNEY_ACTIVE)

    from memory.cli.welcome import main

    main(["--mirror-home", home])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "journeys" in line)
    assert " · " in stats


@pytest.mark.parametrize(
    "month_iso, expected",
    [
        ("2024-01-01T00:00:00+00:00", "since Jan 2024"),
        ("2025-05-15T12:00:00+00:00", "since May 2025"),
        ("2026-11-30T23:59:59+00:00", "since Nov 2026"),
    ],
)
def test_welcome_since_label_formats_month_year(tmp_path, capsys, month_iso, expected):
    mem, home = _mem(tmp_path, user="alisson-vale")
    conv = mem.conversations.start_conversation(interface="pi", journey="x")
    mem.store.update_conversation(conv.id, started_at=month_iso)

    from memory.cli.welcome import main

    main(["--mirror-home", home])

    out = capsys.readouterr().out
    stats = next(line for line in out.splitlines() if "journeys" in line)
    assert expected in stats


# ---------- version and update signal -----------------------------------


def test_welcome_renders_update_available_from_local_refs(monkeypatch, tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")
    monkeypatch.setenv("MIRROR_WELCOME_REMOTE_UPDATE_CHECK", "off")
    monkeypatch.setattr("memory.cli.welcome.package_version", lambda: "0.7.0")
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_update_channel", lambda start: UpdateChannel("stable", None)
    )
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", False),
    )
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 2, True, "pull", "pull 2 commits"),
    )

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "alisson-vale")])

    out = capsys.readouterr().out
    assert "Version 0.7.0 · channel stable" in out
    assert "Update available: 2 commits behind origin/main · run runtime update" in out
    assert 'Ask Mirror: "What\'s new in the latest Mirror Mind release?"' in out


def test_welcome_does_not_render_update_line_when_refs_are_current(monkeypatch, tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")
    monkeypatch.setenv("MIRROR_WELCOME_REMOTE_UPDATE_CHECK", "off")
    monkeypatch.setattr("memory.cli.welcome.package_version", lambda: "0.7.0")
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_update_channel", lambda start: UpdateChannel("stable", None)
    )
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "abc1234", False),
    )
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_git_update_plan",
        lambda git: GitUpdatePlan("origin/main", 0, 0, True, "none", "already up to date"),
    )

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "alisson-vale")])

    out = capsys.readouterr().out
    assert "Version 0.7.0 · channel stable" in out
    assert "Update available" not in out


def test_welcome_refreshes_remote_update_cache_and_renders_version(monkeypatch, tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")
    home = tmp_path / ".mirror" / "alisson-vale"
    monkeypatch.setattr("memory.cli.welcome.package_version", lambda: "0.8.0")
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_update_channel", lambda start: UpdateChannel("stable", None)
    )
    monkeypatch.setattr(
        "memory.cli.welcome.check_runtime_update_availability",
        lambda channel=None: RuntimeUpdateAvailability(
            "0.8.0",
            "origin/stable",
            "4bdff1b",
            "fac6da3f41d6d63b173ec84b84008b425a848467",
            "update_available",
            update_channel=UpdateChannel("stable", None),
        ),
    )
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_git",
        lambda start: GitStatus(tmp_path, "main", "4bdff1b", False),
    )
    monkeypatch.setattr(
        "memory.cli.welcome._run_git",
        lambda args, *, cwd: (
            0,
            "fac6da3f41d6d63b173ec84b84008b425a848467\trefs/tags/v0.9.0",
            "",
        ),
    )

    from memory.cli.welcome import main

    main(["--mirror-home", str(home)])

    out = capsys.readouterr().out
    assert "Update available: v0.9.0" in out
    assert 'Ask: "what changed?" or "update my Mirror"' in out
    cache = json.loads((home / "runtime" / "update-check.json").read_text(encoding="utf-8"))
    assert cache["availability"] == "update_available"
    assert cache["version"] == "v0.9.0"


def test_welcome_uses_fresh_cache_without_remote_check(monkeypatch, tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")
    home = tmp_path / ".mirror" / "alisson-vale"
    cache_path = home / "runtime" / "update-check.json"
    cache_path.parent.mkdir(parents=True)
    cache_path.write_text(
        json.dumps(
            {
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "channel": "stable",
                "availability": "update_available",
                "current_commit": "abc",
                "remote_commit": "def",
                "version": "v0.9.0",
                "title": "Self-Update Done",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("memory.cli.welcome.package_version", lambda: "0.8.0")
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_update_channel", lambda start: UpdateChannel("stable", None)
    )
    called: list[bool] = []
    monkeypatch.setattr(
        "memory.cli.welcome.check_runtime_update_availability",
        lambda channel=None: called.append(True),
    )

    from memory.cli.welcome import main

    main(["--mirror-home", str(home)])

    assert called == []
    assert "Update available: v0.9.0 — Self-Update Done" in capsys.readouterr().out


def test_welcome_remote_check_can_be_disabled(monkeypatch, tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")
    monkeypatch.setenv("MIRROR_WELCOME_REMOTE_UPDATE_CHECK", "off")
    monkeypatch.setattr("memory.cli.welcome.package_version", lambda: "0.8.0")
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_update_channel", lambda start: UpdateChannel("stable", None)
    )
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_git",
        lambda start: GitStatus(None, None, None, None, "not a git repository"),
    )
    called: list[bool] = []
    monkeypatch.setattr(
        "memory.cli.welcome.check_runtime_update_availability",
        lambda channel=None: called.append(True),
    )

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "alisson-vale")])

    assert called == []
    assert "Update available" not in capsys.readouterr().out


def test_welcome_remote_check_fails_softly(monkeypatch, tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")
    monkeypatch.setattr("memory.cli.welcome.package_version", lambda: "0.8.0")
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_update_channel", lambda start: UpdateChannel("stable", None)
    )
    monkeypatch.setattr(
        "memory.cli.welcome.check_runtime_update_availability",
        lambda channel=None: (_ for _ in ()).throw(RuntimeError("network down")),
    )
    monkeypatch.setattr(
        "memory.cli.welcome.inspect_git",
        lambda start: GitStatus(None, None, None, None, "not a git repository"),
    )

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "alisson-vale")])

    out = capsys.readouterr().out
    assert "◇ Mirror · alisson-vale" in out
    assert "Update check" not in out


def test_welcome_status_line_reads_cache_only(monkeypatch, tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")
    home = tmp_path / ".mirror" / "alisson-vale"
    cache_path = home / "runtime" / "update-check.json"
    cache_path.parent.mkdir(parents=True)
    cache_path.write_text(
        json.dumps(
            {
                "checked_at": datetime.now(timezone.utc).isoformat(),
                "channel": "stable",
                "availability": "update_available",
                "current_commit": "abc",
                "remote_commit": "def",
                "version": "v0.9.0",
            }
        ),
        encoding="utf-8",
    )
    called: list[bool] = []
    monkeypatch.setattr(
        "memory.cli.welcome.check_runtime_update_availability",
        lambda channel=None: called.append(True),
    )

    from memory.cli.welcome import main

    main(["--mirror-home", str(home), "--status-line"])

    assert called == []
    assert capsys.readouterr().out.strip() == "◇ alisson-vale · ⬆ v0.9.0"


def test_welcome_status_line_healthy_without_cache(tmp_path, capsys):
    _mem(tmp_path, user="alisson-vale")

    from memory.cli.welcome import main

    main(["--mirror-home", str(tmp_path / ".mirror" / "alisson-vale"), "--status-line"])

    assert capsys.readouterr().out.strip() == "◇ alisson-vale · ✓"
