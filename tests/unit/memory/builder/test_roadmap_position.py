from memory.builder.roadmap_position import resolve_roadmap_position


def test_resolve_roadmap_position_returns_first_active_index(tmp_path):
    active = tmp_path / "docs/project/roadmap/cv20/index.md"
    active.parent.mkdir(parents=True)
    active.write_text(
        "# CV20 — Builder Mode Evolution\n\n**Status:** 🟢 Active\n",
        encoding="utf-8",
    )
    planned = tmp_path / "docs/project/roadmap/cv21/index.md"
    planned.parent.mkdir(parents=True)
    planned.write_text("# CV21 — Later\n\n**Status:** 🟡 Planned\n", encoding="utf-8")

    position = resolve_roadmap_position(tmp_path)

    assert position is not None
    assert position.code == "CV20"
    assert position.title == "Builder Mode Evolution"
    assert position.status == "🟢 Active"
    assert position.path == "docs/project/roadmap/cv20/index.md"


def test_resolve_roadmap_position_returns_none_without_roadmap(tmp_path):
    assert resolve_roadmap_position(tmp_path) is None


def test_resolve_roadmap_position_returns_none_without_active_item(tmp_path):
    planned = tmp_path / "docs/project/roadmap/cv21/index.md"
    planned.parent.mkdir(parents=True)
    planned.write_text("# CV21 — Later\n\n**Status:** 🟡 Planned\n", encoding="utf-8")

    assert resolve_roadmap_position(tmp_path) is None


# --- CV20.DS13 — Delivery Story grammar roadmap support ---


def test_resolve_roadmap_position_ignores_legacy_archive(tmp_path):
    legacy = tmp_path / "docs/project/roadmap/legacy/cv5-learning-loop/index.md"
    legacy.parent.mkdir(parents=True)
    legacy.write_text("# CV5 — Learning Loop\n\n**Status:** 🟢 Active\n", encoding="utf-8")

    assert resolve_roadmap_position(tmp_path) is None


def test_resolve_roadmap_position_prefers_non_legacy_active(tmp_path):
    legacy = tmp_path / "docs/project/roadmap/legacy/cv5-learning-loop/index.md"
    legacy.parent.mkdir(parents=True)
    legacy.write_text("# CV5 — Learning Loop\n\n**Status:** 🟢 Active\n", encoding="utf-8")
    active = tmp_path / "docs/project/roadmap/ds-40-live/index.md"
    active.parent.mkdir(parents=True)
    active.write_text("# DS-40 — Live Work\n\n**Status:** 🟢 Active\n", encoding="utf-8")

    position = resolve_roadmap_position(tmp_path)

    assert position is not None
    assert position.code == "DS-40"


def test_resolve_roadmap_position_matches_hyphenated_active_ds(tmp_path):
    active = tmp_path / "docs/project/roadmap/ds-40-live/index.md"
    active.parent.mkdir(parents=True)
    active.write_text("# DS-40 — Live Work\n\n**Status:** 🟢 Active\n", encoding="utf-8")

    position = resolve_roadmap_position(tmp_path)

    assert position is not None
    assert position.code == "DS-40"
    assert position.title == "Live Work"


def test_resolve_roadmap_position_returns_none_for_planned_ds(make_ds_roadmap, tmp_path):
    make_ds_roadmap(tmp_path)

    # A pulled-but-planned DS yields no file-scan position by design.
    assert resolve_roadmap_position(tmp_path) is None
