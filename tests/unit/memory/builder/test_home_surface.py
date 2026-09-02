from memory.builder.home_surface import (
    inspect_refinement_field,
    render_builder_home_surface,
)
from memory.builder.pull_candidates import PullCandidatesReport


def test_canonical_refinement_index_bypasses_legacy_snapshot_and_orients_to_files(tmp_path, mocker):
    index = tmp_path / "docs/project/refinement/index.md"
    index.parent.mkdir(parents=True)
    index.write_text("# Refinement Workbench\n", encoding="utf-8")
    legacy_snapshot = mocker.patch("memory.builder.home_surface._safe_workbench_snapshot")

    refinement = inspect_refinement_field(
        tmp_path, store=mocker.Mock(), journey="sandbox-pet-store"
    )
    rendered = render_builder_home_surface(
        journey="sandbox-pet-store",
        method="ariad",
        candidates_report=PullCandidatesReport(
            journey="sandbox-pet-store",
            method="ariad",
            candidates=(),
            recommended=None,
        ),
        refinement=refinement,
    )

    legacy_snapshot.assert_not_called()
    assert refinement.canonical_index == "docs/project/refinement/index.md"
    assert "authority: project files" in rendered
    assert "docs/project/refinement/index.md" in rendered
    assert "stored RSs:" not in rendered
    assert "stored CRs:" not in rendered
