"""Immutable DTOs for Journey Projection Contract v1 documents."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode

_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$")


def validate_identifier(value: object) -> str:
    if not isinstance(value, str) or not _IDENTIFIER_RE.fullmatch(value):
        raise ProjectionError(
            ProjectionErrorCode.INVALID_IDENTIFIER,
            "Projection identifier does not satisfy the v1 identifier contract.",
        )
    return value


@dataclass(frozen=True)
class ProjectionProducer:
    kind: Literal["ariad", "extension"]
    id: str
    version: str


@dataclass(frozen=True)
class SourceSnapshot:
    namespace: str
    projection: str
    snapshot_id: str


@dataclass(frozen=True)
class ProjectionEnvelope:
    contract_version: str
    schema_version: str
    journey_id: str
    altitude: Literal["operational", "tactical", "strategic"]
    namespace: str
    projection: str
    snapshot_id: str
    generated_at: str
    producer: ProjectionProducer
    source_revision: str
    source_snapshots: tuple[SourceSnapshot, ...]
    content: Mapping[str, Any]

    @classmethod
    def from_mapping(
        cls,
        document: Mapping[str, Any],
        *,
        domain: Literal["envelope", "operational", "extension"] = "envelope",
        additional_schema: Mapping[str, Any] | None = None,
    ) -> ProjectionEnvelope:
        from memory.journey_projections.schemas import validate_projection_document

        validate_projection_document(document, domain=domain, additional_schema=additional_schema)
        producer = document["producer"]
        snapshots = document["sourceSnapshots"]
        return cls(
            contract_version=document["contractVersion"],
            schema_version=document["schemaVersion"],
            journey_id=validate_identifier(document["journeyId"]),
            altitude=document["altitude"],
            namespace=validate_identifier(document["namespace"]),
            projection=validate_identifier(document["projection"]),
            snapshot_id=validate_identifier(document["snapshotId"]),
            generated_at=document["generatedAt"],
            producer=ProjectionProducer(
                kind=producer["kind"],
                id=validate_identifier(producer["id"]),
                version=producer["version"],
            ),
            source_revision=document["sourceRevision"],
            source_snapshots=tuple(
                SourceSnapshot(
                    namespace=validate_identifier(item["namespace"]),
                    projection=validate_identifier(item["projection"]),
                    snapshot_id=validate_identifier(item["snapshotId"]),
                )
                for item in snapshots
            ),
            content=document["content"],
        )


@dataclass(frozen=True)
class ManifestEntry:
    namespace: str
    projection: str
    snapshot_id: str
    path: str
    source_revision: str


@dataclass(frozen=True)
class ProjectionPublication:
    status: Literal["published"]
    journey_id: str
    namespace: str
    projection: str
    snapshot_id: str
    source_revision: str


@dataclass(frozen=True)
class ProjectionInspection:
    status: Literal["ok"]
    document: Mapping[str, Any]
    manifest_entry: Mapping[str, Any]


@dataclass(frozen=True)
class ProjectionManifest:
    contract_version: str
    schema_version: str
    journey_id: str
    updated_at: str
    projections: Mapping[str, ManifestEntry]

    @classmethod
    def from_mapping(cls, document: Mapping[str, Any]) -> ProjectionManifest:
        from memory.journey_projections.schemas import validate_manifest_document

        validate_manifest_document(document)
        return cls(
            contract_version=document["contractVersion"],
            schema_version=document["schemaVersion"],
            journey_id=validate_identifier(document["journeyId"]),
            updated_at=document["updatedAt"],
            projections={
                key: ManifestEntry(
                    namespace=validate_identifier(item["namespace"]),
                    projection=validate_identifier(item["projection"]),
                    snapshot_id=validate_identifier(item["snapshotId"]),
                    path=item["path"],
                    source_revision=item["sourceRevision"],
                )
                for key, item in document["projections"].items()
            },
        )
