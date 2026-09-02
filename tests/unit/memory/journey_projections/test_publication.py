from __future__ import annotations

import json
from pathlib import Path

import pytest

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.service import JourneyProjectionService


def extension_document(*, snapshot: str = "snap-0001", content: str = "first") -> dict:
    return {
        "contractVersion": "1.0",
        "schemaVersion": "1",
        "journeyId": "synthetic-journey",
        "altitude": "tactical",
        "namespace": "sample-extension",
        "projection": "tactical",
        "snapshotId": snapshot,
        "generatedAt": "2030-01-01T00:00:00Z",
        "producer": {"kind": "extension", "id": "sample-extension", "version": "1.0"},
        "sourceRevision": f"sha256:{content}",
        "sourceSnapshots": [
            {"namespace": "ariad", "projection": "operational", "snapshotId": "op-0001"}
        ],
        "content": {"value": content},
    }


def service(root: Path, **kwargs) -> JourneyProjectionService:
    return JourneyProjectionService(
        lambda journey_id: root if journey_id == "synthetic-journey" else None,
        **kwargs,
    )


def test_publish_and_inspect_create_consistent_manifest_and_receipt(tmp_path: Path) -> None:
    result = service(tmp_path).publish(extension_document(), domain="extension")
    inspected = service(tmp_path).inspect(
        "synthetic-journey", "sample-extension", "tactical", domain="extension"
    )

    assert result.status == "published"
    assert inspected.document == extension_document()
    assert inspected.manifest_entry["snapshotId"] == "snap-0001"
    manifest = json.loads((tmp_path / ".mirror/projections/current.json").read_text())
    assert list(manifest["projections"]) == ["sample-extension:tactical"]
    receipts = list((tmp_path / ".mirror/projections/.receipts").rglob("*.json"))
    assert len(receipts) == 1
    assert set(json.loads(receipts[0].read_text())) == {
        "contractVersion",
        "schemaVersion",
        "journeyId",
        "namespace",
        "projection",
        "snapshotId",
        "sourceRevision",
        "documentDigest",
    }


def test_same_snapshot_same_bytes_is_idempotent_but_different_bytes_fail(tmp_path: Path) -> None:
    first = extension_document()
    service(tmp_path).publish(first, domain="extension")
    before = (tmp_path / ".mirror/projections/current.json").read_bytes()
    service(tmp_path).publish(dict(reversed(list(first.items()))), domain="extension")

    changed = extension_document(content="changed")
    changed["snapshotId"] = first["snapshotId"]
    with pytest.raises(ProjectionError) as caught:
        service(tmp_path).publish(changed, domain="extension")
    assert caught.value.code is ProjectionErrorCode.PROJECTION_DIVERGENCE
    assert (tmp_path / ".mirror/projections/current.json").read_bytes() == before


def test_unknown_journey_and_symlink_escape_fail_before_publication(tmp_path: Path) -> None:
    with pytest.raises(ProjectionError) as caught:
        service(tmp_path).inspect("unknown", "sample-extension", "tactical")
    assert caught.value.code is ProjectionErrorCode.UNKNOWN_JOURNEY

    outside = tmp_path / "outside"
    outside.mkdir()
    (tmp_path / ".mirror").symlink_to(outside, target_is_directory=True)
    with pytest.raises(ProjectionError) as caught:
        service(tmp_path).publish(extension_document(), domain="extension")
    assert caught.value.code is ProjectionErrorCode.UNSAFE_PROJECTION_PATH
    assert not (outside / "projections").exists()


@pytest.mark.parametrize("component", ["namespace", "receipts", "manifest", "lock"])
def test_managed_component_symlinks_are_refused(tmp_path: Path, component: str) -> None:
    projections = tmp_path / ".mirror/projections"
    projections.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    if component == "namespace":
        (projections / "sample-extension").symlink_to(outside, target_is_directory=True)
    elif component == "receipts":
        (projections / ".receipts").symlink_to(outside, target_is_directory=True)
    elif component == "manifest":
        target = outside / "manifest.json"
        target.write_text("{}", encoding="utf-8")
        (projections / "current.json").symlink_to(target)
    else:
        target = outside / "lock"
        target.touch()
        (projections / ".publication.lock").symlink_to(target)

    with pytest.raises(ProjectionError) as caught:
        service(tmp_path).publish(extension_document(), domain="extension")
    assert caught.value.code is ProjectionErrorCode.UNSAFE_PROJECTION_PATH


@pytest.mark.parametrize(
    "checkpoint",
    [
        "receipt_temp_created",
        "receipt_written",
        "receipt_fsynced",
        "receipt_installed",
        "receipt_staged",
        "projection_temp_created",
        "projection_written",
        "projection_fsynced",
        "projection_staged",
        "projection_replaced",
        "manifest_built",
        "manifest_temp_created",
        "manifest_written",
        "manifest_fsynced",
        "manifest_staged",
        "manifest_replaced",
        "manifest_synced",
    ],
)
def test_controlled_failures_preserve_or_restore_last_valid_pair(
    tmp_path: Path, checkpoint: str
) -> None:
    stable = extension_document(snapshot="snap-stable", content="stable")
    service(tmp_path).publish(stable, domain="extension")
    projection = tmp_path / ".mirror/projections/sample-extension/tactical.json"
    manifest = tmp_path / ".mirror/projections/current.json"
    before = (projection.read_bytes(), manifest.read_bytes())

    def fail(name: str) -> None:
        if name == checkpoint:
            raise RuntimeError("synthetic failure with private payload")

    with pytest.raises(ProjectionError) as caught:
        service(tmp_path, failure_injector=fail).publish(
            extension_document(snapshot=f"snap-{checkpoint}", content=checkpoint),
            domain="extension",
        )
    assert caught.value.code is ProjectionErrorCode.PUBLICATION_FAILED
    assert "private" not in caught.value.message
    assert (projection.read_bytes(), manifest.read_bytes()) == before
    assert not list((tmp_path / ".mirror/projections").rglob("*.tmp"))


def test_publication_refuses_to_overwrite_a_tampered_current_document(tmp_path: Path) -> None:
    stable = extension_document(snapshot="snap-stable", content="stable")
    service(tmp_path).publish(stable, domain="extension")
    projection = tmp_path / ".mirror/projections/sample-extension/tactical.json"
    tampered = dict(stable)
    tampered["content"] = {"value": "tampered"}
    projection.write_text(json.dumps(tampered, sort_keys=True), encoding="utf-8")

    with pytest.raises(ProjectionError) as caught:
        service(tmp_path).publish(
            extension_document(snapshot="snap-next", content="next"), domain="extension"
        )
    assert caught.value.code is ProjectionErrorCode.PROJECTION_DIVERGENCE
    assert json.loads(projection.read_text())["content"]["value"] == "tampered"


def test_failed_restoration_surfaces_divergence_and_keeps_old_manifest(tmp_path: Path) -> None:
    stable = extension_document(snapshot="snap-stable", content="stable")
    service(tmp_path).publish(stable, domain="extension")
    manifest = tmp_path / ".mirror/projections/current.json"
    old_manifest = manifest.read_bytes()

    def fail(name: str) -> None:
        if name in {"projection_replaced", "restore_temp_created"}:
            raise RuntimeError("synthetic")

    with pytest.raises(ProjectionError) as caught:
        service(tmp_path, failure_injector=fail).publish(
            extension_document(snapshot="snap-interrupted", content="interrupted"),
            domain="extension",
        )
    assert caught.value.code is ProjectionErrorCode.PROJECTION_DIVERGENCE
    assert manifest.read_bytes() == old_manifest
    with pytest.raises(ProjectionError) as inspection:
        service(tmp_path).inspect(
            "synthetic-journey", "sample-extension", "tactical", domain="extension"
        )
    assert inspection.value.code is ProjectionErrorCode.PROJECTION_DIVERGENCE


def test_inspect_reports_divergence_without_repair(tmp_path: Path) -> None:
    service(tmp_path).publish(extension_document(), domain="extension")
    projection = tmp_path / ".mirror/projections/sample-extension/tactical.json"
    projection.write_text("{}\n", encoding="utf-8")
    before = projection.read_bytes()

    with pytest.raises(ProjectionError) as caught:
        service(tmp_path).inspect(
            "synthetic-journey", "sample-extension", "tactical", domain="extension"
        )
    assert caught.value.code is ProjectionErrorCode.PROJECTION_DIVERGENCE
    assert projection.read_bytes() == before
