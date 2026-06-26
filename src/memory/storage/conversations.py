"""Conversation persistence operations."""

from memory.models import Conversation, ConversationSummary
from memory.storage.base import ConnectionBacked


class ConversationStore(ConnectionBacked):
    # --- Conversations ---

    def create_conversation(self, conv: Conversation) -> Conversation:
        self.conn.execute(
            """INSERT INTO conversations
               (id, title, started_at, ended_at, interface, persona, journey, summary, tags, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                conv.id,
                conv.title,
                conv.started_at,
                conv.ended_at,
                conv.interface,
                conv.persona,
                conv.journey,
                conv.summary,
                conv.tags,
                conv.metadata,
            ),
        )
        self.conn.commit()
        return conv

    def get_conversation(self, conv_id: str) -> Conversation | None:
        row = self.conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,)).fetchone()
        if not row:
            return None
        return Conversation(**dict(row))

    def find_conversation_by_id_prefix(self, prefix: str) -> Conversation | None:
        row = self.conn.execute(
            "SELECT * FROM conversations WHERE id LIKE ? ORDER BY started_at DESC LIMIT 1",
            (f"{prefix}%",),
        ).fetchone()
        if not row:
            return None
        return Conversation(**dict(row))

    def list_recent_conversation_summaries(
        self,
        *,
        limit: int = 20,
        journey: str | None = None,
        persona: str | None = None,
    ) -> list[ConversationSummary]:
        conditions = ["1=1"]
        params: list[str | int] = []

        if journey:
            conditions.append("journey = ?")
            params.append(journey)
        if persona:
            conditions.append("persona = ?")
            params.append(persona)

        where = " AND ".join(conditions)
        params.append(limit)

        rows = self.conn.execute(
            f"""SELECT id, title, started_at, persona, journey,
                       (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
                FROM conversations c
                WHERE {where}
                ORDER BY started_at DESC
                LIMIT ?""",
            params,
        ).fetchall()
        return [ConversationSummary(**dict(row)) for row in rows]

    def get_conversations_in_range(self, start_time: str, end_time: str) -> list[Conversation]:
        """Return conversations whose interval overlaps the given range."""
        rows = self.conn.execute(
            """SELECT * FROM conversations
               WHERE started_at <= ? AND (ended_at >= ? OR ended_at IS NULL)""",
            (end_time, start_time),
        ).fetchall()
        return [Conversation(**dict(r)) for r in rows]

    def get_unextracted_conversations(self) -> list[Conversation]:
        """Return ended conversations eligible for extraction that haven't been extracted."""
        rows = self.conn.execute(
            """SELECT c.* FROM conversations c
               WHERE c.ended_at IS NOT NULL
                 AND c.journey IS NOT NULL
                 AND (c.metadata IS NULL OR json_extract(c.metadata, '$.extracted') IS NOT 1)
                 AND (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) >= 4"""
        ).fetchall()
        return [Conversation(**dict(r)) for r in rows]

    def get_open_conversations_idle_since(self, threshold_dt: str) -> list[Conversation]:
        """Return open conversations with no message activity since threshold_dt."""
        rows = self.conn.execute(
            """SELECT c.* FROM conversations c
               WHERE c.ended_at IS NULL
                 AND (
                   (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) < ?
                   OR NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
                 )""",
            (threshold_dt,),
        ).fetchall()
        return [Conversation(**dict(r)) for r in rows]

    def update_conversation(self, conv_id: str, **kwargs: object) -> None:
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        vals = [*list(kwargs.values()), conv_id]
        self.conn.execute(f"UPDATE conversations SET {sets} WHERE id = ?", vals)
        self.conn.commit()

    def get_recent_conversations_by_journey(
        self, journey: str, limit: int = 5
    ) -> list[Conversation]:
        rows = self.conn.execute(
            "SELECT * FROM conversations WHERE journey = ? ORDER BY started_at DESC LIMIT ?",
            (journey, limit),
        ).fetchall()
        return [Conversation(**dict(r)) for r in rows]
