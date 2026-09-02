"""Runtime session persistence operations."""

from memory.models import RuntimeSession
from memory.storage.base import ConnectionBacked

_UNSET = object()


class RuntimeSessionStore(ConnectionBacked):
    # --- Runtime Sessions ---

    def get_runtime_session(self, session_id: str) -> RuntimeSession | None:
        row = self.conn.execute(
            "SELECT * FROM runtime_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if not row:
            return None
        data = dict(row)
        data["mirror_active"] = bool(data["mirror_active"])
        data["hook_injected"] = bool(data["hook_injected"])
        data["active"] = bool(data["active"])
        return RuntimeSession(**data)

    def get_global_sticky_defaults(self) -> tuple[str | None, str | None]:
        """Return explicit cross-session sticky persona and journey defaults."""
        session = self.get_runtime_session("__global_sticky_defaults__")
        if session is None:
            return None, None
        return session.persona, session.journey

    def get_latest_runtime_defaults(
        self,
        *,
        exclude_session_id: str | None = None,
    ) -> tuple[str | None, str | None]:
        """Return the most recently used persona and journey across runtime sessions.

        Persona and journey are resolved independently so a recent session with only
        one of those fields does not erase the other sticky default.
        """
        persona_sql = """
            SELECT persona
            FROM runtime_sessions
            WHERE persona IS NOT NULL
        """
        journey_sql = """
            SELECT journey
            FROM runtime_sessions
            WHERE journey IS NOT NULL
        """
        params: list[str] = []
        if exclude_session_id:
            persona_sql += " AND session_id != ?"
            journey_sql += " AND session_id != ?"
            params.append(exclude_session_id)
        persona_sql += " ORDER BY updated_at DESC LIMIT 1"
        journey_sql += " ORDER BY updated_at DESC LIMIT 1"

        persona_row = self.conn.execute(persona_sql, params).fetchone()
        journey_row = self.conn.execute(journey_sql, params).fetchone()
        persona = persona_row["persona"] if persona_row else None
        journey = journey_row["journey"] if journey_row else None
        return persona, journey

    def upsert_runtime_session(
        self,
        session_id: str,
        *,
        conversation_id: str | None = None,
        interface: str | None = None,
        mirror_active: bool | None = None,
        persona: str | None = None,
        journey: str | None = None,
        hook_injected: bool | None = None,
        active: bool | None = None,
        closed_at: str | None | object = _UNSET,
        metadata: str | None | object = _UNSET,
    ) -> RuntimeSession:
        from memory.models import _now

        now = _now()
        existing = self.get_runtime_session(session_id)
        started_at = existing.started_at if existing else now
        resolved_closed_at = (
            closed_at if closed_at is not _UNSET else (existing.closed_at if existing else None)
        )
        resolved_metadata = (
            metadata if metadata is not _UNSET else (existing.metadata if existing else None)
        )
        record = RuntimeSession(
            session_id=session_id,
            conversation_id=conversation_id
            if conversation_id is not None
            else (existing.conversation_id if existing else None),
            interface=interface
            if interface is not None
            else (existing.interface if existing else None),
            mirror_active=(
                mirror_active
                if mirror_active is not None
                else (existing.mirror_active if existing else False)
            ),
            persona=persona if persona is not None else (existing.persona if existing else None),
            journey=journey if journey is not None else (existing.journey if existing else None),
            hook_injected=(
                hook_injected
                if hook_injected is not None
                else (existing.hook_injected if existing else False)
            ),
            active=active if active is not None else (existing.active if existing else True),
            started_at=started_at,
            updated_at=now,
            closed_at=resolved_closed_at if isinstance(resolved_closed_at, str) else None,
            metadata=resolved_metadata if isinstance(resolved_metadata, str) else None,
        )
        self.conn.execute(
            """INSERT INTO runtime_sessions
               (session_id, conversation_id, interface, mirror_active, persona, journey,
                hook_injected, active, started_at, updated_at, closed_at, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(session_id) DO UPDATE SET
                 conversation_id = excluded.conversation_id,
                 interface = excluded.interface,
                 mirror_active = excluded.mirror_active,
                 persona = excluded.persona,
                 journey = excluded.journey,
                 hook_injected = excluded.hook_injected,
                 active = excluded.active,
                 updated_at = excluded.updated_at,
                 closed_at = excluded.closed_at,
                 metadata = excluded.metadata""",
            (
                record.session_id,
                record.conversation_id,
                record.interface,
                int(record.mirror_active),
                record.persona,
                record.journey,
                int(record.hook_injected),
                int(record.active),
                record.started_at,
                record.updated_at,
                record.closed_at,
                record.metadata,
            ),
        )
        self.conn.commit()
        return record

    def compare_and_swap_runtime_session_metadata(
        self,
        session_id: str,
        *,
        expected_metadata: str,
        metadata: str,
    ) -> bool:
        """Replace metadata only when it still equals the caller's observed value."""
        from memory.models import _now

        cursor = self.conn.execute(
            """UPDATE runtime_sessions
               SET metadata = ?, updated_at = ?
               WHERE session_id = ? AND active = 1 AND metadata = ?""",
            (metadata, _now(), session_id, expected_metadata),
        )
        self.conn.commit()
        return cursor.rowcount == 1

    def get_active_runtime_conversation_ids(self) -> set[str]:
        rows = self.conn.execute(
            "SELECT conversation_id FROM runtime_sessions WHERE active = 1 AND conversation_id IS NOT NULL"
        ).fetchall()
        return {row["conversation_id"] for row in rows}

    def get_active_runtime_session_ids(self, interface: str) -> list[str]:
        """Return active runtime session ids for one interface, newest first."""
        rows = self.conn.execute(
            """SELECT session_id FROM runtime_sessions
               WHERE active = 1 AND interface = ?
               ORDER BY updated_at DESC""",
            (interface,),
        ).fetchall()
        return [row["session_id"] for row in rows]
