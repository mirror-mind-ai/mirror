from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.operational import (
    AriadOperationalProjectionService,
    OperationalCompiler,
    normalize_roadmap_status,
)
from memory.journey_projections.serialization import canonical_json_bytes
from memory.journey_projections.service import JourneyProjectionService

FIXTURE = Path(__file__).parents[3] / "fixtures/journey_projections/operational"


def fixed_compiler(*, source_revision: str | None = None) -> OperationalCompiler:
    return OperationalCompiler(
        _generated_at_factory=lambda: "2030-01-01T00:00:00Z",
        _snapshot_id_factory=lambda: "op-probe-0001",
        _source_revision_override=source_revision,
    )


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_contract_fixture_compiles_and_publishes_exact_operational_document(
    tmp_path: Path,
) -> None:
    root = tmp_path / "journey"
    shutil.copytree(FIXTURE / "journey", root)
    expected_document = load_json(FIXTURE / "expected/operational.json")
    expected_manifest = load_json(FIXTURE / "expected/manifest.json")
    active_work = load_json(root / "ariad-active-work.json")
    projection_service = JourneyProjectionService(
        lambda journey_id: root if journey_id == "projection-probe-journey" else None
    )
    service = AriadOperationalProjectionService(
        projection_service,
        compiler=fixed_compiler(source_revision="sha256:probe-operational-revision"),
    )

    rebuilt = service.rebuild("projection-probe-journey", active_work=active_work)
    inspected = projection_service.inspect(
        "projection-probe-journey", "ariad", "operational", domain="operational"
    )

    assert rebuilt.document == expected_document
    assert canonical_json_bytes(rebuilt.document) == canonical_json_bytes(expected_document)
    assert inspected.document == expected_document
    manifest = load_json(root / ".mirror/projections/current.json")
    assert manifest == expected_manifest


def test_source_revision_hashes_only_projected_public_state(tmp_path: Path) -> None:
    root = tmp_path / "journey"
    shutil.copytree(FIXTURE / "journey", root)
    active_work = load_json(root / "ariad-active-work.json")
    compiler = fixed_compiler()

    first = compiler.compile(root, "projection-probe-journey", active_work=active_work)
    story = root / "docs/project/explorations/projection-shape/exploratory-story.md"
    story.write_text(
        story.read_text(encoding="utf-8")
        + "\n## Private Narrative Evidence\n\nDo not project this body.\n",
        encoding="utf-8",
    )
    private_edit = compiler.compile(root, "projection-probe-journey", active_work=active_work)
    story.write_text(
        story.read_text(encoding="utf-8").replace(
            "Publish deterministic Journey structure for read-only consumers.",
            "Publish changed public Journey structure.",
        ),
        encoding="utf-8",
    )
    represented_edit = compiler.compile(root, "projection-probe-journey", active_work=active_work)

    assert private_edit["content"] == first["content"]
    assert private_edit["sourceRevision"] == first["sourceRevision"]
    assert represented_edit["sourceRevision"] != first["sourceRevision"]
    assert "Private Narrative Evidence" not in canonical_json_bytes(represented_edit).decode()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("✅ Done", "done"),
        ("Closed", "done"),
        ("In Validation", "in_validation"),
        ("⏸️ Paused", "blocked"),
        ("Blocked by input", "blocked"),
        ("🟠 In Progress", "in_progress"),
        ("Active Delivery Story", "in_progress"),
        ("🟡 Planned", "planned"),
        ("Future", "planned"),
    ],
)
def test_status_normalization_is_closed_and_deterministic(raw: str, expected: str) -> None:
    assert normalize_roadmap_status(raw) == expected


def test_legacy_epic_story_grammar_normalizes_to_v1_node_types(tmp_path: Path) -> None:
    roadmap = tmp_path / "docs/project/roadmap"
    story = roadmap / "cv1/epic/story"
    story.mkdir(parents=True)
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n## Capability Values\n\n"
        "| Code | Capability Value | Status |\n|---|---|---|\n"
        "| [CV1](cv1/index.md) | Capability | Active |\n",
        encoding="utf-8",
    )
    (roadmap / "cv1/index.md").write_text(
        "# CV1 — Capability\n\n**Status:** Active\n\n## Outcome\n\nCapability outcome.\n\n"
        "## Epics\n\n| Code | Epic | Status |\n|---|---|---|\n"
        "| [CV1.E1](epic/index.md) | Epic | Active |\n",
        encoding="utf-8",
    )
    (roadmap / "cv1/epic/index.md").write_text(
        "# CV1.E1 — Epic\n\n**Status:** Active\n\n## Outcome\n\nEpic outcome.\n\n"
        "## Stories\n\n| Code | Story | Status |\n|---|---|---|\n"
        "| [CV1.E1.S1](story/index.md) | Story | Done |\n",
        encoding="utf-8",
    )
    (story / "index.md").write_text(
        "# CV1.E1.S1 — Story\n\n**Status:** Done\n\n## Outcome\n\nStory outcome.\n",
        encoding="utf-8",
    )

    document = fixed_compiler().compile(tmp_path, "synthetic-journey")
    capability = document["content"]["roadmap"]["roots"][0]

    assert capability["type"] == "capability_value"
    assert capability["children"][0]["type"] == "delivery_story"
    assert capability["children"][0]["children"][0]["type"] == "user_story"


def test_unlinked_roadmap_code_resolves_authored_package_by_heading(tmp_path: Path) -> None:
    roadmap = tmp_path / "docs/project/roadmap"
    child = roadmap / "cv1/arbitrary-human-folder"
    child.mkdir(parents=True)
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        "| [CV1](cv1/index.md) | One | Active |\n",
        encoding="utf-8",
    )
    (roadmap / "cv1/index.md").write_text(
        "# CV1 — One\n\n**Status:** Active\n\n## Outcome\n\nOne.\n\n"
        "| Code | Delivery Story | Status |\n|---|---|---|\n"
        "| CV1.DS1 | Child | Planned |\n",
        encoding="utf-8",
    )
    (child / "index.md").write_text(
        "# CV1.DS1 — Authored child\n\n**Status:** Planned\n\n"
        "## Outcome\n\nResolved from its heading.\n",
        encoding="utf-8",
    )

    document = fixed_compiler().compile(tmp_path, "synthetic-journey")
    projected = document["content"]["roadmap"]["roots"][0]["children"][0]

    assert projected["id"] == "CV1.DS1"
    assert projected["path"] == ("docs/project/roadmap/cv1/arbitrary-human-folder/index.md")


def test_duplicate_and_cyclic_roadmap_links_fail_closed(tmp_path: Path) -> None:
    roadmap = tmp_path / "docs/project/roadmap"
    package = roadmap / "cv1"
    package.mkdir(parents=True)
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        "| [CV1](cv1/index.md) | One | Planned |\n"
        "| [CV1](cv1/index.md) | One again | Planned |\n",
        encoding="utf-8",
    )
    (package / "index.md").write_text(
        "# CV1 — One\n\n**Status:** Planned\n\n## Outcome\n\nOne.\n",
        encoding="utf-8",
    )

    with pytest.raises(ProjectionError) as duplicate:
        fixed_compiler().compile(tmp_path, "synthetic-journey")
    assert duplicate.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED

    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        "| [CV1](cv1/index.md) | One | Planned |\n",
        encoding="utf-8",
    )
    (package / "index.md").write_text(
        "# CV1 — One\n\n**Status:** Planned\n\n## Outcome\n\nOne.\n\n"
        "| Code | Delivery Story | Status |\n|---|---|---|\n"
        "| [CV1](index.md) | Cycle | Planned |\n",
        encoding="utf-8",
    )

    with pytest.raises(ProjectionError) as cycle:
        fixed_compiler().compile(tmp_path, "synthetic-journey")
    assert cycle.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED


def test_default_build_identity_is_valid_utc_and_unique(tmp_path: Path) -> None:
    compiler = OperationalCompiler()

    first = compiler.compile(tmp_path, "synthetic-journey")
    second = compiler.compile(tmp_path, "synthetic-journey")

    assert first["generatedAt"].endswith("Z")
    assert first["snapshotId"].startswith("op-")
    assert first["snapshotId"] != second["snapshotId"]
    assert first["sourceRevision"] == second["sourceRevision"]


def test_active_work_is_explicit_and_part_of_source_revision(tmp_path: Path) -> None:
    compiler = fixed_compiler()
    active = {
        "activeItem": "CV1.DS1",
        "checkpoint": "plan",
        "pendingConfirmation": None,
        "status": "implementing",
        "private": "must be dropped",
    }

    with_active = compiler.compile(tmp_path, "synthetic-journey", active_work=active)
    without_active = compiler.compile(tmp_path, "synthetic-journey")

    assert with_active["content"]["activeWork"] == {
        "activeItem": "CV1.DS1",
        "checkpoint": "plan",
        "pendingConfirmation": None,
        "status": "implementing",
    }
    assert "private" not in canonical_json_bytes(with_active).decode()
    assert with_active["sourceRevision"] != without_active["sourceRevision"]


def test_noncanonical_or_other_journey_explorations_are_not_projected(
    tmp_path: Path,
) -> None:
    explorations = tmp_path / "docs/project/explorations"
    legacy = explorations / "legacy"
    foreign = explorations / "foreign"
    legacy.mkdir(parents=True)
    foreign.mkdir(parents=True)
    (legacy / "index.md").write_text("# Historical exploration notes\n", encoding="utf-8")
    (foreign / "index.md").write_text(
        "# Exploration Handoff: Foreign\n\n## Durable Story\n\n"
        "- Story id: `foreign-story`\n"
        "- Journey: `other-journey`\n"
        "- Status: `active`\n",
        encoding="utf-8",
    )

    document = fixed_compiler().compile(tmp_path, "synthetic-journey")

    assert document["content"]["exploratoryStories"] == []


def test_document_first_refinement_index_owns_status_and_order(tmp_path: Path) -> None:
    refinement = tmp_path / "docs/project/refinement"
    story = refinement / "rs001"
    story.mkdir(parents=True)
    (refinement / "index.md").write_text(
        "# Refinement Workbench\n\n"
        "| Order | ID | Story | Status |\n|---:|---|---|---|\n"
        "| 1 | [RS001](rs001/index.md) | Trust | active |\n\n"
        "| Order | ID | RS | Change | Status |\n|---:|---|---|---|---|\n"
        "| 1 | [CR002](rs001/cr002.md) | RS001 | Second | captured |\n"
        "| 2 | [CR001](rs001/cr001.md) | RS001 | First | done |\n",
        encoding="utf-8",
    )
    (story / "index.md").write_text(
        "# RS001 — Runtime trust\n\n## Outcome\n\nTrust.\n",
        encoding="utf-8",
    )
    (story / "cr002.md").write_text("# CR002 — Second\n", encoding="utf-8")
    (story / "cr001.md").write_text("# CR001 — First\n", encoding="utf-8")

    document = fixed_compiler().compile(tmp_path, "synthetic-journey")
    projected = document["content"]["refinementStories"][0]

    assert projected["status"] == "active"
    assert [(item["id"], item["status"]) for item in projected["changeRequests"]] == [
        ("CR002", "captured"),
        ("CR001", "done"),
    ]


@pytest.mark.parametrize(
    ("capability_directory", "target"),
    [
        ("cv1", "../ds1/index.md"),
        ("capabilities/cv1", "../../ds1/index.md"),
        ("cv1", "../ds1/"),
    ],
)
def test_confined_parent_links_compile_root_level_delivery_packages(
    tmp_path: Path,
    capability_directory: str,
    target: str,
) -> None:
    roadmap = tmp_path / "docs/project/roadmap"
    capability = roadmap / capability_directory
    delivery = roadmap / "ds1"
    capability.mkdir(parents=True)
    delivery.mkdir(parents=True)
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        f"| [CV1]({capability_directory}/index.md) | One | Active |\n",
        encoding="utf-8",
    )
    (capability / "index.md").write_text(
        "# CV1 — One\n\n**Status:** Active\n\n## Outcome\n\nOne.\n\n"
        "| Code | Delivery Story | Status |\n|---|---|---|\n"
        f"| [CV1.DS1]({target}) | Root delivery | Planned |\n",
        encoding="utf-8",
    )
    (delivery / "index.md").write_text(
        "# CV1.DS1 — Root delivery\n\n**Status:** Planned\n\n"
        "## Outcome\n\nCompiled through a confined parent link.\n",
        encoding="utf-8",
    )

    document = fixed_compiler().compile(tmp_path, "synthetic-journey")

    projected = document["content"]["roadmap"]["roots"][0]["children"][0]
    assert projected["id"] == "CV1.DS1"
    assert projected["path"] == "docs/project/roadmap/ds1/index.md"


@pytest.mark.parametrize(
    "target",
    [
        "../../../../outside.md",
        "/tmp/outside.md",
        "file:///tmp/outside.md",
        "..\\outside.md",
    ],
)
def test_unsafe_roadmap_link_forms_remain_rejected(
    tmp_path: Path,
    target: str,
) -> None:
    roadmap = tmp_path / "docs/project/roadmap"
    roadmap.mkdir(parents=True)
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        f"| [CV1]({target}) | Unsafe | Planned |\n",
        encoding="utf-8",
    )

    with pytest.raises(ProjectionError) as caught:
        fixed_compiler().compile(tmp_path, "synthetic-journey")

    assert caught.value.code is ProjectionErrorCode.UNSAFE_PROJECTION_PATH
    assert str(tmp_path) not in caught.value.message


def test_missing_linked_package_fails_before_publication(tmp_path: Path) -> None:
    roadmap = tmp_path / "docs/project/roadmap"
    roadmap.mkdir(parents=True)
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        "| [CV1](missing/index.md) | Missing | Planned |\n",
        encoding="utf-8",
    )

    with pytest.raises(ProjectionError) as caught:
        fixed_compiler().compile(tmp_path, "synthetic-journey")

    assert caught.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED
    assert "missing" not in caught.value.message.lower()
    assert not (tmp_path / ".mirror").exists()


def test_linked_symlink_escape_is_rejected_without_leaking_path(tmp_path: Path) -> None:
    roadmap = tmp_path / "docs/project/roadmap"
    roadmap.mkdir(parents=True)
    outside = tmp_path.parent / f"{tmp_path.name}-outside.md"
    outside.write_text("# CV1 — Outside\n\n**Status:** Planned\n", encoding="utf-8")
    (roadmap / "outside.md").symlink_to(outside)
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        "| [CV1](outside.md) | Outside | Planned |\n",
        encoding="utf-8",
    )

    with pytest.raises(ProjectionError) as caught:
        fixed_compiler().compile(tmp_path, "synthetic-journey")

    assert caught.value.code is ProjectionErrorCode.UNSAFE_PROJECTION_PATH
    assert str(tmp_path) not in caught.value.message


def test_parent_link_through_directory_symlink_escape_is_rejected(
    tmp_path: Path,
) -> None:
    roadmap = tmp_path / "docs/project/roadmap"
    capability = roadmap / "cv1"
    capability.mkdir(parents=True)
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    (outside / "index.md").write_text(
        "# CV1.DS1 — Outside\n\n**Status:** Planned\n",
        encoding="utf-8",
    )
    (roadmap / "linked-outside").symlink_to(outside, target_is_directory=True)
    (roadmap / "index.md").write_text(
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n"
        "| [CV1](cv1/index.md) | One | Active |\n",
        encoding="utf-8",
    )
    (capability / "index.md").write_text(
        "# CV1 — One\n\n**Status:** Active\n\n"
        "| Code | Delivery Story | Status |\n|---|---|---|\n"
        "| [CV1.DS1](../linked-outside/) | Outside | Planned |\n",
        encoding="utf-8",
    )

    with pytest.raises(ProjectionError) as caught:
        fixed_compiler().compile(tmp_path, "synthetic-journey")

    assert caught.value.code is ProjectionErrorCode.UNSAFE_PROJECTION_PATH
    assert str(outside) not in caught.value.message


def test_rebuild_preserves_last_valid_projection_when_compilation_fails(
    tmp_path: Path,
) -> None:
    root = tmp_path / "journey"
    shutil.copytree(FIXTURE / "journey", root)
    active_work = load_json(root / "ariad-active-work.json")
    projection_service = JourneyProjectionService(lambda _: root)
    service = AriadOperationalProjectionService(
        projection_service,
        compiler=fixed_compiler(),
    )
    service.rebuild("projection-probe-journey", active_work=active_work)
    projection = root / ".mirror/projections/ariad/operational.json"
    manifest = root / ".mirror/projections/current.json"
    before = (projection.read_bytes(), manifest.read_bytes())
    cv_index = root / "docs/project/roadmap/cv-probe/index.md"
    cv_index.write_text("# malformed\n", encoding="utf-8")

    with pytest.raises(ProjectionError) as caught:
        service.rebuild("projection-probe-journey", active_work=active_work)

    assert caught.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED
    assert (projection.read_bytes(), manifest.read_bytes()) == before


def test_missing_confined_parent_link_preserves_last_valid_projection(
    tmp_path: Path,
) -> None:
    root = tmp_path / "journey"
    shutil.copytree(FIXTURE / "journey", root)
    active_work = load_json(root / "ariad-active-work.json")
    projection_service = JourneyProjectionService(lambda _: root)
    service = AriadOperationalProjectionService(
        projection_service,
        compiler=fixed_compiler(),
    )
    service.rebuild("projection-probe-journey", active_work=active_work)
    projection = root / ".mirror/projections/ariad/operational.json"
    manifest = root / ".mirror/projections/current.json"
    before = (projection.read_bytes(), manifest.read_bytes())
    cv_index = root / "docs/project/roadmap/cv-probe/index.md"
    cv_index.write_text(
        cv_index.read_text(encoding="utf-8").replace(
            "ds-1/index.md",
            "../missing/index.md",
        ),
        encoding="utf-8",
    )

    with pytest.raises(ProjectionError) as caught:
        service.rebuild("projection-probe-journey", active_work=active_work)

    assert caught.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED
    assert (projection.read_bytes(), manifest.read_bytes()) == before


def test_missing_optional_surfaces_compile_as_empty_and_null(tmp_path: Path) -> None:
    document = fixed_compiler().compile(tmp_path, "synthetic-journey")

    assert document["content"] == {
        "roadmap": {"roots": []},
        "activeWork": None,
        "exploratoryStories": [],
        "refinementStories": [],
    }
