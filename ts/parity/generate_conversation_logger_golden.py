"""Generate deterministic conversation-logger state for CV22.DS7.US5 slice A.

Runs the real Python logger (`memory.cli.conversation_logger`) against a
synthetic temporary Mirror home and records normalized state transitions.

The LLM-backed close tails (`_run_extraction`, `finalize_metadata_on_close`)
are neutralized *in this generator* — not in the oracle — so both languages
isolate the same deterministic skeleton: ended_at, session rebinding, title,
and message writes. The tails themselves are proven in slices C/D behind the
replay transport, mirroring the `CloseHooks` seam in `ts/src/conversation/logger.ts`.

Run: uv run python ts/parity/generate_conversation_logger_golden.py
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import re
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "conversation-logger.golden.json"

NOW_COLUMNS = ("started_at", "updated_at", "closed_at", "created_at", "ended_at")


def _normalize(value: object, conversation_ids: dict[str, str]) -> object:
    if isinstance(value, str) and value in conversation_ids:
        return conversation_ids[value]
    return value


def _snapshot(mem, label: str) -> dict:
    """Normalized runtime state: ids aliased, timestamps reduced to presence."""
    conversation_rows = mem.conn.execute(
        "SELECT id, title, started_at, ended_at, interface, persona, journey, metadata "
        "FROM conversations ORDER BY started_at, id"
    ).fetchall()
    conversation_ids = {
        row["id"]: f"<conversation-{index}>" for index, row in enumerate(conversation_rows, start=1)
    }

    conversations = [
        {
            "id": conversation_ids[row["id"]],
            "title": row["title"],
            "ended": row["ended_at"] is not None,
            "interface": row["interface"],
            "persona": row["persona"],
            "journey": row["journey"],
            "metadata": json.loads(row["metadata"]) if row["metadata"] else None,
            "metadata_raw": row["metadata"],
        }
        for row in conversation_rows
    ]
    sessions = [
        {
            "session_id": row["session_id"],
            "conversation_id": _normalize(row["conversation_id"], conversation_ids),
            "interface": row["interface"],
            "persona": row["persona"],
            "journey": row["journey"],
            "active": row["active"],
            "closed": row["closed_at"] is not None,
            "metadata": json.loads(row["metadata"]) if row["metadata"] else None,
            "metadata_raw": row["metadata"],
        }
        for row in mem.conn.execute(
            "SELECT session_id, conversation_id, interface, persona, journey, active, "
            "closed_at, metadata FROM runtime_sessions ORDER BY session_id"
        ).fetchall()
    ]
    messages = [
        {
            "conversation_id": _normalize(row["conversation_id"], conversation_ids),
            "role": row["role"],
            "content": row["content"],
            "token_count": row["token_count"],
            "metadata": row["metadata"],
        }
        for row in mem.conn.execute(
            "SELECT conversation_id, role, content, token_count, metadata FROM messages "
            "ORDER BY created_at, rowid"
        ).fetchall()
    ]
    # Memory ids are random uuids; alias them so regeneration stays byte-stable
    # (the CI determinism gate diffs the regenerated goldens).
    memories = [
        {
            "id": f"<memory-{index}>",
            "title": row["title"],
            "conversation_id": _normalize(row["conversation_id"], conversation_ids),
        }
        for index, row in enumerate(
            mem.conn.execute(
                "SELECT id, title, conversation_id FROM memories ORDER BY created_at, id"
            ),
            start=1,
        )
    ]
    return {
        "label": label,
        "conversations": conversations,
        "sessions": sessions,
        "messages": messages,
        "memories": memories,
    }


def _run_cli(logger, argv: list[str]) -> dict:
    """Invoke the real `conversation_logger.main` and capture its contract.

    The strangler's unit is `command + args -> stdout`, so this records the
    exact released strings and exit code rather than a paraphrase.
    """
    stdout, stderr = io.StringIO(), io.StringIO()
    exit_code = 0
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            logger.main(argv)
    except SystemExit as exc:  # main() exits on argument errors
        exit_code = int(exc.code or 0)

    def _lines(buffer: io.StringIO) -> list[str]:
        # Conversation ids are random uuids; alias them so the golden is stable.
        text = re.sub(r"(conversation: )[0-9a-f]{8}", r"\1<conversation-id>", buffer.getvalue())
        return text.splitlines()

    return {
        "argv": argv,
        "stdout": _lines(stdout),
        "stderr": _lines(stderr),
        "exit_code": exit_code,
    }


def _capture_cli_stdout(logger) -> list[dict]:
    return [
        _run_cli(logger, ["mute"]),
        _run_cli(logger, ["status"]),
        _run_cli(logger, ["unmute"]),
        _run_cli(logger, ["status"]),
        _run_cli(logger, ["discard-current", "--session-id", "sess-missing"]),
        _run_cli(logger, ["status", "--mirror-home"]),
        _run_cli(logger, []),
    ]


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
        # temporary MIRROR_HOME.
        os.environ["MIRROR_USER"] = home.name
        os.environ["DB_PATH"] = str(fixture_db)
        os.environ["MEMORY_RECEPTION"] = "0"

        from memory.cli import conversation_logger as logger
        from memory.client import MemoryClient
        from memory.services.conversation import ConversationService

        # Neutralize the LLM tails for the deterministic skeleton (see docstring).
        ConversationService._run_extraction = lambda self, conversation_id: []
        ConversationService.finalize_metadata_on_close = lambda self, conversation_id: {}

        mem = MemoryClient(db_path=fixture_db)
        opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
        if opened != fixture_db.resolve() or not opened.is_relative_to(Path(tmp).resolve()):
            raise RuntimeError(f"refusing non-temporary fixture database: {opened}")
        mem.close()

        snapshots = []

        logger.log_user_message("sess-a", "hello world\nmore detail", interface="pi")
        mem = MemoryClient(db_path=fixture_db)
        snapshots.append(_snapshot(mem, "user_message_creates_conversation_and_title"))
        mem.close()

        logger.log_user_message("sess-a", "second message", interface="pi")
        logger.log_assistant_message("sess-a", "assistant reply", interface="pi")
        mem = MemoryClient(db_path=fixture_db)
        snapshots.append(_snapshot(mem, "second_user_message_keeps_title_and_appends"))
        mem.close()

        # Persona/journey set on the session, then switch with no persona
        # argument: the Python store treats None as PRESERVE.
        mem = MemoryClient(db_path=fixture_db)
        mem.store.upsert_runtime_session("sess-a", persona="engineer", journey="mirror-ts-core")
        mem.close()
        logger.switch_conversation(session_id="sess-a")
        mem = MemoryClient(db_path=fixture_db)
        snapshots.append(_snapshot(mem, "switch_preserves_persona_and_rebinds"))
        mem.close()

        logger.end_session("sess-a", extract=False)
        mem = MemoryClient(db_path=fixture_db)
        snapshots.append(_snapshot(mem, "end_session_closes_conversation_and_session"))
        mem.close()

        # Discard: a memory already extracted from the conversation must
        # survive with a nulled FK.
        logger.log_user_message("sess-b", "discard me", interface="pi")
        mem = MemoryClient(db_path=fixture_db)
        conversation_id = mem.store.get_runtime_session("sess-b").conversation_id
        mem.add_memory(
            title="Extracted",
            content="kept",
            memory_type="note",
            conversation_id=conversation_id,
        )
        mem.close()
        logger.discard_current_conversation(session_id="sess-b", interface="pi")
        mem = MemoryClient(db_path=fixture_db)
        snapshots.append(_snapshot(mem, "discard_deletes_conversation_preserving_memories"))
        mem.close()

        # Assistant logging is a complete no-op while the discard marker holds.
        logger.log_assistant_message("sess-b", "should vanish", interface="pi")
        mem = MemoryClient(db_path=fixture_db)
        snapshots.append(_snapshot(mem, "assistant_noop_under_discard_marker"))
        mem.close()

        cli_cases = _capture_cli_stdout(logger)

    OUT_PATH.write_text(
        json.dumps(
            {"scenarios": snapshots, "cli": cli_cases},
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
