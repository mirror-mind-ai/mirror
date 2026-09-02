"""Atomic persistence boundary for canonical Journey administration."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from memory.models import Identity
from memory.storage.base import ConnectionBacked


def source_version(rows: list[Any]) -> str:
    canonical = [
        {
            "id": row["id"],
            "key": row["key"],
            "content": row["content"],
            "version": row["version"],
            "updated_at": row["updated_at"],
            "metadata": row["metadata"] or "",
        }
        for row in rows
    ]
    encoded = json.dumps(
        canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


class JourneyAdminStore(ConnectionBacked):
    def journey_rows(self) -> list[Any]:
        return self.conn.execute(
            "SELECT id, key, content, version, created_at, updated_at, metadata FROM identity WHERE layer = 'journey' ORDER BY key"
        ).fetchall()

    def journey_source_version(self) -> str:
        return source_version(self.journey_rows())

    def get_journey_mutation_receipt(self, request_id: str) -> Any | None:
        return self.conn.execute(
            "SELECT * FROM journey_mutation_receipts WHERE request_id = ?", (request_id,)
        ).fetchone()

    def apply_journey_mutation(
        self,
        *,
        expected_source_version: str,
        request_id: str,
        request_digest: str,
        operation: str,
        journey_id: str,
        create: Identity | None,
        metadata_updates: dict[str, str],
        delete: bool = False,
    ) -> tuple[str, bool]:
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            existing = self.conn.execute(
                "SELECT request_digest, result_version FROM journey_mutation_receipts WHERE request_id = ?",
                (request_id,),
            ).fetchone()
            if existing:
                if existing["request_digest"] != request_digest:
                    raise ValueError("idempotency_conflict")
                self.conn.rollback()
                return str(existing["result_version"]), True
            current = source_version(self.journey_rows())
            if current != expected_source_version:
                raise ValueError("stale_source")
            now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            if create is not None:
                self.conn.execute(
                    "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at, metadata) VALUES (?, 'journey', ?, ?, ?, ?, ?, ?)",
                    (
                        create.id,
                        create.key,
                        create.content,
                        create.version,
                        now,
                        now,
                        create.metadata,
                    ),
                )
            for key, metadata in metadata_updates.items():
                cursor = self.conn.execute(
                    "UPDATE identity SET metadata = ?, updated_at = ? WHERE layer = 'journey' AND key = ?",
                    (metadata, now, key),
                )
                if cursor.rowcount != 1:
                    raise ValueError("unknown_journey")
            if delete:
                identity = self.conn.execute(
                    "SELECT id FROM identity WHERE layer = 'journey' AND key = ?", (journey_id,)
                ).fetchone()
                if identity is None:
                    raise ValueError("unknown_journey")
                associations = self.count_journey_associations(journey_id)
                populated = sorted(name for name, count in associations.items() if count)
                if populated:
                    raise ValueError(f"journey_not_empty:{','.join(populated)}")
                cursor = self.conn.execute(
                    "DELETE FROM identity WHERE layer = 'journey' AND key = ?", (journey_id,)
                )
                if cursor.rowcount != 1:
                    raise ValueError("delete_read_back_contradiction")
            result = source_version(self.journey_rows())
            self.conn.execute(
                "INSERT INTO journey_mutation_receipts (request_id, request_digest, source_version, result_version, operation, journey_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (request_id, request_digest, current, result, operation, journey_id, now),
            )
            self.conn.commit()
            return result, False
        except Exception:
            self.conn.rollback()
            raise
