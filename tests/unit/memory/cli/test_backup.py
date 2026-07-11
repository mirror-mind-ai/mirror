"""Testes unitários para backup do banco de memória."""

import zipfile
from datetime import datetime, timedelta

from memory.cli.backup import RETENTION_DAYS, backup, main, resolve_backup_dir


class TestResolveBackupDir:
    def test_explicit_path_wins_over_mirror_home_and_default(self, tmp_path):
        explicit = tmp_path / "explicit"
        result = resolve_backup_dir(
            db_backup_path=explicit,
            mirror_home=tmp_path / "home",
            default_backup_path=tmp_path / "default",
        )
        assert result == explicit

    def test_mirror_home_default_used_when_no_explicit_path(self, tmp_path):
        home = tmp_path / "home"
        result = resolve_backup_dir(
            db_backup_path=None,
            mirror_home=home,
            default_backup_path=tmp_path / "default",
        )
        assert result == home / "backups"

    def test_global_default_used_when_no_path_and_no_mirror_home(self, tmp_path):
        default = tmp_path / "default"
        result = resolve_backup_dir(
            db_backup_path=None,
            mirror_home=None,
            default_backup_path=default,
        )
        assert result == default


def test_backup_reads_from_db_path_and_writes_to_db_backup_path(tmp_path):
    db_path = tmp_path / "memory.db"
    db_path.write_text("db content")
    db_backup_path = tmp_path / "backups"

    result = backup(silent=True, db_path=db_path, db_backup_path=db_backup_path)

    assert result is not None
    assert result.parent == db_backup_path
    assert result.name.startswith("memory_")
    assert result.suffix == ".zip"
    with zipfile.ZipFile(result) as zf:
        assert zf.read("memory.db") == b"db content"


def test_backup_includes_sqlite_wal_and_shm_files_when_present(tmp_path):
    db_path = tmp_path / "memory.db"
    db_path.write_text("db content")
    db_path.with_name("memory.db-wal").write_text("wal content")
    db_path.with_name("memory.db-shm").write_text("shm content")

    result = backup(silent=True, db_path=db_path, db_backup_path=tmp_path / "backups")

    assert result is not None
    with zipfile.ZipFile(result) as zf:
        assert zf.read("memory.db-wal") == b"wal content"
        assert zf.read("memory.db-shm") == b"shm content"


def test_backup_reports_user_scope_when_mirror_home_is_provided(tmp_path, capsys):
    mirror_home = tmp_path / ".mirror" / "testuser"
    db_path = mirror_home / "memory.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db_path.write_text("db content")
    db_backup_path = mirror_home / "backups"

    result = backup(
        silent=False,
        db_path=db_path,
        db_backup_path=db_backup_path,
        mirror_home=mirror_home,
    )

    assert result is not None
    captured = capsys.readouterr()
    assert f"Mirror home: {mirror_home}" in captured.out
    assert f"Database: {db_path}" in captured.out


def test_backup_derives_db_and_backup_paths_from_explicit_mirror_home(tmp_path, monkeypatch):
    monkeypatch.delenv("BACKUP_DIR", raising=False)
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = mirror_home / "memory.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db_path.write_text("db content")

    result = backup(silent=True, mirror_home=mirror_home)

    assert result is not None
    assert result.parent == mirror_home / "backups"
    with zipfile.ZipFile(result) as zf:
        assert zf.read("memory.db") == b"db content"


def test_backup_explicit_mirror_home_overrides_config_defaults(tmp_path, monkeypatch):
    monkeypatch.delenv("BACKUP_DIR", raising=False)
    env_home = tmp_path / ".mirror" / "testuser"
    env_db_path = env_home / "memory.db"
    env_db_path.parent.mkdir(parents=True, exist_ok=True)
    env_db_path.write_text("env db content")

    explicit_home = tmp_path / ".mirror" / "pati"
    explicit_db_path = explicit_home / "memory.db"
    explicit_db_path.parent.mkdir(parents=True, exist_ok=True)
    explicit_db_path.write_text("explicit db content")

    result = backup(silent=True, mirror_home=explicit_home)

    assert result is not None
    assert result.parent == explicit_home / "backups"
    with zipfile.ZipFile(result) as zf:
        assert zf.read("memory.db") == b"explicit db content"


def test_backup_ignores_backup_dir_env_and_uses_mirror_home_default(tmp_path, monkeypatch):
    # After the demote, backup() never consults BACKUP_DIR: an explicit
    # mirror_home always wins over the deprecated process-global env var.
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "custom_backups"))

    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = mirror_home / "memory.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db_path.write_text("db content")

    result = backup(silent=True, mirror_home=mirror_home)

    assert result is not None
    assert result.parent == mirror_home / "backups"


def test_backup_explicit_db_backup_path_wins_over_mirror_home(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"
    db_path = mirror_home / "memory.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db_path.write_text("db content")
    explicit = tmp_path / "chosen"

    result = backup(silent=True, mirror_home=mirror_home, db_backup_path=explicit)

    assert result is not None
    assert result.parent == explicit


def test_backup_returns_none_when_database_does_not_exist(tmp_path):
    db_backup_path = tmp_path / "backups"

    result = backup(silent=True, db_path=tmp_path / "missing.db", db_backup_path=db_backup_path)

    assert result is None
    assert not db_backup_path.exists()


def test_backup_returns_none_when_explicit_mirror_home_has_no_database(tmp_path):
    mirror_home = tmp_path / ".mirror" / "testuser"

    result = backup(silent=True, mirror_home=mirror_home)

    assert result is None
    assert not (mirror_home / "backups").exists()


def _make_mirror_home_with_db(tmp_path):
    mirror_home = tmp_path / ".mirror" / "vinicius"
    db_path = mirror_home / "memory.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db_path.write_text("db content")
    return mirror_home


def test_main_backup_dir_flag_redirects_intentionally(tmp_path, monkeypatch):
    monkeypatch.delenv("BACKUP_DIR", raising=False)
    mirror_home = _make_mirror_home_with_db(tmp_path)
    chosen = tmp_path / "chosen"
    monkeypatch.setattr(
        "sys.argv",
        [
            "memory backup",
            "--mirror-home",
            str(mirror_home),
            "--backup-dir",
            str(chosen),
            "--silent",
        ],
    )

    main()

    archives = list(chosen.glob("memory_*.zip"))
    assert len(archives) == 1


def test_main_warns_and_uses_mirror_home_when_backup_dir_env_set(tmp_path, monkeypatch, capsys):
    mirror_home = _make_mirror_home_with_db(tmp_path)
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "dropbox"))
    monkeypatch.setattr(
        "sys.argv",
        ["memory backup", "--mirror-home", str(mirror_home), "--silent"],
    )

    main()

    err = capsys.readouterr().err
    assert "BACKUP_DIR" in err
    assert "--backup-dir" in err
    assert list((mirror_home / "backups").glob("memory_*.zip"))
    assert not (tmp_path / "dropbox").exists()


def test_backup_removes_backups_older_than_retention_window(tmp_path):
    db_path = tmp_path / "memory.db"
    db_path.write_text("db content")
    db_backup_path = tmp_path / "backups"
    db_backup_path.mkdir()
    old_timestamp = datetime.now() - timedelta(days=RETENTION_DAYS + 1)
    old_backup = db_backup_path / f"memory_{old_timestamp:%Y%m%d_%H%M%S}.zip"
    old_backup.write_text("old backup")
    invalid_name = db_backup_path / "memory_manual.zip"
    invalid_name.write_text("manual backup")

    result = backup(silent=True, db_path=db_path, db_backup_path=db_backup_path)

    assert result is not None
    assert not old_backup.exists()
    assert invalid_name.exists()
