import importlib
import os
from contextlib import contextmanager
from pathlib import Path

from memory import config

_CONFIG_ENV_KEYS = (
    "BACKUP_DIR",
    "DB_BACKUP_PATH",
    "DB_PATH",
    "EXPORT_DIR",
    "MEMORY_DIR",
    "MEMORY_ENV",
    "MEMORY_PROD_DIR",
    "MIRROR_HOME",
    "MIRROR_USER",
    "TRANSCRIPT_EXPORT_DIR",
)


def _reload_config(**env):
    for key in _CONFIG_ENV_KEYS:
        os.environ[key] = ""
    for key, value in env.items():
        os.environ[key] = value
    return importlib.reload(config)


def _restore_config_env(original_env):
    for key in _CONFIG_ENV_KEYS:
        os.environ.pop(key, None)
        if key in original_env:
            os.environ[key] = original_env[key]
    importlib.reload(config)


@contextmanager
def _config_with_env(**env):
    original_env = {key: os.environ[key] for key in _CONFIG_ENV_KEYS if key in os.environ}
    try:
        yield _reload_config(**env)
    finally:
        _restore_config_env(original_env)


def test_resolve_mirror_home_prefers_mirror_home(tmp_path):
    mirror_home = tmp_path / "users" / "testuser"

    with _config_with_env(MIRROR_HOME=str(mirror_home)) as cfg:
        assert cfg.resolve_mirror_home() == mirror_home


def test_resolve_mirror_home_derives_from_mirror_user():
    with _config_with_env(MIRROR_USER="testuser") as cfg:
        assert cfg.resolve_mirror_home() == Path.home() / ".mirror-minds" / "testuser"


def test_resolve_mirror_home_accepts_matching_home_and_user(tmp_path):
    mirror_home = tmp_path / ".mirror" / "testuser"

    with _config_with_env(MIRROR_HOME=str(mirror_home), MIRROR_USER="testuser") as cfg:
        assert cfg.resolve_mirror_home() == mirror_home


def test_resolve_mirror_home_rejects_conflicting_home_and_user(tmp_path):
    mirror_home = tmp_path / ".mirror" / "pati"

    with _config_with_env(MIRROR_HOME=str(mirror_home), MIRROR_USER="testuser") as cfg:
        try:
            cfg.resolve_mirror_home()
            raise AssertionError("Expected resolve_mirror_home() to fail on conflict")
        except ValueError as exc:
            assert "MIRROR_HOME" in str(exc)
            assert "MIRROR_USER" in str(exc)


def test_resolve_mirror_home_requires_explicit_selection():
    with _config_with_env() as cfg:
        try:
            cfg.resolve_mirror_home()
            raise AssertionError("Expected resolve_mirror_home() to require explicit selection")
        except ValueError as exc:
            assert "MIRROR_HOME" in str(exc)
            assert "MIRROR_USER" in str(exc)


def test_default_db_path_for_home_uses_memory_db(tmp_path):
    with _config_with_env() as cfg:
        assert cfg.default_db_path_for_home(tmp_path) == tmp_path / "memory.db"


def test_default_backup_dir_for_home_uses_backups_dir(tmp_path):
    with _config_with_env() as cfg:
        assert cfg.default_backup_dir_for_home(tmp_path) == tmp_path / "backups"


def test_default_export_dir_for_home_uses_exports_dir(tmp_path):
    with _config_with_env() as cfg:
        assert cfg.default_export_dir_for_home(tmp_path) == tmp_path / "exports"


def test_default_transcript_export_dir_for_home_uses_exports_transcripts(tmp_path):
    with _config_with_env() as cfg:
        assert (
            cfg.default_transcript_export_dir_for_home(tmp_path)
            == tmp_path / "exports" / "transcripts"
        )


def test_export_dir_defaults_from_mirror_home(tmp_path):
    mirror_home = tmp_path / ".mirror" / "testuser"

    with _config_with_env(MIRROR_HOME=str(mirror_home)) as cfg:
        assert cfg.EXPORT_DIR == mirror_home / "exports"


def test_export_dir_can_be_configured_from_environment(tmp_path):
    export_dir = tmp_path / "dropbox" / "exports"

    with _config_with_env(EXPORT_DIR=str(export_dir)) as cfg:
        assert cfg.EXPORT_DIR == export_dir


def test_transcript_export_dir_defaults_from_mirror_home(tmp_path):
    mirror_home = tmp_path / ".mirror" / "testuser"

    with _config_with_env(MIRROR_HOME=str(mirror_home)) as cfg:
        assert cfg.TRANSCRIPT_EXPORT_DIR == mirror_home / "exports" / "transcripts"


def test_transcript_export_dir_inherits_from_export_dir(tmp_path):
    export_dir = tmp_path / "external-exports"

    with _config_with_env(EXPORT_DIR=str(export_dir)) as cfg:
        assert cfg.TRANSCRIPT_EXPORT_DIR == export_dir / "transcripts"


def test_transcript_export_dir_can_be_configured_from_environment(tmp_path):
    transcript_dir = tmp_path / "obsidian" / "transcripts"

    with _config_with_env(TRANSCRIPT_EXPORT_DIR=str(transcript_dir)) as cfg:
        assert cfg.TRANSCRIPT_EXPORT_DIR == transcript_dir


def test_mute_flag_path_is_derived_from_memory_dir():
    with _config_with_env() as cfg:
        assert cfg.MUTE_FLAG_PATH == cfg.MEMORY_DIR / "mute"


def test_memory_dir_defaults_from_mirror_home_in_production(tmp_path):
    mirror_home = tmp_path / ".mirror" / "testuser"

    with _config_with_env(MIRROR_HOME=str(mirror_home)) as cfg:
        assert cfg.MEMORY_DIR == mirror_home
        assert cfg.MUTE_FLAG_PATH == mirror_home / "mute"


def test_default_memory_dir_uses_mirror_minds_dir_for_new_installs(tmp_path):
    with _config_with_env() as cfg:
        assert cfg._default_memory_dir(tmp_path) == tmp_path / ".mirror-minds"


def test_default_memory_dir_ignores_existing_legacy_espelho_dir(tmp_path):
    mirror_dir = tmp_path / ".mirror-minds"
    legacy_dir = tmp_path / ".espelho"
    legacy_dir.mkdir()

    with _config_with_env() as cfg:
        assert cfg._default_memory_dir(tmp_path) == mirror_dir


def test_default_directory_constants_are_english_only():
    with _config_with_env() as cfg:
        assert cfg.DEFAULT_MIRROR_DIR.name == ".mirror-minds"
        assert cfg.DEFAULT_USER_HOMES_DIR.name == ".mirror-minds"
        assert not hasattr(cfg, "LEGACY_ESPELHO_DIR")
        assert not hasattr(cfg, "DEFAULT_ESPELHO_DIR")


def test_memory_env_is_primary_environment_name():
    with _config_with_env(MEMORY_ENV="development") as cfg:
        assert cfg.MEMORY_ENV == "development"


def test_memory_dir_is_primary_directory_name(tmp_path):
    memory_dir = tmp_path / "memory"

    with _config_with_env(MEMORY_DIR=str(memory_dir)) as cfg:
        assert cfg.MEMORY_DIR == memory_dir


def test_memory_prod_dir_is_primary_production_directory_name(tmp_path):
    memory_prod_dir = tmp_path / "prod-memory"

    with _config_with_env(MEMORY_PROD_DIR=str(memory_prod_dir)) as cfg:
        assert cfg.db_path_for_env("production") == memory_prod_dir / "memory.db"


def test_default_db_backup_path_uses_backups_dir_next_to_db_path():
    with _config_with_env() as cfg:
        assert cfg.DB_BACKUP_PATH == cfg.DB_PATH.parent / "backups"


def test_default_db_backup_path_follows_configured_db_path(tmp_path):
    db_path = tmp_path / "custom" / "memory.db"

    with _config_with_env(DB_PATH=str(db_path)) as cfg:
        assert cfg.DB_BACKUP_PATH == db_path.parent / "backups"


def test_db_path_for_env_uses_environment_specific_database_names(tmp_path):
    memory_dir = tmp_path / "memory"

    with _config_with_env(MEMORY_DIR=str(memory_dir)) as cfg:
        assert cfg.db_path_for_env("production") == memory_dir / "memory.db"
        assert cfg.db_path_for_env("development") == memory_dir / "memory_dev.db"
        assert cfg.db_path_for_env("test") == memory_dir / "memory_test.db"


def test_db_path_for_unknown_env_uses_env_name_in_database_file(tmp_path):
    memory_dir = tmp_path / "memory"

    with _config_with_env(MEMORY_DIR=str(memory_dir)) as cfg:
        assert cfg.db_path_for_env("custom") == memory_dir / "memory_custom.db"


def test_db_path_defaults_to_current_environment_path():
    with _config_with_env() as cfg:
        assert cfg.DB_PATH == cfg.db_path_for_env()


def test_db_path_defaults_from_mirror_home_in_production(tmp_path):
    mirror_home = tmp_path / ".mirror" / "testuser"

    with _config_with_env(MIRROR_HOME=str(mirror_home)) as cfg:
        assert cfg.DB_PATH == mirror_home / "memory.db"


def test_db_path_defaults_from_mirror_user_in_production(tmp_path):
    with _config_with_env(MIRROR_USER="testuser") as cfg:
        assert cfg.DB_PATH == Path.home() / ".mirror-minds" / "testuser" / "memory.db"


# ---------------------------------------------------------------------------
# Legacy path compatibility (~/.mirror/<user>)
# ---------------------------------------------------------------------------
# The default container was renamed from ``~/.mirror`` to ``~/.mirror-minds``
# in 2026-05. The legacy location remains supported indefinitely (see
# ``docs/project/decisions.md``).


def test_resolve_mirror_home_falls_back_to_legacy_path_when_only_legacy_exists(tmp_path, capsys):
    legacy_home = tmp_path / ".mirror" / "testuser"
    legacy_home.mkdir(parents=True)

    with _config_with_env(MIRROR_USER="testuser") as cfg:
        resolved = cfg.resolve_mirror_home(home=tmp_path)

    assert resolved == legacy_home
    warning = capsys.readouterr().err
    assert "legacy mirror home" in warning
    assert str(legacy_home) in warning


def test_resolve_mirror_home_prefers_new_path_when_both_exist(tmp_path, capsys):
    legacy_home = tmp_path / ".mirror" / "testuser"
    new_home = tmp_path / ".mirror-minds" / "testuser"
    legacy_home.mkdir(parents=True)
    new_home.mkdir(parents=True)

    with _config_with_env(MIRROR_USER="testuser") as cfg:
        resolved = cfg.resolve_mirror_home(home=tmp_path)

    assert resolved == new_home
    assert "legacy mirror home" not in capsys.readouterr().err


def test_legacy_path_warning_emitted_once_per_legacy_path(tmp_path, capsys):
    legacy_home = tmp_path / ".mirror" / "testuser"
    legacy_home.mkdir(parents=True)

    with _config_with_env(MIRROR_USER="testuser") as cfg:
        cfg.resolve_mirror_home(home=tmp_path)
        cfg.resolve_mirror_home(home=tmp_path)
        cfg.resolve_mirror_home(home=tmp_path)

    warning = capsys.readouterr().err
    assert warning.count("legacy mirror home") == 1


def test_db_path_can_be_configured_from_environment(tmp_path):
    db_path = tmp_path / "custom.db"

    with _config_with_env(DB_PATH=str(db_path)) as cfg:
        assert cfg.DB_PATH == db_path


def test_configured_db_path_expands_user_home():
    with _config_with_env(DB_PATH="~/memory.db") as cfg:
        assert cfg.DB_PATH == Path.home() / "memory.db"


def test_db_backup_path_can_be_configured_from_environment(tmp_path):
    backup_path = tmp_path / "db-backups"

    with _config_with_env(DB_BACKUP_PATH=str(backup_path)) as cfg:
        assert cfg.DB_BACKUP_PATH == backup_path


def test_configured_paths_expand_user_home():
    with _config_with_env(DB_BACKUP_PATH="~/memory-backups") as cfg:
        assert cfg.DB_BACKUP_PATH == Path.home() / "memory-backups"
