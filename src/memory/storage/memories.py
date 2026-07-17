"""Memory persistence operations."""

import json
import sqlite3
from datetime import datetime, timezone

from memory.models import Memory, MemorySummary
from memory.storage.base import ConnectionBacked


def _fts_query(query: str) -> str:
    """Convert a natural language query to a safe FTS5 MATCH expression.

    Each whitespace-delimited word is individually double-quoted, producing
    an AND-of-terms search that avoids FTS5 operator interpretation.
    """
    words = [w.replace('"', "") for w in query.split()]
    words = [w for w in words if w]
    if not words:
        return ""
    return " ".join(f'"{w}"' for w in words)


class MemoryStore(ConnectionBacked):
    # --- Memories ---

    def create_memory(self, mem: Memory) -> Memory:
        self.conn.execute(
            """INSERT INTO memories
               (id, conversation_id, memory_type, layer, title, content, context,
                journey, persona, tags, created_at, relevance_score, embedding, metadata,
                use_count, readiness_state)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                mem.id,
                mem.conversation_id,
                mem.memory_type,
                mem.layer,
                mem.title,
                mem.content,
                mem.context,
                mem.journey,
                mem.persona,
                mem.tags,
                mem.created_at,
                mem.relevance_score,
                mem.embedding,
                mem.metadata,
                mem.use_count,
                mem.readiness_state,
            ),
        )
        self.conn.commit()
        return mem

    def get_memory(self, memory_id: str) -> Memory | None:
        row = self.conn.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        if not row:
            return None
        return Memory(**dict(row))

    def list_recent_memory_summaries(
        self,
        *,
        limit: int = 20,
        memory_type: str | None = None,
        layer: str | None = None,
        journey: str | None = None,
    ) -> list[MemorySummary]:
        conditions = ["1=1"]
        params: list[str | int] = []
        if memory_type:
            conditions.append("memory_type = ?")
            params.append(memory_type)
        if layer:
            conditions.append("layer = ?")
            params.append(layer)
        if journey:
            conditions.append("journey = ?")
            params.append(journey)

        where = " AND ".join(conditions)
        params.append(limit)

        rows = self.conn.execute(
            f"""SELECT id, memory_type, layer, title, content, context,
                       journey, persona, tags, created_at
                FROM memories
                WHERE {where}
                ORDER BY created_at DESC
                LIMIT ?""",
            params,
        ).fetchall()
        return [MemorySummary(**dict(row)) for row in rows]

    def count_memories_by_type(self) -> list[tuple[str, int]]:
        rows = self.conn.execute(
            "SELECT memory_type, COUNT(*) as count FROM memories GROUP BY memory_type"
        ).fetchall()
        return [(row["memory_type"], row["count"]) for row in rows]

    def count_memories_by_embedding_model(self) -> list[tuple[str | None, int]]:
        """Distribution of stored memory vectors by recorded embedding model.

        Aggregates in Python (not SQLite ``json_extract``) so a legacy or malformed
        ``metadata`` row degrades to the ``None`` (unknown / pre-provenance) bucket
        instead of raising — the same crash-safety rule the write helper follows
        (CV9.E2.S17 / AI-07).
        """
        rows = self.conn.execute(
            "SELECT metadata FROM memories WHERE embedding IS NOT NULL"
        ).fetchall()
        counts: dict[str | None, int] = {}
        for row in rows:
            model: str | None = None
            metadata = row["metadata"]
            if metadata:
                try:
                    parsed = json.loads(metadata)
                    if isinstance(parsed, dict):
                        value = parsed.get("embedding_model")
                        model = value if isinstance(value, str) else None
                except (json.JSONDecodeError, TypeError):
                    model = None
            counts[model] = counts.get(model, 0) + 1
        return sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0])))

    def get_memories_by_type(self, memory_type: str) -> list[Memory]:
        rows = self.conn.execute(
            "SELECT * FROM memories WHERE memory_type = ? ORDER BY created_at DESC",
            (memory_type,),
        ).fetchall()
        return [Memory(**dict(r)) for r in rows]

    def get_memories_by_layer(self, layer: str) -> list[Memory]:
        rows = self.conn.execute(
            "SELECT * FROM memories WHERE layer = ? ORDER BY created_at DESC",
            (layer,),
        ).fetchall()
        return [Memory(**dict(r)) for r in rows]

    def get_shadow_candidate_memories(
        self,
        readiness_states: tuple[str, ...] = ("observed", "candidate"),
        limit: int = 100,
    ) -> list[Memory]:
        """Return memories that are shadow-layer material awaiting review.

        Includes:
        - memories with layer='shadow'
        - memories with memory_type IN ('tension', 'pattern') from any layer

        Excludes terminal states (integrated).
        """
        placeholders = ",".join("?" for _ in readiness_states)
        rows = self.conn.execute(
            f"""
            SELECT * FROM memories
            WHERE (layer = 'shadow' OR memory_type IN ('tension', 'pattern'))
              AND readiness_state IN ({placeholders})
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (*readiness_states, limit),
        ).fetchall()
        return [Memory(**dict(r)) for r in rows]

    def get_memories_by_journey(self, journey: str) -> list[Memory]:
        rows = self.conn.execute(
            "SELECT * FROM memories WHERE journey = ? ORDER BY created_at DESC",
            (journey,),
        ).fetchall()
        return [Memory(**dict(r)) for r in rows]

    def get_all_memories_with_embeddings(self) -> list[Memory]:
        rows = self.conn.execute(
            "SELECT * FROM memories WHERE embedding IS NOT NULL ORDER BY created_at DESC"
        ).fetchall()
        return [Memory(**dict(r)) for r in rows]

    def get_memories_timeline(self, start: str, end: str) -> list[Memory]:
        rows = self.conn.execute(
            "SELECT * FROM memories WHERE created_at >= ? AND created_at <= ? ORDER BY created_at",
            (start, end),
        ).fetchall()
        return [Memory(**dict(r)) for r in rows]

    # --- Access Log ---

    def log_access(self, memory_id: str, context: str | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        self.conn.execute(
            "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
            (memory_id, now, context),
        )
        # Cache the last access time on the memory row for fast decay computation.
        self.conn.execute(
            "UPDATE memories SET last_accessed_at = ? WHERE id = ?",
            (now, memory_id),
        )
        self.conn.commit()

    def log_use(self, memory_id: str) -> None:
        """Increment use_count — called when a memory was explicitly referenced in a response.

        Distinct from log_access (retrieval): a memory can be retrieved many times
        but only used when the model actually draws on it in a response. Use is the
        stronger signal in honest reinforcement scoring.
        """
        self.conn.execute(
            "UPDATE memories SET use_count = use_count + 1 WHERE id = ?",
            (memory_id,),
        )
        self.conn.commit()

    def get_access_count(self, memory_id: str) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) as cnt FROM memory_access_log WHERE memory_id = ?",
            (memory_id,),
        ).fetchone()
        return row["cnt"] if row else 0

    def fts_search(
        self,
        query: str,
        memory_type: str | None = None,
        layer: str | None = None,
        journey: str | None = None,
        limit: int = 100,
    ) -> list[tuple[str, float]]:
        """Full-text search using FTS5 BM25 ranking.

        Returns (memory_id, rank_score) pairs where rank_score = 1/(1+rank).
        Returns [] gracefully when the FTS table does not exist or query fails.
        """
        safe_q = _fts_query(query)
        if not safe_q:
            return []

        conditions: list[str] = []
        params: list = [safe_q]
        if memory_type:
            conditions.append("m.memory_type = ?")
            params.append(memory_type)
        if layer:
            conditions.append("m.layer = ?")
            params.append(layer)
        if journey:
            conditions.append("m.journey = ?")
            params.append(journey)

        where_extra = (" AND " + " AND ".join(conditions)) if conditions else ""
        params.append(limit)

        try:
            rows = self.conn.execute(
                f"""SELECT m.id
                    FROM memories_fts f
                    JOIN memories m ON m.rowid = f.rowid
                    WHERE memories_fts MATCH ?{where_extra}
                    ORDER BY bm25(memories_fts)
                    LIMIT ?""",
                params,
            ).fetchall()
        except sqlite3.OperationalError:
            return []

        return [(row[0], 1.0 / (1.0 + i)) for i, row in enumerate(rows)]

    # --- Conversation Embeddings ---

    def store_conversation_embedding(self, conversation_id: str, embedding: bytes) -> None:
        self.conn.execute(
            """INSERT OR REPLACE INTO conversation_embeddings
               (conversation_id, summary_embedding) VALUES (?, ?)""",
            (conversation_id, embedding),
        )
        self.conn.commit()
