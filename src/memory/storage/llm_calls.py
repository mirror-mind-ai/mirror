"""Storage component for LLM call observability logs."""

from memory.models import _now, _uuid
from memory.storage.base import ConnectionBacked


class LLMCallStore(ConnectionBacked):
    """Writes and reads rows from the llm_calls table."""

    def log_llm_call(
        self,
        *,
        role: str,
        model: str,
        prompt: str,
        response_text: str,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        latency_ms: int | None = None,
        cost_usd: float | None = None,
        conversation_id: str | None = None,
        session_id: str | None = None,
    ) -> str:
        """Insert one LLM call row and return its id."""
        row_id = _uuid()
        self.conn.execute(
            """
            INSERT INTO llm_calls (
                id, role, model, prompt, response,
                prompt_tokens, completion_tokens, latency_ms, cost_usd,
                conversation_id, session_id, called_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row_id,
                role,
                model,
                prompt,
                response_text,
                prompt_tokens,
                completion_tokens,
                latency_ms,
                cost_usd,
                conversation_id,
                session_id,
                _now(),
            ),
        )
        self.conn.commit()
        return row_id

    def get_llm_calls(
        self,
        *,
        conversation_id: str | None = None,
        role: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Return llm_calls rows as dicts, newest first."""
        clauses = []
        params: list = []
        if conversation_id:
            clauses.append("conversation_id = ?")
            params.append(conversation_id)
        if role:
            clauses.append("role = ?")
            params.append(role)

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)

        rows = self.conn.execute(
            f"""
            SELECT id, role, model, prompt, response,
                   prompt_tokens, completion_tokens, latency_ms, cost_usd,
                   conversation_id, session_id, called_at
            FROM llm_calls
            {where}
            ORDER BY called_at DESC
            LIMIT ?
            """,
            params,
        ).fetchall()

        keys = [
            "id",
            "role",
            "model",
            "prompt",
            "response",
            "prompt_tokens",
            "completion_tokens",
            "latency_ms",
            "cost_usd",
            "conversation_id",
            "session_id",
            "called_at",
        ]
        return [dict(zip(keys, row, strict=True)) for row in rows]

    def get_llm_call_summary(self, *, since: str | None = None) -> dict:
        """Aggregate spend by role and by week, plus an overall total.

        ``SUM(cost_usd)`` skips NULLs, so an all-unpriced bucket reports
        ``cost_usd = None`` with a non-zero ``unpriced`` count — unpriced spend
        stays visibly unpriced rather than summing to ``0``. Optional ``since``
        (a ``YYYY-MM-DD`` or ISO timestamp) scopes the window.
        """
        where = "WHERE called_at >= ?" if since else ""
        params: list = [since] if since else []
        keys = ["bucket", "calls", "prompt_tokens", "completion_tokens", "cost_usd", "unpriced"]

        def _agg(bucket_expr: str, order: str) -> list[dict]:
            rows = self.conn.execute(
                f"""
                SELECT {bucket_expr} AS bucket,
                       COUNT(*) AS calls,
                       COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                       COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                       SUM(cost_usd) AS cost_usd,
                       SUM(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END) AS unpriced
                FROM llm_calls
                {where}
                GROUP BY bucket
                ORDER BY {order}
                """,
                params,
            ).fetchall()
            return [dict(zip(keys, row, strict=True)) for row in rows]

        by_role = _agg("role", "bucket")
        by_week = _agg("strftime('%Y-W%W', called_at)", "bucket DESC")

        priced = [b["cost_usd"] for b in by_role if b["cost_usd"] is not None]
        total = {
            "calls": sum(b["calls"] for b in by_role),
            "prompt_tokens": sum(b["prompt_tokens"] for b in by_role),
            "completion_tokens": sum(b["completion_tokens"] for b in by_role),
            "cost_usd": sum(priced) if priced else None,
            "unpriced": sum(b["unpriced"] for b in by_role),
        }
        return {"by_role": by_role, "by_week": by_week, "total": total}
