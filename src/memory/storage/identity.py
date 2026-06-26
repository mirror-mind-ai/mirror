"""Identity persistence operations."""

from datetime import datetime, timezone

from memory.models import Identity, IdentityDescriptor, IdentityIntegration
from memory.storage.base import ConnectionBacked


class IdentityStore(ConnectionBacked):
    # --- Identity ---

    def upsert_identity(self, identity: Identity) -> Identity:
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        existing = self.get_identity(identity.layer, identity.key)
        if existing:
            self.conn.execute(
                """UPDATE identity SET content = ?, version = ?, updated_at = ?, metadata = ?
                   WHERE layer = ? AND key = ?""",
                (
                    identity.content,
                    identity.version,
                    now,
                    identity.metadata,
                    identity.layer,
                    identity.key,
                ),
            )
            identity.id = existing.id
            identity.updated_at = now
        else:
            identity.created_at = now
            identity.updated_at = now
            self.conn.execute(
                """INSERT INTO identity (id, layer, key, content, version, created_at, updated_at, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    identity.id,
                    identity.layer,
                    identity.key,
                    identity.content,
                    identity.version,
                    identity.created_at,
                    identity.updated_at,
                    identity.metadata,
                ),
            )
        self.conn.commit()
        return identity

    def get_identity(self, layer: str, key: str) -> Identity | None:
        row = self.conn.execute(
            "SELECT * FROM identity WHERE layer = ? AND key = ?", (layer, key)
        ).fetchone()
        if not row:
            return None
        return Identity(**dict(row))

    def get_identity_by_layer(self, layer: str) -> list[Identity]:
        rows = self.conn.execute(
            "SELECT * FROM identity WHERE layer = ? ORDER BY key", (layer,)
        ).fetchall()
        return [Identity(**dict(r)) for r in rows]

    def get_all_identity(self) -> list[Identity]:
        rows = self.conn.execute("SELECT * FROM identity ORDER BY layer, key").fetchall()
        return [Identity(**dict(r)) for r in rows]

    def update_identity_metadata(self, layer: str, key: str, metadata: str) -> None:
        from memory.models import _now

        self.conn.execute(
            "UPDATE identity SET metadata = ?, updated_at = ? WHERE layer = ? AND key = ?",
            (metadata, _now(), layer, key),
        )
        self.conn.commit()

    def delete_identity(self, layer: str, key: str) -> bool:
        cursor = self.conn.execute("DELETE FROM identity WHERE layer = ? AND key = ?", (layer, key))
        self.conn.commit()
        return cursor.rowcount > 0

    # --- Identity integrations ---

    def add_identity_integration(self, integration: IdentityIntegration) -> IdentityIntegration:
        self.conn.execute(
            """
            INSERT INTO identity_integrations (
                id, layer, key, content, source, origin, conversation_id,
                journal_id, created_at, status, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                integration.id,
                integration.layer,
                integration.key,
                integration.content,
                integration.source,
                integration.origin,
                integration.conversation_id,
                integration.journal_id,
                integration.created_at,
                integration.status,
                integration.metadata,
            ),
        )
        self.conn.commit()
        return integration

    def list_identity_integrations(
        self,
        *,
        layer: str | None = None,
        key: str | None = None,
        status: str | None = None,
    ) -> list[IdentityIntegration]:
        clauses: list[str] = []
        params: list[str] = []
        if layer is not None:
            clauses.append("layer = ?")
            params.append(layer)
        if key is not None:
            clauses.append("key = ?")
            params.append(key)
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self.conn.execute(
            f"SELECT * FROM identity_integrations{where} ORDER BY created_at, id",
            params,
        ).fetchall()
        return [IdentityIntegration(**dict(row)) for row in rows]

    # --- Descriptors ---

    def upsert_descriptor(self, layer: str, key: str, descriptor: str) -> None:
        """Insert or replace the routing descriptor for (layer, key)."""
        from memory.models import _now

        self.conn.execute(
            """
            INSERT INTO identity_descriptors (layer, key, descriptor, generated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(layer, key) DO UPDATE SET
                descriptor   = excluded.descriptor,
                generated_at = excluded.generated_at
            """,
            (layer, key, descriptor, _now()),
        )
        self.conn.commit()

    def get_descriptor(self, layer: str, key: str) -> IdentityDescriptor | None:
        """Return the descriptor for (layer, key), or None if absent."""
        row = self.conn.execute(
            "SELECT layer, key, descriptor, generated_at FROM identity_descriptors"
            " WHERE layer = ? AND key = ?",
            (layer, key),
        ).fetchone()
        if not row:
            return None
        return IdentityDescriptor(layer=row[0], key=row[1], descriptor=row[2], generated_at=row[3])

    def get_descriptors_by_layer(self, layer: str) -> dict[str, str]:
        """Return {key: descriptor} for all descriptors of a given layer."""
        rows = self.conn.execute(
            "SELECT key, descriptor FROM identity_descriptors WHERE layer = ? ORDER BY key",
            (layer,),
        ).fetchall()
        return {row[0]: row[1] for row in rows}
