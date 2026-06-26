from memory.builder.pull_candidates import (
    inspect_pull_candidates,
    inspect_roadmap_snapshot,
    render_pull_candidates_report,
    render_roadmap_snapshot_report,
)


def test_inspect_roadmap_snapshot_reads_capability_table(tmp_path):
    roadmap = tmp_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| CV1 | Cart Flow | Done |
| CV2 | Checkout Flow | Candidate |
""",
        encoding="utf-8",
    )

    report = inspect_roadmap_snapshot(tmp_path, journey="sandbox-pet-store", method="ariad")

    assert [(item.code, item.title, item.status) for item in report.items] == [
        ("CV1", "Cart Flow", "Done"),
        ("CV2", "Checkout Flow", "Candidate"),
    ]
    rendered = render_roadmap_snapshot_report(report)
    assert "<<<ARIAD:ROADMAP_SNAPSHOT>>>" in rendered
    assert "<<<END:ROADMAP_SNAPSHOT>>>" in rendered
    assert "ROADMAP SNAPSHOT" in rendered
    assert "Delivery field overview" in rendered
    assert "Ariad: ◉ Pull | ○ Prepare | ○ Expand | ○ Plan" in rendered
    assert "view                         overview" in rendered
    assert "result of roadmap-snapshot      no pull candidates" in rendered
    assert "🟪[CV2]  Checkout Flow" in rendered
    assert "◉ candidate" in rendered
    assert "Active constraints" in rendered
    assert "✓ Navigator explicitly chooses Pull" in rendered
    assert "Roadmap was inspected only" in rendered


def test_roadmap_snapshot_prioritizes_in_progress_over_planned(tmp_path):
    roadmap = tmp_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| [CV10](cv10/index.md) | Coherence Engine | 🟡 Planned |
| [CV20](cv20/index.md) | Builder Mode Evolution | 🟢 In Progress |
""",
        encoding="utf-8",
    )

    report = inspect_roadmap_snapshot(tmp_path, journey="builder-mode-evolution", method="ariad")
    rendered = render_roadmap_snapshot_report(report)

    assert "🟪[CV20]  Builder Mode Evolution" in rendered
    assert "◉ active" in rendered
    assert "🟪[[CV10]" not in rendered


def test_roadmap_snapshot_uses_recommended_candidate_cv_as_focus(tmp_path):
    roadmap = tmp_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| [CV10](cv10/index.md) | Coherence Engine | 🟡 Planned |
| [CV20](cv20/index.md) | Builder Mode Evolution | 🟡 Planned |
""",
        encoding="utf-8",
    )
    ds = tmp_path / "docs/project/roadmap/cv20/cv20-ds6/cv20-ds6-us1/index.md"
    ds.parent.mkdir(parents=True)
    ds.write_text(
        "# CV20.DS6.US1 — Builder Home Work Fields\n\n**Status:** 🟡 Planned\n**Type:** User Story\n",
        encoding="utf-8",
    )

    snapshot = inspect_roadmap_snapshot(tmp_path, journey="builder-mode-evolution", method="ariad")
    candidates = inspect_pull_candidates(tmp_path, journey="builder-mode-evolution", method="ariad")
    rendered = render_roadmap_snapshot_report(snapshot, candidates=candidates.candidates)

    assert "🟪[CV20]  Builder Mode Evolution" in rendered
    assert "└─ 🟦[US1] Builder Home Work Fields" in rendered
    assert "CV20.DS6.US1" in rendered
    assert "Builder Home Work Fields" in rendered


def test_inspect_pull_candidates_lists_planned_roadmap_items(tmp_path):
    ds = tmp_path / "docs/project/roadmap/cv2/cv2-ds1/index.md"
    ds.parent.mkdir(parents=True)
    ds.write_text("# CV2.DS1 — Checkout Flow\n\n**Status:** 🟡 Planned\n", encoding="utf-8")
    us = tmp_path / "docs/project/roadmap/cv2/cv2-ds1/cv2-ds1-us1/index.md"
    us.parent.mkdir(parents=True)
    us.write_text(
        "# CV2.DS1.US1 — Add checkout button\n\n**Status:** 🟡 Planned\n**Type:** User Story\n",
        encoding="utf-8",
    )
    done = tmp_path / "docs/project/roadmap/cv1/index.md"
    done.parent.mkdir(parents=True)
    done.write_text("# CV1 — Cart Flow\n\n**Status:** ✅ Done\n", encoding="utf-8")

    report = inspect_pull_candidates(tmp_path, journey="sandbox-pet-store", method="ariad")

    candidates = {candidate.code: candidate for candidate in report.candidates}
    assert set(candidates) == {"CV2.DS1", "CV2.DS1.US1"}
    assert candidates["CV2.DS1"].level == "delivery_story"
    assert candidates["CV2.DS1.US1"].level == "user_story"
    assert report.recommended is not None
    assert report.recommended.code == "CV2.DS1.US1"


def test_inspect_pull_candidates_reads_candidate_delivery_stories_from_roadmap_index(tmp_path):
    roadmap = tmp_path / "docs/project/roadmap/index.md"
    roadmap.parent.mkdir(parents=True)
    roadmap.write_text(
        """# Roadmap

## CV2: Checkout Flow

**Status:** Candidate

Candidate Delivery Stories:

- DS1 Checkout entry and address capture.
- DS2 Payment placeholder.
""",
        encoding="utf-8",
    )

    report = inspect_pull_candidates(tmp_path, journey="sandbox-pet-store", method="ariad")

    assert [candidate.code for candidate in report.candidates] == ["CV2.DS1", "CV2.DS2"]
    assert report.candidates[0].title == "Checkout Flow / Checkout entry and address capture"
    assert report.candidates[0].level == "delivery_story"
    assert report.candidates[0].status == "Candidate"
    assert report.recommended is not None
    assert report.recommended.code == "CV2.DS1"


def test_inspect_pull_candidates_handles_missing_project_path():
    report = inspect_pull_candidates(None, journey="sandbox-pet-store", method="ariad")

    assert report.candidates == ()
    assert report.recommended is None


def test_render_pull_candidates_report_preserves_boundary(tmp_path):
    item = tmp_path / "docs/project/roadmap/cv2/cv2-ds1/index.md"
    item.parent.mkdir(parents=True)
    item.write_text("# CV2.DS1 — Checkout Flow\n\n**Status:** 🟡 Planned\n", encoding="utf-8")
    report = inspect_pull_candidates(tmp_path, journey="sandbox-pet-store", method="ariad")

    rendered = render_pull_candidates_report(report)

    assert "<<<ARIAD:PULL_CANDIDATES>>>" in rendered
    assert "<<<END:PULL_CANDIDATES>>>" in rendered
    assert "╭────────────────────────────────────────────────────────╮" in rendered
    assert "│        🟪■  PULL CANDIDATES                            │" in rendered
    assert "│ journey                                                │" in rendered
    assert "│ sandbox-pet-store                                      │" in rendered
    assert "CV2.DS1 — Checkout Flow" in rendered
    assert "│ recommended pull                                       │" in rendered
    assert "No item was pulled" in rendered
