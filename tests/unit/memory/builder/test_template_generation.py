from memory.builder.ariad_method import get_ariad_method
from memory.builder.template_generation import (
    prepare_method_templates,
    render_template_preparation_report,
)


def test_prepare_method_templates_creates_missing_ariad_templates(tmp_path):
    report = prepare_method_templates(
        tmp_path,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
    )

    assert report.journey == "sandbox-pet-store"
    assert report.method == "ariad"
    assert "docs/project/roadmap/templates/plan.md" in report.checked
    assert "docs/project/roadmap/templates/plan.md" in {item.path for item in report.created}
    assert (tmp_path / "docs/project/roadmap/templates/plan.md").is_file()
    assert "Implementation must not start" in (
        tmp_path / "docs/project/roadmap/templates/plan.md"
    ).read_text(encoding="utf-8")


def test_prepare_method_templates_preserves_existing_files(tmp_path):
    existing = tmp_path / "docs/project/roadmap/templates/plan.md"
    existing.parent.mkdir(parents=True)
    existing.write_text("# Human Plan\n", encoding="utf-8")

    report = prepare_method_templates(
        tmp_path,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
    )

    assert existing.read_text(encoding="utf-8") == "# Human Plan\n"
    assert "docs/project/roadmap/templates/plan.md" in {item.path for item in report.preserved}
    assert "docs/project/roadmap/templates/plan.md" not in {item.path for item in report.created}


def test_render_template_preparation_report_names_created_preserved_and_pending(tmp_path):
    existing = tmp_path / "docs/project/roadmap/templates/plan.md"
    existing.parent.mkdir(parents=True)
    existing.write_text("# Human Plan\n", encoding="utf-8")
    report = prepare_method_templates(
        tmp_path,
        journey="sandbox-pet-store",
        method=get_ariad_method(),
    )

    rendered = render_template_preparation_report(report)

    assert "Ariad Template Preparation" in rendered
    assert "journey\nsandbox-pet-store" in rendered
    assert "method\nariad" in rendered
    assert "checked" in rendered
    assert "created" in rendered
    assert "preserved" in rendered
    assert "pending" in rendered
    assert "docs/project/roadmap/templates/plan.md" in rendered
    assert "runtime delivery cursor sync" in rendered
    assert "No story lifecycle work was executed" in rendered
