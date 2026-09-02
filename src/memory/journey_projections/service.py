"""Registered-Journey façade over the projection publication kernel."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, Literal

from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.models import (
    ProjectionEnvelope,
    ProjectionInspection,
    ProjectionPublication,
    validate_identifier,
)
from memory.journey_projections.storage import FailureInjector, ProjectionStore

JourneyRootResolver = Callable[[str], Path | str | None]
ProjectionDomain = Literal["envelope", "operational", "extension"]


class JourneyProjectionService:
    def __init__(
        self,
        root_resolver: JourneyRootResolver,
        *,
        lock_timeout: float = 10.0,
        failure_injector: FailureInjector | None = None,
    ) -> None:
        self.root_resolver = root_resolver
        self.lock_timeout = lock_timeout
        self.failure_injector = failure_injector

    def publish(
        self,
        document: Mapping[str, Any],
        *,
        domain: ProjectionDomain = "envelope",
        additional_schema: Mapping[str, Any] | None = None,
    ) -> ProjectionPublication:
        envelope = ProjectionEnvelope.from_mapping(
            document,
            domain=domain,
            additional_schema=additional_schema,
        )
        store = self._store(envelope.journey_id)
        return store.publish(document, envelope)

    def inspect(
        self,
        journey_id: str,
        namespace: str,
        projection: str,
        *,
        domain: ProjectionDomain = "envelope",
    ) -> ProjectionInspection:
        validate_identifier(journey_id)
        validate_identifier(namespace)
        validate_identifier(projection)
        return self._store(journey_id).inspect(
            journey_id,
            namespace,
            projection,
            domain=domain,
        )

    def registered_root(self, journey_id: str) -> Path:
        """Resolve and validate the authoritative registered Journey root."""
        validate_identifier(journey_id)
        return self._store(journey_id).root

    def _store(self, journey_id: str) -> ProjectionStore:
        root = self.root_resolver(journey_id)
        if root is None:
            raise ProjectionError(
                ProjectionErrorCode.UNKNOWN_JOURNEY,
                "Registered Journey is unknown or has no project root.",
            )
        return ProjectionStore(
            Path(root),
            lock_timeout=self.lock_timeout,
            failure_injector=self.failure_injector,
        )
