"""Attachment persistence operations."""

from memory.models import Attachment
from memory.storage.base import ConnectionBacked


class AttachmentStore(ConnectionBacked):
    # --- Attachments ---

    def create_attachment(self, att: Attachment) -> Attachment:
        self.conn.execute(
            """INSERT INTO attachments
               (id, journey_id, name, description, content, content_type,
                tags, embedding, created_at, updated_at, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                att.id,
                att.journey_id,
                att.name,
                att.description,
                att.content,
                att.content_type,
                att.tags,
                att.embedding,
                att.created_at,
                att.updated_at,
                att.metadata,
            ),
        )
        self.conn.commit()
        return att

    def get_attachment(self, attachment_id: str) -> Attachment | None:
        row = self.conn.execute(
            "SELECT * FROM attachments WHERE id = ?", (attachment_id,)
        ).fetchone()
        if not row:
            return None
        return Attachment(**dict(row))

    def get_attachment_by_name(self, journey_id: str, name: str) -> Attachment | None:
        row = self.conn.execute(
            "SELECT * FROM attachments WHERE journey_id = ? AND name = ?",
            (journey_id, name),
        ).fetchone()
        if not row:
            return None
        return Attachment(**dict(row))

    def get_attachments_by_journey(self, journey_id: str) -> list[Attachment]:
        rows = self.conn.execute(
            "SELECT * FROM attachments WHERE journey_id = ? ORDER BY created_at",
            (journey_id,),
        ).fetchall()
        return [Attachment(**dict(r)) for r in rows]

    def update_attachment(self, attachment_id: str, **kwargs: object) -> None:
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        vals = [*list(kwargs.values()), attachment_id]
        self.conn.execute(f"UPDATE attachments SET {sets} WHERE id = ?", vals)
        self.conn.commit()

    def delete_attachment(self, attachment_id: str) -> bool:
        cursor = self.conn.execute("DELETE FROM attachments WHERE id = ?", (attachment_id,))
        self.conn.commit()
        return cursor.rowcount > 0

    def get_all_attachments_with_embeddings(self, journey_id: str) -> list[Attachment]:
        rows = self.conn.execute(
            "SELECT * FROM attachments WHERE journey_id = ? AND embedding IS NOT NULL ORDER BY created_at",
            (journey_id,),
        ).fetchall()
        return [Attachment(**dict(r)) for r in rows]

    def get_all_attachments_with_embeddings_global(self) -> list[Attachment]:
        """Return all attachments with embeddings across all journeys."""
        rows = self.conn.execute(
            "SELECT * FROM attachments WHERE embedding IS NOT NULL ORDER BY created_at",
        ).fetchall()
        return [Attachment(**dict(r)) for r in rows]
