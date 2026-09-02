from __future__ import annotations

from pathlib import Path

import pytest

from memory.journey_projections.constants import (
    CONTRACT_ID,
    CONTRACT_VERSION,
    EXTENSION_API_VERSION,
    IMPLEMENTED_OPERATIONS,
)
from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.models import (
    ProjectionEnvelope,
    ProjectionManifest,
    validate_identifier,
)
from memory.journey_projections.schemas import load_schema
from memory.journey_projections.serialization import canonical_json_bytes, canonical_sha256
from memory.journey_projections.test_guard import require_isolated_test_home


def operational_document() -> dict:
    return {
        "contractVersion": "1.0",
        "schemaVersion": "1",
        "journeyId": "projection-probe-journey",
        "altitude": "operational",
        "namespace": "ariad",
        "projection": "operational",
        "snapshotId": "op-probe-0001",
        "generatedAt": "2030-01-01T00:00:00Z",
        "producer": {"kind": "ariad", "id": "ariad-compiler", "version": "1.0"},
        "sourceRevision": "sha256:synthetic-revision",
        "sourceSnapshots": [],
        "content": {
            "roadmap": {"roots": []},
            "activeWork": None,
            "exploratoryStories": [],
            "refinementStories": [],
        },
    }


def manifest_document() -> dict:
    return {
        "contractVersion": "1.0",
        "schemaVersion": "1",
        "journeyId": "projection-probe-journey",
        "updatedAt": "2030-01-01T00:00:00Z",
        "projections": {
            "ariad:operational": {
                "namespace": "ariad",
                "projection": "operational",
                "snapshotId": "op-probe-0001",
                "path": ".mirror/projections/ariad/operational.json",
                "sourceRevision": "sha256:synthetic-revision",
            }
        },
    }


def test_public_contract_versions_and_incremental_operation_registry() -> None:
    assert CONTRACT_ID == "mirror.journey-projections"
    assert CONTRACT_VERSION == "1.0"
    assert EXTENSION_API_VERSION == "1.1"
    assert IMPLEMENTED_OPERATIONS == (
        "capabilities",
        "probe-prepare",
        "rebuild-operational",
        "inspect",
        "probe-publish",
    )


@pytest.mark.parametrize(
    "value",
    ["", "a", "../escape", "/tmp/escape", "a/b", "a\\b", " space", "x" * 129],
)
def test_identifier_validation_rejects_unsafe_values_without_echoing_them(value: str) -> None:
    with pytest.raises(ProjectionError) as caught:
        validate_identifier(value)
    assert caught.value.code is ProjectionErrorCode.INVALID_IDENTIFIER
    if len(value) >= 3:
        assert value not in caught.value.message


def test_models_parse_normative_operational_and_manifest_fixtures() -> None:
    envelope = ProjectionEnvelope.from_mapping(operational_document(), domain="operational")
    manifest = ProjectionManifest.from_mapping(manifest_document())

    assert envelope.journey_id == "projection-probe-journey"
    assert envelope.producer.kind == "ariad"
    assert manifest.projections["ariad:operational"].snapshot_id == "op-probe-0001"


def test_schema_documents_are_2020_12_and_local_references_resolve() -> None:
    for name in ("envelope", "manifest", "operational", "extension"):
        schema = load_schema(name)
        assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
        assert schema["$id"].startswith("https://mirror.local/contracts/journey-projections/v1/")


def test_extension_domain_and_optional_schema_compose_without_network() -> None:
    document = operational_document()
    document.update(
        {
            "altitude": "tactical",
            "namespace": "sample-extension",
            "projection": "tactical",
            "snapshotId": "tactical-0001",
            "producer": {
                "kind": "extension",
                "id": "sample-extension",
                "version": "1.0",
            },
            "sourceSnapshots": [
                {
                    "namespace": "ariad",
                    "projection": "operational",
                    "snapshotId": "op-0001",
                }
            ],
            "content": {"signal": "synthetic"},
        }
    )
    optional_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "content": {
                "type": "object",
                "required": ["signal"],
                "properties": {"signal": {"const": "synthetic"}},
            }
        },
    }

    envelope = ProjectionEnvelope.from_mapping(
        document, domain="extension", additional_schema=optional_schema
    )
    assert envelope.producer.kind == "extension"

    with pytest.raises(ProjectionError) as caught:
        ProjectionEnvelope.from_mapping(
            document,
            domain="extension",
            additional_schema={"$ref": "https://untrusted.invalid/schema.json"},
        )
    assert caught.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED
    assert "untrusted" not in caught.value.message


def test_manifest_rejects_unsafe_relative_path() -> None:
    document = manifest_document()
    document["projections"]["ariad:operational"]["path"] = "../private.json"
    with pytest.raises(ProjectionError) as caught:
        ProjectionManifest.from_mapping(document)
    assert caught.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED
    assert "private" not in caught.value.message


def test_models_reject_schema_failure_with_bounded_diagnostic() -> None:
    document = operational_document()
    document["content"]["private"] = {"payload": "sensitive"}

    with pytest.raises(ProjectionError) as caught:
        ProjectionEnvelope.from_mapping(document, domain="operational")

    assert caught.value.code is ProjectionErrorCode.SCHEMA_VALIDATION_FAILED
    assert "payload" not in caught.value.message
    assert "private" not in caught.value.message
    assert len(caught.value.message) <= 240


def test_canonical_serialization_is_stable_utf8_and_strict() -> None:
    left = {"z": "ação", "a": {"two": 2, "one": 1}}
    right = {"a": {"one": 1, "two": 2}, "z": "ação"}

    expected = '{\n  "a": {\n    "one": 1,\n    "two": 2\n  },\n  "z": "ação"\n}\n'.encode()
    assert canonical_json_bytes(left) == expected
    assert canonical_json_bytes(right) == expected
    assert canonical_sha256(left) == canonical_sha256(right)

    with pytest.raises(ProjectionError) as caught:
        canonical_json_bytes({"bad": float("nan")})
    assert caught.value.code is ProjectionErrorCode.SERIALIZATION_FAILED
    assert "nan" not in caught.value.message.lower()


def test_structured_error_payload_is_stable_and_content_free() -> None:
    error = ProjectionError(
        ProjectionErrorCode.UNSUPPORTED_CONTRACT,
        "Journey projection operation is unavailable.",
    )
    assert error.to_dict() == {
        "status": "error",
        "code": "unsupported_contract",
        "message": "Journey projection operation is unavailable.",
    }


def test_probe_guard_accepts_only_explicit_isolated_test_home(tmp_path: Path) -> None:
    isolated = tmp_path / "isolated"
    production = tmp_path / "production"
    isolated.mkdir()
    production.mkdir()

    assert (
        require_isolated_test_home(isolated, production_home=production, environment="test")
        == isolated.resolve()
    )

    for environment, home in (("production", isolated), ("test", production), ("test", None)):
        with pytest.raises(ProjectionError) as caught:
            require_isolated_test_home(home, production_home=production, environment=environment)
        assert caught.value.code is ProjectionErrorCode.UNSUPPORTED_CONTRACT
        assert str(production) not in caught.value.message
        assert str(isolated) not in caught.value.message


def test_probe_guard_refuses_symlink_alias_of_production(tmp_path: Path) -> None:
    production = tmp_path / "production"
    production.mkdir()
    alias = tmp_path / "alias"
    alias.symlink_to(production, target_is_directory=True)

    with pytest.raises(ProjectionError):
        require_isolated_test_home(alias, production_home=production, environment="test")
