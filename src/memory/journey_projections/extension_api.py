"""Namespace-bound Journey projection façade for installed extensions."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.models import (
    ProjectionEnvelope,
    ProjectionInspection,
    ProjectionPublication,
    validate_identifier,
)
from memory.journey_projections.service import JourneyProjectionService

_RESERVED_NAMESPACE = "ariad"


def registered_journey_root_resolver(
    connection: sqlite3.Connection,
) -> Callable[[str], Path | None]:
    """Build a lazy resolver over authoritative Journey registry metadata."""

    def resolve(journey_id: str) -> Path | None:
        try:
            row = connection.execute(
                "SELECT metadata FROM identity WHERE layer = 'journey' AND key = ?",
                (journey_id,),
            ).fetchone()
        except sqlite3.Error:
            return None
        if row is None:
            return None
        try:
            metadata = json.loads(row[0] or "{}")
        except (json.JSONDecodeError, TypeError):
            return None
        if not isinstance(metadata, dict):
            return None
        project_path = metadata.get("project_path")
        if not isinstance(project_path, str) or not project_path.strip():
            return None
        return Path(project_path).expanduser()

    return resolve


class ExtensionJourneyProjections:
    """Stable projection capability bound permanently to one extension ID."""

    def __init__(
        self,
        extension_id: str,
        service: JourneyProjectionService,
    ) -> None:
        self.extension_id = extension_id
        self._service = service

    def publish(
        self,
        journey_id: str,
        projection_id: str,
        document: Mapping[str, Any],
        schema: Mapping[str, Any] | None = None,
    ) -> ProjectionPublication:
        """Publish one extension-owned document through the shared kernel."""
        validate_identifier(journey_id)
        validate_identifier(projection_id)
        envelope = ProjectionEnvelope.from_mapping(document, domain="envelope")
        self._require_extension_authority(
            envelope,
            journey_id=journey_id,
            projection_id=projection_id,
        )
        return self._service.publish(
            document,
            domain="extension",
            additional_schema=schema,
        )

    def inspect(
        self,
        journey_id: str,
        projection_id: str,
    ) -> ProjectionInspection:
        """Inspect only this extension's current projection state."""
        self._require_non_reserved_extension()
        validate_identifier(journey_id)
        validate_identifier(projection_id)
        validate_identifier(self.extension_id)
        return self._service.inspect(
            journey_id,
            self.extension_id,
            projection_id,
            domain="extension",
        )

    def _require_extension_authority(
        self,
        envelope: ProjectionEnvelope,
        *,
        journey_id: str,
        projection_id: str,
    ) -> None:
        self._require_non_reserved_extension()
        validate_identifier(self.extension_id)
        if (
            envelope.journey_id != journey_id
            or envelope.projection != projection_id
            or envelope.namespace != self.extension_id
            or envelope.producer.kind != "extension"
            or envelope.producer.id != self.extension_id
        ):
            raise ProjectionError(
                ProjectionErrorCode.NAMESPACE_VIOLATION,
                "Extension projection identity does not match the bound extension authority.",
            )

    def _require_non_reserved_extension(self) -> None:
        if self.extension_id == _RESERVED_NAMESPACE:
            raise ProjectionError(
                ProjectionErrorCode.NAMESPACE_VIOLATION,
                "The Ariad projection namespace is reserved for Mirror Core.",
            )
