"""Generate normalized Python state transitions for CV22.DS7.US4.

Runs the real Python Mirror orchestration against a synthetic temporary Mirror home and
removes generated ids/timestamps from the committed evidence.

Run: uv run python ts/parity/generate_mirror_state_golden.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "mirror-state.golden.json"


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / "mirror-fixture"
        home.mkdir()
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV"):
            os.environ.pop(key, None)
        fixture_db = home / "memory.db"
        os.environ["MIRROR_HOME"] = str(home)
        # Pin (not pop) MIRROR_USER: memory.config setdefaults popped vars back
        # from a repo .env at import, and a re-injected user conflicts with the
        # temporary MIRROR_HOME. Matching the home's basename keeps both
        # coherent on any machine.
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(fixture_db)
        os.environ["MEMORY_RECEPTION"] = "0"

        from memory.client import MemoryClient
        from memory.skills import mirror

        mem = MemoryClient(db_path=fixture_db)
        opened_path = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
        if opened_path != fixture_db.resolve() or not opened_path.is_relative_to(
            Path(tmp).resolve()
        ):
            raise RuntimeError(f"refusing non-temporary fixture database: {opened_path}")
        mem.set_identity("ego", "behavior", "Be useful")
        mem.set_identity("user", "identity", "User context")
        mem.set_identity("persona", "engineer", "Engineer context")
        mem.set_identity(
            "journey",
            "mirror-ts-core",
            "# Mirror TS Core\n**Status:** active\n\n## Description\nTS migration\n\n## End",
        )
        mem.store.upsert_runtime_session("state-session", interface="pi")
        mem.close()

        mirror.load(
            persona="engineer",
            journey="mirror-ts-core",
            session_id="state-session",
        )
        mirror.log("First sentence. More detail.", session_id="state-session")
        mirror.deactivate(session_id="state-session")

        mem = MemoryClient(db_path=fixture_db)
        session_rows = mem.conn.execute(
            "SELECT session_id, conversation_id, interface, mirror_active, persona, journey, "
            "hook_injected, active, closed_at, metadata FROM runtime_sessions "
            "WHERE session_id IN ('state-session', '__global_operating_mode__', "
            "'__global_sticky_defaults__') ORDER BY session_id"
        ).fetchall()
        conversation_rows = mem.conn.execute(
            "SELECT id, title, ended_at, interface, persona, journey FROM conversations "
            "WHERE id = (SELECT conversation_id FROM runtime_sessions WHERE session_id = 'state-session') "
            "ORDER BY started_at, id"
        ).fetchall()
        conversation_ids = {
            row["id"]: f"<conversation-{index}>"
            for index, row in enumerate(conversation_rows, start=1)
        }
        sessions = []
        for row in session_rows:
            metadata = row["metadata"]
            if metadata:
                try:
                    metadata = json.loads(metadata)
                except json.JSONDecodeError:
                    pass
            sessions.append(
                {
                    "session_id": row["session_id"],
                    "conversation_id": conversation_ids.get(row["conversation_id"]),
                    "interface": row["interface"],
                    "mirror_active": row["mirror_active"],
                    "persona": row["persona"],
                    "journey": row["journey"],
                    "hook_injected": row["hook_injected"],
                    "active": row["active"],
                    "closed_at": row["closed_at"],
                    "metadata": metadata,
                }
            )
        conversations = [
            {
                "id": conversation_ids[row["id"]],
                "title": row["title"],
                "ended_at": row["ended_at"],
                "interface": row["interface"],
                "persona": row["persona"],
                "journey": row["journey"],
            }
            for row in conversation_rows
        ]
        messages = [
            {
                "conversation_id": conversation_ids[row["conversation_id"]],
                "role": row["role"],
                "content": row["content"],
                "token_count": row["token_count"],
                "metadata": json.loads(row["metadata"]) if row["metadata"] else None,
            }
            for row in mem.conn.execute(
                "SELECT conversation_id, role, content, token_count, metadata FROM messages "
                "WHERE conversation_id = (SELECT conversation_id FROM runtime_sessions "
                "WHERE session_id = 'state-session') ORDER BY created_at"
            ).fetchall()
        ]
        mem.close()

    OUT_PATH.write_text(
        json.dumps(
            {"sessions": sessions, "conversations": conversations, "messages": messages},
            indent=2,
            ensure_ascii=False,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
