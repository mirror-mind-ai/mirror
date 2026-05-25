from pathlib import Path

from memory.web.configuration import build_configuration_overview


def test_configuration_overview_serializes_non_sensitive_local_paths(tmp_path: Path) -> None:
    mirror_home = tmp_path / "mirror-home"
    mirror_home.mkdir()
    (mirror_home / "memory.db").write_text("", encoding="utf-8")

    overview = build_configuration_overview(mirror_home).to_dict()

    assert overview["title"] == "Configuration overview"
    sections = {section["id"]: section for section in overview["sections"]}
    mirror_items = {item["label"]: item for item in sections["mirror-home"]["items"]}
    assert mirror_items["Mirror home"]["value"] == str(mirror_home.resolve())
    assert mirror_items["Mirror home"]["exists"] is True
    assert mirror_items["Database"]["value"] == str((mirror_home / "memory.db").resolve())
    assert mirror_items["Database"]["exists"] is True
    assert "OPENROUTER_API_KEY" in str(overview)
    assert "sk-test" not in str(overview)


def test_configuration_overview_masks_sensitive_environment(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-secret-value")
    monkeypatch.setenv("MIRROR_USER", "alisson-vale")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "memory.db"))

    overview = build_configuration_overview(tmp_path).to_dict()

    sections = {section["id"]: section for section in overview["sections"]}
    env_items = {item["label"]: item for item in sections["environment"]["items"]}
    assert env_items["OPENROUTER_API_KEY"]["value"] == "sk-…lue (masked)"
    assert "sk-test-secret-value" not in str(overview)
    assert env_items["MIRROR_USER"]["value"] == "alisson-vale"
    assert env_items["DB_PATH"]["value"] == str(tmp_path / "memory.db")


def test_configuration_overview_handles_missing_mirror_home() -> None:
    overview = build_configuration_overview(None).to_dict()

    sections = {section["id"]: section for section in overview["sections"]}
    mirror_items = {item["label"]: item for item in sections["mirror-home"]["items"]}
    assert mirror_items["Mirror home"]["value"] == "Not configured"
    assert "exists" not in mirror_items["Mirror home"]
