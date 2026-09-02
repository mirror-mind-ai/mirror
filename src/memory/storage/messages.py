"""Message persistence operations."""

import sqlite3
from collections.abc import Mapping, Sequence
from typing import Any

from memory.models import Message
from memory.storage.base import ConnectionBacked


class ConversationAppendStorageError(Exception):
    """A bounded storage outcome for the explicit append service."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


class MessageStore(ConnectionBacked):
    # --- Messages ---

    def add_message(self, msg: Message) -> Message:
        self.conn.execute(
            """INSERT INTO messages
               (id, conversation_id, role, content, created_at, token_count, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                msg.id,
                msg.conversation_id,
                msg.role,
                msg.content,
                msg.created_at,
                msg.token_count,
                msg.metadata,
            ),
        )
        self.conn.commit()
        return msg

    def get_messages(self, conversation_id: str) -> list[Message]:
        rows = self.conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, id",
            (conversation_id,),
        ).fetchall()
        return [Message(**dict(r)) for r in rows]

    def append_conversation_messages(
        self,
        conversation_id: str,
        journey_id: str,
        messages: Sequence[Mapping[str, Any]],
    ) -> list[str]:
        """Classify and append one validated batch in a single owned transaction."""
        try:
            self.conn.execute("BEGIN IMMEDIATE")
            conversation = self.conn.execute(
                "SELECT journey FROM conversations WHERE id = ?",
                (conversation_id,),
            ).fetchone()
            if conversation is None:
                raise ConversationAppendStorageError("conversation_not_found")
            if conversation["journey"] != journey_id:
                raise ConversationAppendStorageError("journey_mismatch")

            ids = [str(message["id"]) for message in messages]
            placeholders = ",".join("?" for _ in ids)
            rows = self.conn.execute(
                f"""SELECT id, conversation_id, role, content, created_at, metadata
                    FROM messages WHERE id IN ({placeholders})""",
                ids,
            ).fetchall()
            existing = {row["id"]: row for row in rows}
            states: list[str] = []
            absent: list[Mapping[str, Any]] = []
            for message in messages:
                row = existing.get(message["id"])
                if row is None:
                    states.append("inserted")
                    absent.append(message)
                    continue
                if (
                    row["conversation_id"] != conversation_id
                    or row["role"] != message["role"]
                    or row["content"] != message["content"]
                    or row["created_at"] != message["created_at"]
                    or row["metadata"] != message["metadata"]
                ):
                    raise ConversationAppendStorageError("idempotency_conflict")
                states.append("existing")

            for message in absent:
                self.conn.execute(
                    """INSERT INTO messages
                       (id, conversation_id, role, content, created_at, token_count, metadata)
                       VALUES (?, ?, ?, ?, ?, NULL, ?)""",
                    (
                        message["id"],
                        conversation_id,
                        message["role"],
                        message["content"],
                        message["created_at"],
                        message["metadata"],
                    ),
                )
            self.conn.commit()
            return states
        except ConversationAppendStorageError:
            self.conn.rollback()
            raise
        except sqlite3.Error as exc:
            self.conn.rollback()
            raise ConversationAppendStorageError("persistence_failure") from exc
