from pathlib import Path

from memory.web.preferences import WebPreferenceStore


def test_preference_store_reads_missing_default(tmp_path: Path) -> None:
    store = WebPreferenceStore(tmp_path)

    preference = store.read()

    assert preference.default_perspective is None
    assert preference.warning is None


def test_preference_store_writes_default_to_user_home(tmp_path: Path) -> None:
    store = WebPreferenceStore(tmp_path)

    preference = store.write_default_perspective("atlas")

    assert preference.default_perspective == "atlas"
    assert store.read().default_perspective == "atlas"
    assert (tmp_path / "web" / "preferences.json").read_text(encoding="utf-8") == (
        '{\n  "default_perspective": "atlas"\n}\n'
    )


def test_preference_store_reports_corrupt_file_without_crashing(tmp_path: Path) -> None:
    path = tmp_path / "web" / "preferences.json"
    path.parent.mkdir(parents=True)
    path.write_text("not json", encoding="utf-8")

    preference = WebPreferenceStore(tmp_path).read()

    assert preference.default_perspective is None
    assert preference.warning is not None


def test_preference_store_rejects_invalid_perspective(tmp_path: Path) -> None:
    store = WebPreferenceStore(tmp_path)

    try:
        store.write_default_perspective("docs")
    except ValueError as exc:
        assert "atlas" in str(exc)
    else:
        raise AssertionError("invalid perspective should fail")
