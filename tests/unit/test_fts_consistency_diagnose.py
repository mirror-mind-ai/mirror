"""Runtime diagnose detects a corrupt memories_fts index (CR021, RS003)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from memory.cli.runtime import (
    CloneRole,
    CoreMigrationHealth,
    GitStatus,
    RuntimeStatusReport,
    _fts_consistency_findings,
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


def _make_fts_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        "CREATE TABLE memories (id TEXT PRIMARY KEY, title TEXT, content TEXT, context TEXT);"
        "CREATE VIRTUAL TABLE memories_fts USING fts5(title, content, context, "
        "content=memories, content_rowid=rowid);"
        "CREATE TRIGGER memories_fts_ai AFTER INSERT ON memories BEGIN "
        "INSERT INTO memories_fts(rowid, title, content, context) "
        "VALUES (new.rowid, new.title, new.content, COALESCE(new.context, '')); END;"
    )
    conn.execute("INSERT INTO memories VALUES ('m', 'hello', 'world', NULL)")
    conn.commit()
    conn.close()


def test_healthy_fts_is_quiet(tmp_path: Path) -> None:
    db = tmp_path / "memory.db"
    _make_fts_db(db)
    assert _fts_consistency_findings(_report(db)) == []


def test_corrupt_fts_raises_attention(tmp_path: Path) -> None:
    db = tmp_path / "memory.db"
    _make_fts_db(db)
    # Wipe the FTS internal index storage: any MATCH query now raises.
    conn = sqlite3.connect(db)
    conn.execute("DELETE FROM memories_fts_data")
    conn.commit()
    conn.close()

    findings = _fts_consistency_findings(_report(db))
    assert len(findings) == 1
    assert findings[0].code == "fts_corrupt"
    assert findings[0].severity == "attention"


def test_no_fts_table_is_quiet(tmp_path: Path) -> None:
    db = tmp_path / "memory.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE memories (id TEXT PRIMARY KEY)")
    conn.commit()
    conn.close()
    assert _fts_consistency_findings(_report(db)) == []
