"""Data-at-rest permission posture (CR031, RS005 security audit).

The mirror home holds a person's identity, memories, and conversations. The
posture is owner-only: directories 0o700, files 0o600, enforced at creation
points and *reported* (never rewritten) for pre-existing paths.
"""

import os
import sqlite3
from pathlib import Path

import pytest

from memory.cli.runtime import (
    CloneRole,
    CoreMigrationHealth,
    GitStatus,
    RuntimeStatusReport,
    _loose_permission_findings,
)
from memory.db.connection import get_connection

pytestmark = pytest.mark.skipif(os.name != "posix", reason="POSIX permission semantics")


def _mode(path: Path) -> int:
    return path.stat().st_mode & 0o777


def test_get_connection_creates_owner_only_home_and_database(tmp_path: Path) -> None:
    home = tmp_path / "created-home"
    db_path = home / "memory.db"
    conn = get_connection(db_path)
    conn.close()
    assert _mode(home) == 0o700
    assert _mode(db_path) == 0o600


def test_get_connection_leaves_preexisting_directories_alone(tmp_path: Path) -> None:
    home = tmp_path / "user-chosen"
    home.mkdir(mode=0o755)
    os.chmod(home, 0o755)
    conn = get_connection(home / "memory.db")
    conn.close()
    assert _mode(home) == 0o755  # pre-existing dir is never mutated
    assert _mode(home / "memory.db") == 0o600  # the db file is ours


def _report(mirror_home: Path, db_path: Path) -> RuntimeStatusReport:
    return RuntimeStatusReport(
        version="0.0.0",
        git=GitStatus(repository=None, branch=None, commit=None, dirty=False),
        mirror_home=mirror_home,
        mirror_home_error=None,
        db_path=db_path,
        db_exists=True,
        core_migrations=CoreMigrationHealth(ready=True, applied_count=0, known_count=0, missing=()),
        extensions=(),
        extension_health=(),
        clone_role=CloneRole("production", None),
        python_version="3",
        memory_env="test",
    )


def test_diagnose_reports_loose_permissions(tmp_path: Path) -> None:
    home = tmp_path / "home"
    home.mkdir(mode=0o755)
    os.chmod(home, 0o755)
    db = home / "memory.db"
    sqlite3.connect(db).close()
    os.chmod(db, 0o644)

    findings = _loose_permission_findings(_report(home, db))
    subjects = {(f.code, f.subject) for f in findings}
    assert ("loose_permissions", "mirror home") in subjects
    assert ("loose_permissions", "database") in subjects
    assert all(f.severity == "attention" for f in findings)
    assert all(f.repair_route.startswith("chmod ") for f in findings)


def test_diagnose_quiet_when_posture_is_owner_only(tmp_path: Path) -> None:
    home = tmp_path / "home"
    home.mkdir(mode=0o700)
    os.chmod(home, 0o700)
    db = home / "memory.db"
    sqlite3.connect(db).close()
    os.chmod(db, 0o600)

    assert _loose_permission_findings(_report(home, db)) == []
