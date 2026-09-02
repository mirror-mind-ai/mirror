from pathlib import Path

from memory.builder.delivery_story_roadmap_closure import inspect_authored_closure


def _write_fixture(project: Path, *, ds_status: str, child_status: str, parent_status: str) -> None:
    roadmap = project / "docs/project/roadmap"
    ds = roadmap / "cv2" / "cv2-ds1"
    child = ds / "cv2-ds1-us1"
    child.mkdir(parents=True)
    (roadmap / "index.md").write_text(
        f"""# Roadmap

| Code | Delivery Story | Status |
|------|----------------|--------|
| [CV2.DS1](cv2/cv2-ds1/index.md) | Checkout | {parent_status} |
""",
        encoding="utf-8",
    )
    (ds / "index.md").write_text(
        f"""# CV2.DS1 — Checkout

**Status:** {ds_status}

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| [CV2.DS1.US1](cv2-ds1-us1/index.md) | Address | User Story | {child_status} |
""",
        encoding="utf-8",
    )
    (child / "index.md").write_text(
        f"# CV2.DS1.US1 — Address\n\n**Status:** {child_status}\n",
        encoding="utf-8",
    )


def test_authored_closure_reports_stale_ds_child_and_parent_rows(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _write_fixture(
        project,
        ds_status="🟠 In Progress",
        child_status="🟠 In Progress",
        parent_status="🟠 In Progress",
    )

    report = inspect_authored_closure(
        project,
        delivery_story="CV2.DS1",
        child_work_items=("CV2.DS1.US1",),
    )

    assert report.ready is False
    assert report.issues == (
        "docs/project/roadmap/cv2/cv2-ds1/index.md: package status is not Done",
        "docs/project/roadmap/cv2/cv2-ds1/cv2-ds1-us1/index.md: package status is not Done",
        "docs/project/roadmap/cv2/cv2-ds1/index.md: table row CV2.DS1.US1 is not Done",
        "docs/project/roadmap/index.md: table row CV2.DS1 is not Done",
    )


def test_authored_closure_accepts_aligned_ds_child_and_parent_rows(tmp_path: Path) -> None:
    project = tmp_path / "project"
    _write_fixture(
        project,
        ds_status="✅ Done",
        child_status="✅ Done",
        parent_status="✅ Done",
    )

    report = inspect_authored_closure(
        project,
        delivery_story="CV2.DS1",
        child_work_items=("CV2.DS1.US1",),
    )

    assert report.ready is True
    assert report.issues == ()
