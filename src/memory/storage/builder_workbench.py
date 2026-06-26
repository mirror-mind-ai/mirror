"""Durable Builder Workbench storage for Ariad Refinement Work."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from memory.models import _now, _uuid
from memory.storage.base import ConnectionBacked

REFINEMENT_STORY_STATUSES = frozenset({"draft", "open", "active", "closed", "parked"})
CHANGE_REQUEST_STATUSES = frozenset(
    {
        "captured",
        "planned",
        "active",
        "implemented",
        "validated",
        "done",
        "parked",
        "rejected",
        "promoted",
    }
)


@dataclass(frozen=True)
class RefinementStoryRecord:
    id: str
    journey: str
    title: str
    description: str | None
    status: str
    position: int
    source: str
    provenance: str | None
    created_at: str
    updated_at: str
    pulled_at: str | None
    closed_at: str | None


@dataclass(frozen=True)
class ChangeRequestRecord:
    id: str
    journey: str
    refinement_story_id: str | None
    title: str
    body: str
    status: str
    position: int
    source: str
    provenance: str | None
    outcome_notes: str | None
    created_at: str
    updated_at: str
    completed_at: str | None


@dataclass(frozen=True)
class RefinementCursorRecord:
    journey: str
    active_refinement_story_id: str | None
    active_change_request_id: str | None
    last_refinement_event: str | None
    updated_at: str


class BuilderWorkbenchStore(ConnectionBacked):
    """Storage mixin for durable Builder Workbench records."""

    def create_refinement_story(
        self,
        *,
        journey: str,
        title: str,
        description: str | None = None,
        status: str = "draft",
        source: str = "manual",
        provenance: str | None = None,
        position: int | None = None,
    ) -> RefinementStoryRecord:
        journey = _normalize_required(journey, "journey")
        title = _normalize_required(title, "title")
        status = _normalize_status(status, REFINEMENT_STORY_STATUSES, "status")
        source = _normalize_required(source, "source")
        resolved_position = (
            position if position is not None else self._next_refinement_story_position(journey)
        )
        now = _now()
        story_id = _uuid()
        self.conn.execute(
            """INSERT INTO builder_refinement_stories
               (id, journey, title, description, status, position, source, provenance,
                created_at, updated_at, pulled_at, closed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)""",
            (
                story_id,
                journey,
                title,
                _normalize_optional(description),
                status,
                resolved_position,
                source,
                _normalize_optional(provenance),
                now,
                now,
            ),
        )
        self.conn.commit()
        record = self.get_refinement_story(story_id)
        assert record is not None
        return record

    def get_refinement_story(self, story_id: str) -> RefinementStoryRecord | None:
        story_id = _normalize_required(story_id, "story_id")
        row = self.conn.execute(
            "SELECT * FROM builder_refinement_stories WHERE id = ?",
            (story_id,),
        ).fetchone()
        return _story_from_row(row) if row else None

    def list_refinement_stories(
        self, journey: str, *, status: str | None = None
    ) -> tuple[RefinementStoryRecord, ...]:
        journey = _normalize_required(journey, "journey")
        params: list[str] = [journey]
        sql = "SELECT * FROM builder_refinement_stories WHERE journey = ?"
        if status is not None:
            sql += " AND status = ?"
            params.append(_normalize_status(status, REFINEMENT_STORY_STATUSES, "status"))
        sql += " ORDER BY position ASC, created_at ASC, id ASC"
        rows = self.conn.execute(sql, params).fetchall()
        return tuple(_story_from_row(row) for row in rows)

    def update_refinement_story_status(
        self,
        story_id: str,
        status: str,
        *,
        pulled_at: str | None = None,
        closed_at: str | None = None,
    ) -> RefinementStoryRecord:
        story_id = _normalize_required(story_id, "story_id")
        status = _normalize_status(status, REFINEMENT_STORY_STATUSES, "status")
        existing = self.get_refinement_story(story_id)
        if existing is None:
            raise ValueError("story_id does not exist")
        now = _now()
        self.conn.execute(
            """UPDATE builder_refinement_stories
               SET status = ?, updated_at = ?, pulled_at = COALESCE(?, pulled_at),
                   closed_at = COALESCE(?, closed_at)
               WHERE id = ?""",
            (status, now, _normalize_optional(pulled_at), _normalize_optional(closed_at), story_id),
        )
        self.conn.commit()
        updated = self.get_refinement_story(story_id)
        assert updated is not None
        return updated

    def create_change_request(
        self,
        *,
        journey: str,
        title: str,
        body: str,
        refinement_story_id: str | None = None,
        status: str = "captured",
        source: str = "manual",
        provenance: str | None = None,
        position: int | None = None,
    ) -> ChangeRequestRecord:
        journey = _normalize_required(journey, "journey")
        title = _normalize_required(title, "title")
        body = _normalize_required(body, "body")
        status = _normalize_status(status, CHANGE_REQUEST_STATUSES, "status")
        source = _normalize_required(source, "source")
        normalized_story_id = _normalize_optional(refinement_story_id)
        if normalized_story_id is not None:
            story = self.get_refinement_story(normalized_story_id)
            if story is None:
                raise ValueError("refinement_story_id does not exist")
            if story.journey != journey:
                raise ValueError("refinement_story_id belongs to a different journey")
        resolved_position = (
            position
            if position is not None
            else self._next_change_request_position(journey, normalized_story_id)
        )
        now = _now()
        change_request_id = _uuid()
        self.conn.execute(
            """INSERT INTO builder_change_requests
               (id, journey, refinement_story_id, title, body, status, position, source,
                provenance, outcome_notes, created_at, updated_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)""",
            (
                change_request_id,
                journey,
                normalized_story_id,
                title,
                body,
                status,
                resolved_position,
                source,
                _normalize_optional(provenance),
                now,
                now,
            ),
        )
        self.conn.commit()
        record = self.get_change_request(change_request_id)
        assert record is not None
        return record

    def get_change_request(self, change_request_id: str) -> ChangeRequestRecord | None:
        change_request_id = _normalize_required(change_request_id, "change_request_id")
        row = self.conn.execute(
            "SELECT * FROM builder_change_requests WHERE id = ?",
            (change_request_id,),
        ).fetchone()
        return _change_request_from_row(row) if row else None

    def list_change_requests(
        self,
        journey: str,
        *,
        refinement_story_id: str | None = None,
        status: str | None = None,
        include_unassigned: bool = True,
    ) -> tuple[ChangeRequestRecord, ...]:
        journey = _normalize_required(journey, "journey")
        params: list[str] = [journey]
        sql = "SELECT * FROM builder_change_requests WHERE journey = ?"
        normalized_story_id = _normalize_optional(refinement_story_id)
        if normalized_story_id is not None:
            sql += " AND refinement_story_id = ?"
            params.append(normalized_story_id)
        elif not include_unassigned:
            sql += " AND refinement_story_id IS NOT NULL"
        if status is not None:
            sql += " AND status = ?"
            params.append(_normalize_status(status, CHANGE_REQUEST_STATUSES, "status"))
        sql += " ORDER BY position ASC, created_at ASC, id ASC"
        rows = self.conn.execute(sql, params).fetchall()
        return tuple(_change_request_from_row(row) for row in rows)

    def update_change_request_status(
        self,
        change_request_id: str,
        status: str,
        *,
        outcome_notes: str | None = None,
        completed_at: str | None = None,
    ) -> ChangeRequestRecord:
        change_request_id = _normalize_required(change_request_id, "change_request_id")
        status = _normalize_status(status, CHANGE_REQUEST_STATUSES, "status")
        existing = self.get_change_request(change_request_id)
        if existing is None:
            raise ValueError("change_request_id does not exist")
        now = _now()
        self.conn.execute(
            """UPDATE builder_change_requests
               SET status = ?, outcome_notes = COALESCE(?, outcome_notes),
                   completed_at = COALESCE(?, completed_at), updated_at = ?
               WHERE id = ?""",
            (
                status,
                _normalize_optional(outcome_notes),
                _normalize_optional(completed_at),
                now,
                change_request_id,
            ),
        )
        self.conn.commit()
        updated = self.get_change_request(change_request_id)
        assert updated is not None
        return updated

    def attach_change_request_to_story(
        self,
        change_request_id: str,
        refinement_story_id: str,
        *,
        position: int | None = None,
    ) -> ChangeRequestRecord:
        change_request = self.get_change_request(change_request_id)
        if change_request is None:
            raise ValueError("change_request_id does not exist")
        story = self.get_refinement_story(refinement_story_id)
        if story is None:
            raise ValueError("refinement_story_id does not exist")
        if story.journey != change_request.journey:
            raise ValueError("refinement_story_id belongs to a different journey")
        resolved_position = (
            position
            if position is not None
            else self._next_change_request_position(change_request.journey, story.id)
        )
        self.conn.execute(
            """UPDATE builder_change_requests
               SET refinement_story_id = ?, position = ?, updated_at = ?
               WHERE id = ?""",
            (story.id, resolved_position, _now(), change_request.id),
        )
        self.conn.commit()
        updated = self.get_change_request(change_request.id)
        assert updated is not None
        return updated

    def set_refinement_cursor(
        self,
        *,
        journey: str,
        active_refinement_story_id: str | None = None,
        active_change_request_id: str | None = None,
        last_refinement_event: str | None = None,
    ) -> RefinementCursorRecord:
        journey = _normalize_required(journey, "journey")
        story_id = _normalize_optional(active_refinement_story_id)
        change_request_id = _normalize_optional(active_change_request_id)
        if story_id is not None:
            story = self.get_refinement_story(story_id)
            if story is None or story.journey != journey:
                raise ValueError("active_refinement_story_id is invalid for journey")
        if change_request_id is not None:
            change_request = self.get_change_request(change_request_id)
            if change_request is None or change_request.journey != journey:
                raise ValueError("active_change_request_id is invalid for journey")
        now = _now()
        self.conn.execute(
            """INSERT INTO builder_refinement_cursors
               (journey, active_refinement_story_id, active_change_request_id,
                last_refinement_event, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(journey) DO UPDATE SET
                 active_refinement_story_id = excluded.active_refinement_story_id,
                 active_change_request_id = excluded.active_change_request_id,
                 last_refinement_event = excluded.last_refinement_event,
                 updated_at = excluded.updated_at""",
            (journey, story_id, change_request_id, _normalize_optional(last_refinement_event), now),
        )
        self.conn.commit()
        cursor = self.get_refinement_cursor(journey)
        assert cursor is not None
        return cursor

    def get_refinement_cursor(self, journey: str) -> RefinementCursorRecord | None:
        journey = _normalize_required(journey, "journey")
        row = self.conn.execute(
            "SELECT * FROM builder_refinement_cursors WHERE journey = ?",
            (journey,),
        ).fetchone()
        return _cursor_from_row(row) if row else None

    def clear_refinement_cursor(self, journey: str) -> None:
        journey = _normalize_required(journey, "journey")
        self.conn.execute("DELETE FROM builder_refinement_cursors WHERE journey = ?", (journey,))
        self.conn.commit()

    def _next_refinement_story_position(self, journey: str) -> int:
        row = self.conn.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM builder_refinement_stories WHERE journey = ?",
            (journey,),
        ).fetchone()
        return int(row[0])

    def _next_change_request_position(self, journey: str, story_id: str | None) -> int:
        if story_id is None:
            row = self.conn.execute(
                """SELECT COALESCE(MAX(position), -1) + 1 FROM builder_change_requests
                   WHERE journey = ? AND refinement_story_id IS NULL""",
                (journey,),
            ).fetchone()
        else:
            row = self.conn.execute(
                """SELECT COALESCE(MAX(position), -1) + 1 FROM builder_change_requests
                   WHERE journey = ? AND refinement_story_id = ?""",
                (journey, story_id),
            ).fetchone()
        return int(row[0])


def _story_from_row(row: sqlite3.Row) -> RefinementStoryRecord:
    data = dict(row)
    return RefinementStoryRecord(**data)


def _change_request_from_row(row: sqlite3.Row) -> ChangeRequestRecord:
    data = dict(row)
    return ChangeRequestRecord(**data)


def _cursor_from_row(row: sqlite3.Row) -> RefinementCursorRecord:
    data = dict(row)
    return RefinementCursorRecord(**data)


def _normalize_required(value: str, field_name: str) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    if not normalized:
        raise ValueError(f"{field_name} must not be empty")
    return normalized


def _normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip() if isinstance(value, str) else ""
    return normalized or None


def _normalize_status(value: str, allowed: frozenset[str], field_name: str) -> str:
    normalized = _normalize_required(value, field_name)
    if normalized not in allowed:
        raise ValueError(f"{field_name} must be one of: {', '.join(sorted(allowed))}")
    return normalized
