from pathlib import Path

from memory.web.mirrors import MirrorRegistry


def test_registry_lists_local_mirror_homes_with_current_first(tmp_path: Path) -> None:
    root = tmp_path / ".mirror-minds"
    current = root / "alisson-vale"
    other = root / "sandbox"
    current.mkdir(parents=True)
    other.mkdir()
    backups = root / "backups"
    backups.mkdir()
    (current / "memory.db").write_text("", encoding="utf-8")
    (other / "memory.db").write_text("", encoding="utf-8")

    mirrors = MirrorRegistry(current, user_homes_dir=root).list_mirrors()

    assert [mirror.name for mirror in mirrors] == ["alisson-vale", "sandbox"]
    assert mirrors[0].is_current is True
    assert mirrors[0].database_exists is True
    assert mirrors[1].is_current is False
    assert mirrors[1].database_exists is True


def test_registry_includes_current_home_when_root_does_not_exist(tmp_path: Path) -> None:
    current = tmp_path / "custom-home"

    mirrors = MirrorRegistry(current, user_homes_dir=tmp_path / "missing-root").list_mirrors()

    assert len(mirrors) == 1
    assert mirrors[0].name == "custom-home"
    assert mirrors[0].is_current is True


def test_registry_ignores_non_database_directories(tmp_path: Path) -> None:
    root = tmp_path / ".mirror-minds"
    current = root / "current"
    hidden = root / ".cache"
    backups = root / "backups"
    current.mkdir(parents=True)
    hidden.mkdir()
    backups.mkdir()
    (current / "memory.db").write_text("", encoding="utf-8")
    (hidden / "memory.db").write_text("", encoding="utf-8")

    mirrors = MirrorRegistry(current, user_homes_dir=root).list_mirrors()

    assert [mirror.name for mirror in mirrors] == ["current"]
