from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from memory.extensions import VERSION as EXTENSION_API_VERSION
from memory.extensions import ExtensionAPI
from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.models import ProjectionInspection, ProjectionPublication


def extension_document(
    *,
    extension_id: str = "sample-extension",
    journey_id: str = "synthetic-journey",
    projection: str = "tactical",
    altitude: str = "tactical",
    content: str = "first",
) -> dict[str, Any]:
    return {
        "contractVersion": "1.0",
        "schemaVersion": "1",
        "journeyId": journey_id,
        "altitude": altitude,
        "namespace": extension_id,
        "projection": projection,
        "snapshotId": "snap-0001",
        "generatedAt": "2030-01-01T00:00:00Z",
        "producer": {"kind": "extension", "id": extension_id, "version": "1.0"},
        "sourceRevision": f"sha256:{content}",
        "sourceSnapshots": [
            {"namespace": "ariad", "projection": "operational", "snapshotId": "op-0001"}
        ],
        "content": {"value": content},
    }


class RecordingService:
    def __init__(self) -> None:
        self.publish_calls: list[tuple[object, str, object]] = []
        self.inspect_calls: list[tuple[str, str, str, str]] = []

    def publish(self, document, *, domain="envelope", additional_schema=None):
        self.publish_calls.append((document, domain, additional_schema))
        return ProjectionPublication(
            status="published",
            journey_id=document["journeyId"],
            namespace=document["namespace"],
            projection=document["projection"],
            snapshot_id=document["snapshotId"],
            source_revision=document["sourceRevision"],
        )

    def inspect(self, journey_id, namespace, projection, *, domain="envelope"):
        self.inspect_calls.append((journey_id, namespace, projection, domain))
        return ProjectionInspection(
            status="ok",
            document=extension_document(
                extension_id=namespace, journey_id=journey_id, projection=projection
            ),
            manifest_entry={"namespace": namespace, "projection": projection},
        )


def api_with_service(db_conn, service: RecordingService, extension_id="sample-extension"):
    return ExtensionAPI(
        extension_id=extension_id,
        connection=db_conn,
        journey_projection_service=service,  # type: ignore[arg-type]
    )


def test_extension_api_version_is_additive_1_1() -> None:
    from memory.extensions.api import VERSION as API_MODULE_VERSION

    assert EXTENSION_API_VERSION == API_MODULE_VERSION == "1.1"


def test_extension_api_exposes_bound_projection_facade(db_conn) -> None:
    service = RecordingService()
    api = api_with_service(db_conn, service)
    schema = {"type": "object", "required": ["content"]}
    document = extension_document()

    published = api.journey_projections.publish(
        "synthetic-journey", "tactical", document, schema=schema
    )
    inspected = api.journey_projections.inspect("synthetic-journey", "tactical")

    assert published.snapshot_id == "snap-0001"
    assert inspected.document["namespace"] == "sample-extension"
    assert service.publish_calls == [(document, "extension", schema)]
    assert service.inspect_calls == [
        ("synthetic-journey", "sample-extension", "tactical", "extension")
    ]


@pytest.mark.parametrize(
    ("mutation", "argument_journey", "argument_projection"),
    [
        ({"namespace": "foreign-extension"}, "synthetic-journey", "tactical"),
        ({"namespace": "ariad"}, "synthetic-journey", "tactical"),
        ({"producer.id": "foreign-extension"}, "synthetic-journey", "tactical"),
        ({"producer.kind": "ariad"}, "synthetic-journey", "tactical"),
        ({}, "foreign-journey", "tactical"),
        ({}, "synthetic-journey", "strategic"),
    ],
)
def test_publish_rejects_unbound_document_authority_before_delegation(
    db_conn,
    mutation: dict[str, str],
    argument_journey: str,
    argument_projection: str,
) -> None:
    service = RecordingService()
    api = api_with_service(db_conn, service)
    document = extension_document()
    for path, value in mutation.items():
        if path.startswith("producer."):
            document["producer"][path.split(".", 1)[1]] = value
        else:
            document[path] = value

    with pytest.raises(ProjectionError) as caught:
        api.journey_projections.publish(argument_journey, argument_projection, document)

    assert caught.value.code is ProjectionErrorCode.NAMESPACE_VIOLATION
    assert service.publish_calls == []
    assert "foreign" not in caught.value.message


def test_ariad_named_extension_has_no_projection_authority(db_conn) -> None:
    service = RecordingService()
    api = api_with_service(db_conn, service, extension_id="ariad")

    with pytest.raises(ProjectionError) as publication:
        api.journey_projections.publish(
            "synthetic-journey",
            "tactical",
            extension_document(extension_id="ariad"),
        )
    with pytest.raises(ProjectionError) as inspection:
        api.journey_projections.inspect("synthetic-journey", "operational")

    assert publication.value.code is ProjectionErrorCode.NAMESPACE_VIOLATION
    assert inspection.value.code is ProjectionErrorCode.NAMESPACE_VIOLATION
    assert service.publish_calls == []
    assert service.inspect_calls == []


def _register_journey(db_conn, journey_id: str, root: Path | None) -> None:
    metadata = json.dumps({"project_path": str(root)}) if root is not None else "{}"
    db_conn.execute(
        """INSERT INTO identity
           (id, layer, key, content, created_at, updated_at, metadata)
           VALUES (?, 'journey', ?, '# Synthetic', ?, ?, ?)""",
        (
            f"identity-{journey_id}",
            journey_id,
            "2030-01-01T00:00:00Z",
            "2030-01-01T00:00:00Z",
            metadata,
        ),
    )
    db_conn.commit()


def test_default_facade_resolves_registered_root_and_uses_real_kernel(
    db_conn, tmp_path: Path
) -> None:
    root = tmp_path / "journey-root"
    root.mkdir()
    _register_journey(db_conn, "synthetic-journey", root)
    api = ExtensionAPI(extension_id="sample-extension", connection=db_conn)
    document = extension_document()

    publication = api.journey_projections.publish("synthetic-journey", "tactical", document)
    inspection = api.journey_projections.inspect("synthetic-journey", "tactical")

    assert publication.status == "published"
    assert inspection.document == document
    assert (root / ".mirror/projections/sample-extension/tactical.json").exists()


def test_optional_schema_fails_offline_before_real_kernel_mutation(db_conn, tmp_path: Path) -> None:
    root = tmp_path / "journey-root"
    root.mkdir()
    _register_journey(db_conn, "synthetic-journey", root)
    api = ExtensionAPI(extension_id="sample-extension", connection=db_conn)
    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {"content": {"required": ["requiredByExtension"]}},
    }

    with pytest.raises(ProjectionError) as caught:
        api.journey_projections.publish(
            "synthetic-journey", "tactical", extension_document(), schema=schema
        )

    assert caught.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED
    assert not (root / ".mirror").exists()


@pytest.mark.parametrize(
    "schema",
    [
        {"type": 42},
        {"$ref": "https://schemas.invalid/extension-projection.json"},
    ],
)
def test_invalid_or_unresolvable_optional_schema_fails_offline(
    db_conn, tmp_path: Path, schema: dict[str, Any]
) -> None:
    root = tmp_path / "journey-root"
    root.mkdir()
    _register_journey(db_conn, "synthetic-journey", root)
    api = ExtensionAPI(extension_id="sample-extension", connection=db_conn)

    with pytest.raises(ProjectionError) as caught:
        api.journey_projections.publish(
            "synthetic-journey", "tactical", extension_document(), schema=schema
        )

    assert caught.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED
    assert not (root / ".mirror").exists()


def test_two_extensions_share_kernel_without_cross_namespace_access(
    db_conn, tmp_path: Path
) -> None:
    root = tmp_path / "journey-root"
    root.mkdir()
    _register_journey(db_conn, "synthetic-journey", root)
    first = ExtensionAPI(extension_id="first-extension", connection=db_conn)
    second = ExtensionAPI(extension_id="second-extension", connection=db_conn)
    first_document = extension_document(extension_id="first-extension", content="first")
    second_document = extension_document(extension_id="second-extension", content="second")

    first.journey_projections.publish("synthetic-journey", "tactical", first_document)
    second.journey_projections.publish("synthetic-journey", "tactical", second_document)

    assert (
        first.journey_projections.inspect("synthetic-journey", "tactical").document
        == first_document
    )
    assert (
        second.journey_projections.inspect("synthetic-journey", "tactical").document
        == second_document
    )
    manifest = json.loads((root / ".mirror/projections/current.json").read_text())
    assert set(manifest["projections"]) == {
        "first-extension:tactical",
        "second-extension:tactical",
    }


def test_unknown_or_unregistered_journey_never_accepts_a_caller_root(
    db_conn, tmp_path: Path
) -> None:
    _register_journey(db_conn, "unregistered-journey", None)
    api = ExtensionAPI(extension_id="sample-extension", connection=db_conn)

    for journey_id in ("unknown-journey", "unregistered-journey"):
        document = extension_document(journey_id=journey_id)
        with pytest.raises(ProjectionError) as caught:
            api.journey_projections.publish(journey_id, "tactical", document)
        assert caught.value.code is ProjectionErrorCode.UNKNOWN_JOURNEY

    assert not (tmp_path / ".mirror").exists()
