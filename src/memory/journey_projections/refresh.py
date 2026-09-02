"""Post-commit Operational projection refresh coordination."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol

from memory.builder.delivery_cursor import get_delivery_cursor
from memory.journey_projections.errors import ProjectionError, ProjectionErrorCode
from memory.journey_projections.models import (
    ProjectionInspection,
    ProjectionPublication,
)
from memory.services.explorer_story import list_explorer_stories
from memory.storage.store import Store


class OperationalRefreshService(Protocol):
    def compile(
        self,
        journey_id: str,
        *,
        active_work: Mapping[str, Any] | None = None,
        exploratory_stories: list[Mapping[str, Any]] | None = None,
    ) -> Mapping[str, Any]: ...

    def inspect(self, journey_id: str) -> ProjectionInspection: ...

    def publish_compiled(self, document: Mapping[str, Any]) -> ProjectionPublication: ...


@dataclass(frozen=True)
class ProjectionRefreshOutcome:
    status: Literal["published", "unchanged", "failed"]
    journey_id: str
    source_revision: str | None = None
    publication: ProjectionPublication | None = None
    code: str | None = None
    message: str | None = None


def active_work_from_cursor(store: Store, journey_id: str) -> dict[str, Any] | None:
    """Project the exact durable Delivery cursor fields owned by Operational v1."""
    cursor = get_delivery_cursor(store, journey_id)
    if cursor is None or cursor.active_item is None:
        return None
    return {
        "activeItem": cursor.active_item,
        "checkpoint": cursor.active_checkpoint,
        "pendingConfirmation": cursor.pending_confirmation,
        "status": cursor.last_delivery_event or "active",
    }


def exploratory_stories_from_store(
    store: Store,
    journey_id: str,
    project_root: Path,
) -> list[Mapping[str, Any]]:
    """Build public Explorer overrides only for stories with durable handoffs."""
    root = project_root.expanduser().resolve(strict=True)
    projected: list[Mapping[str, Any]] = []
    for story in list_explorer_stories(store, journey_id):
        handoff = story.builder_handoff
        if story.id is None or handoff is None or handoff.index_path is None:
            continue
        index_path = _confined_relative(handoff.index_path, root)
        handoff_path = (
            _confined_relative(handoff.handoff_info_path, root)
            if handoff.handoff_info_path
            else index_path
        )
        projected.append(
            {
                "id": story.id,
                "title": story.title or "Exploratory Story",
                "status": story.status,
                "summary": story.narrative_field_summary or "",
                "path": index_path,
                "attractors": [
                    {
                        "title": value.label,
                        "status": value.status,
                        "description": value.description or "",
                    }
                    for value in story.attractors
                ],
                "experiments": (
                    [
                        {
                            "title": story.experiment_proposal.title,
                            "status": story.experiment_proposal.status,
                            "description": story.experiment_proposal.description or "",
                        }
                    ]
                    if story.experiment_proposal
                    else []
                ),
                "handoff": {
                    "status": handoff.readiness,
                    "path": handoff_path,
                },
            }
        )
    return sorted(projected, key=lambda value: str(value["id"]))


def _confined_relative(value: str, root: Path) -> str:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = root / path
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise ProjectionError(
            ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
            "Durable Explorer handoff is unavailable for projection refresh.",
        ) from exc
    if not resolved.is_relative_to(root) or not resolved.is_file():
        raise ProjectionError(
            ProjectionErrorCode.UNSAFE_PROJECTION_PATH,
            "Durable Explorer handoff is outside the registered Journey.",
        )
    return resolved.relative_to(root).as_posix()


class ProjectionRefreshCoordinator:
    """Compile, deduplicate, and publish after source truth has committed."""

    def __init__(
        self,
        operational: OperationalRefreshService,
        *,
        active_work_reader: Callable[[str], Mapping[str, Any] | None] | None = None,
        exploratory_stories_reader: (Callable[[str], list[Mapping[str, Any]] | None] | None) = None,
    ) -> None:
        self._operational = operational
        self._active_work_reader = active_work_reader or (lambda _: None)
        self._exploratory_stories_reader = exploratory_stories_reader or (lambda _: None)
        self._latest: dict[str, ProjectionRefreshOutcome] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def request(self, journey_id: str) -> ProjectionRefreshOutcome:
        """Refresh one Journey without raising beyond this post-commit boundary."""
        with self._lock_for(journey_id):
            try:
                active_work = self._active_work_reader(journey_id)
                exploratory_stories = self._exploratory_stories_reader(journey_id)
                document = self._operational.compile(
                    journey_id,
                    active_work=active_work,
                    exploratory_stories=exploratory_stories,
                )
                revision = self._revision(document)
                current_revision = self._current_revision(journey_id)
                if current_revision == revision:
                    outcome = ProjectionRefreshOutcome(
                        status="unchanged",
                        journey_id=journey_id,
                        source_revision=revision,
                    )
                else:
                    publication = self._operational.publish_compiled(document)
                    outcome = ProjectionRefreshOutcome(
                        status="published",
                        journey_id=journey_id,
                        source_revision=revision,
                        publication=publication,
                    )
            except ProjectionError as exc:
                outcome = self._failed(journey_id, exc.code)
            except Exception:
                outcome = self._failed(journey_id, ProjectionErrorCode.PUBLICATION_FAILED)
            self._latest[journey_id] = outcome
            if outcome.status == "failed":
                logging.getLogger("memory.journey_projections.refresh").warning(
                    "Operational projection refresh failed after source commit: code=%s",
                    outcome.code,
                )
            return outcome

    def latest(self, journey_id: str) -> ProjectionRefreshOutcome | None:
        return self._latest.get(journey_id)

    def _current_revision(self, journey_id: str) -> str | None:
        try:
            inspection = self._operational.inspect(journey_id)
        except ProjectionError as exc:
            if exc.code is ProjectionErrorCode.PROJECTION_DIVERGENCE:
                return None
            raise
        revision = inspection.document.get("sourceRevision")
        return revision if isinstance(revision, str) else None

    @staticmethod
    def _revision(document: Mapping[str, Any]) -> str:
        revision = document.get("sourceRevision")
        if not isinstance(revision, str):
            raise ProjectionError(
                ProjectionErrorCode.SCHEMA_VALIDATION_FAILED,
                "Compiled Operational projection has no source identity.",
            )
        return revision

    @staticmethod
    def _failed(
        journey_id: str,
        code: ProjectionErrorCode,
    ) -> ProjectionRefreshOutcome:
        return ProjectionRefreshOutcome(
            status="failed",
            journey_id=journey_id,
            code=code.value,
            message="Operational projection refresh failed after source truth committed.",
        )

    def _lock_for(self, journey_id: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(journey_id, threading.Lock())
