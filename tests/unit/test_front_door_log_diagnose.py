"""Runtime diagnose surfaces recent front-door errors (CR026, RS004)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from memory.cli.runtime import (
    CloneRole,
    CoreMigrationHealth,
    GitStatus,
    RuntimeStatusReport,
    _front_door_error_findings,
)


def _report(db_path: Path) -> RuntimeStatusReport:
    return RuntimeStatusReport(
        version="0.0.0",
        git=GitStatus(repository=None, branch=None, commit=None, dirty=False),
        mirror_home=db_path.parent,
        mirror_home_error=None,
        db_path=db_path,
        db_exists=True,
        core_migrations=CoreMigrationHealth(ready=True, applied_count=0, known_count=0, missing=()),
        extensions=(),
        extension_health=(),
        clone_role=CloneRole("production", None),
        python_version="3.12.0",
        memory_env="test",
    )


def _log_line(stamp: datetime, level: str) -> str:
    return f"{stamp.isoformat()}\t{level}\tidentity\tts\texit=1\tBackupGateError"


def test_recent_error_lines_raise_an_attention_finding(tmp_path: Path) -> None:
    db_path = tmp_path / "memory.db"
    now = datetime.now(timezone.utc)
    (tmp_path / "front-door.log").write_text(
        _log_line(now - timedelta(minutes=5), "ERROR") + "\n"
        f"{now.isoformat()}\tINFO\tjourneys\tts\texit=0\t\n",
        encoding="utf-8",
    )
    findings = _front_door_error_findings(_report(db_path))
    assert len(findings) == 1
    assert findings[0].code == "front_door_errors"
    assert findings[0].severity == "attention"


def test_old_errors_and_info_lines_are_quiet(tmp_path: Path) -> None:
    db_path = tmp_path / "memory.db"
    old = datetime.now(timezone.utc) - timedelta(days=3)
    (tmp_path / "front-door.log").write_text(_log_line(old, "ERROR") + "\n", encoding="utf-8")
    assert _front_door_error_findings(_report(db_path)) == []


def test_no_log_file_is_quiet(tmp_path: Path) -> None:
    assert _front_door_error_findings(_report(tmp_path / "memory.db")) == []
