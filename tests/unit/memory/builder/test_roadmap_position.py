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
