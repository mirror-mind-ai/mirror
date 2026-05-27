"""Operation run audit service for web operations."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from memory.models import _now
from memory.storage.store import Store


@dataclass(frozen=True)
class OperationRun:
    id: str
    operation_id: str
    status: str
    outcome: str | None
    parameters: dict[str, Any]
    summary: list[str]
    result: dict[str, Any] | None
    error: str | None
    started_at: str
    completed_at: str | None
    created_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "operationId": self.operation_id,
            "status": self.status,
            "outcome": self.outcome,
            "parameters": self.parameters,
            "summary": self.summary,
            "result": self.result,
            "error": self.error,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
            "createdAt": self.created_at,
        }


class OperationRunService:
    def __init__(self, store: Store) -> None:
        self.store = store

    def start(
        self, operation_id: str, parameters: dict[str, Any], *, status: str = "running"
    ) -> OperationRun:
        timestamp = _now()
        run_id = str(uuid4())
        self.store.conn.execute(
            """
            INSERT INTO operation_runs (
                id, operation_id, status, parameters_json, started_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (run_id, operation_id, status, _json(parameters), timestamp, timestamp),
        )
        self.store.conn.commit()
        return self.get(run_id)

    def queue(self, operation_id: str, parameters: dict[str, Any]) -> OperationRun:
        return self.start(operation_id, parameters, status="queued")

    def mark_running(self, run_id: str) -> OperationRun:
        timestamp = _now()
        self.store.conn.execute(
            """
            UPDATE operation_runs
               SET status = ?, started_at = ?
             WHERE id = ?
            """,
            ("running", timestamp, run_id),
        )
        self.store.conn.commit()
        return self.get(run_id)

    def complete(
        self,
        run_id: str,
        *,
        outcome: str,
        summary: list[str],
        result: dict[str, Any],
    ) -> OperationRun:
        timestamp = _now()
        self.store.conn.execute(
            """
            UPDATE operation_runs
               SET status = ?, outcome = ?, summary_json = ?, result_json = ?,
                   error = NULL, completed_at = ?
             WHERE id = ?
            """,
            ("completed", outcome, _json(summary), _json(result), timestamp, run_id),
        )
        self.store.conn.commit()
        return self.get(run_id)

    def fail(self, run_id: str, *, error: str) -> OperationRun:
        timestamp = _now()
        self.store.conn.execute(
            """
            UPDATE operation_runs
               SET status = ?, error = ?, completed_at = ?
             WHERE id = ?
            """,
            ("failed", error, timestamp, run_id),
        )
        self.store.conn.commit()
        return self.get(run_id)

    def get(self, run_id: str) -> OperationRun:
        row = self.store.conn.execute(
            "SELECT * FROM operation_runs WHERE id = ?", (run_id,)
        ).fetchone()
        if row is None:
            raise ValueError(f"Operation run not found: {run_id}")
        return _row_to_run(row)

    def recent(self, limit: int = 20) -> list[OperationRun]:
        bounded_limit = max(1, min(limit, 100))
        rows = self.store.conn.execute(
            """
            SELECT * FROM operation_runs
             ORDER BY started_at DESC
             LIMIT ?
            """,
            (bounded_limit,),
        ).fetchall()
        return [_row_to_run(row) for row in rows]


def _row_to_run(row: Any) -> OperationRun:
    return OperationRun(
        id=row["id"],
        operation_id=row["operation_id"],
        status=row["status"],
        outcome=row["outcome"],
        parameters=_json_loads(row["parameters_json"], default={}),
        summary=_json_loads(row["summary_json"], default=[]),
        result=_json_loads(row["result_json"], default=None),
        error=row["error"],
        started_at=row["started_at"],
        completed_at=row["completed_at"],
        created_at=row["created_at"],
    )


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True)


def _json_loads(raw: str | None, *, default: Any) -> Any:
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default
