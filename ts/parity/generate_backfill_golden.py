"""Generate the session-backfill golden (CV22.DS7.US10 slice E).

Three import paths bring conversations into Mirror from files the runtime
wrote elsewhere, and none of them go through the live hooks:

  * `backfill_pi_sessions` walks a Pi sessions directory and imports every
    untracked JSONL session as a closed conversation;
  * `backfill_codex_session` imports one Codex JSONL file;
  * `backfill_assistant_messages` fills assistant turns from a Claude
    transcript into conversations that logged none -- including from the
    session-less `hook_session_end` route the US5 hook port left out.

Each is graded as resulting database state over a committed fixture corpus
(`ts/test/fixtures/backfill/`), so the TypeScript port is proven by rows, not
by reading. The corpus deliberately covers the parsing edges Python tolerates
(blank lines, foreign entry types, blank content, every timestamp form) and
the ones it does not (a corrupt line or a structural error skips the WHOLE
file; a Codex event without a timestamp raises).

Two asymmetries are Python's and are reproduced on purpose: the Pi import
titles through `set_provisional_title` (metadata provenance, whitespace
collapse) while the Codex import titles through `_generate_title` (plain
column write, word-boundary ellipsis); and the Pi walk is ordered by path
COMPONENTS, which is not string order when a directory name contains `-`.

`_now()` is frozen so "no timestamp -> now" and the import's `started_at` are
pinnable; ids are aliased by insertion order.

Run:  uv run python ts/parity/generate_backfill_golden.py
"""

from __future__ import annotations

import io
import json
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "test" / "goldens" / "backfill.golden.json"
FIXTURES = HERE.parent / "test" / "fixtures" / "backfill"

NOW = "2026-09-03T12:00:00.000000Z"
SESSIONS_DIR_PLACEHOLDER = "<sessions_dir>"
TRANSCRIPT_PLACEHOLDER = "<transcript>"


def _snapshot(mem, *, path_root: str | None = None) -> dict:
    """Full runtime state with ids aliased by insertion order.

    Conversations and sessions are ordered by rowid, which is the import
    order -- that is what pins the Pi walk order without depending on the
    clock. Messages are ordered by rowid within their conversation, which is
    transcript order.
    """
    conversation_rows = mem.conn.execute(
        "SELECT id, title, started_at, ended_at, interface, persona, journey, summary, "
        "tags, metadata FROM conversations ORDER BY rowid"
    ).fetchall()
    aliases = {row["id"]: f"<conversation-{i}>" for i, row in enumerate(conversation_rows, 1)}

    def alias(value: object) -> object:
        return aliases.get(value, value) if isinstance(value, str) else value

    def relative(value: object) -> object:
        if path_root and isinstance(value, str) and value.startswith(path_root + os.sep):
            return SESSIONS_DIR_PLACEHOLDER + "/" + value[len(path_root) + 1 :]
        return value

    conversations = []
    for row in conversation_rows:
        messages = mem.conn.execute(
            "SELECT role, content, created_at, token_count, metadata FROM messages "
            "WHERE conversation_id = ? ORDER BY rowid",
            (row["id"],),
        ).fetchall()
        conversations.append(
            {
                "id": aliases[row["id"]],
                "title": row["title"],
                "started_at": row["started_at"],
                "ended_at": row["ended_at"],
                "interface": row["interface"],
                "persona": row["persona"],
                "journey": row["journey"],
                "summary": row["summary"],
                "tags": row["tags"],
                "metadata_raw": row["metadata"],
                "messages": [dict(m) for m in messages],
            }
        )
    sessions = [
        {
            "session_id": relative(row["session_id"]),
            "conversation_id": alias(row["conversation_id"]),
            "interface": row["interface"],
            "mirror_active": row["mirror_active"],
            "persona": row["persona"],
            "journey": row["journey"],
            "hook_injected": row["hook_injected"],
            "active": row["active"],
            "started_at": row["started_at"],
            "updated_at": row["updated_at"],
            "closed_at": row["closed_at"],
            "metadata": row["metadata"],
        }
        for row in mem.conn.execute("SELECT * FROM runtime_sessions ORDER BY rowid").fetchall()
    ]
    return {"conversations": conversations, "runtime_sessions": sessions}


def _open_fixture_db(tmp: Path, name: str):
    """One fixture database per section, resolved the way `--mirror-home` is.

    `memory.config` reads its environment once at import, so re-pointing
    `DB_PATH` between sections would silently keep writing to the first
    database. Every logger call below therefore passes `mirror_home`
    explicitly, and this helper opens the exact path that resolves to.
    """
    from memory.cli.common import db_path_from_mirror_home
    from memory.client import MemoryClient

    home = tmp / name
    home.mkdir()
    fixture_db = db_path_from_mirror_home(home)
    assert fixture_db is not None
    os.environ.setdefault("MIRROR_HOME", str(home))
    # Pin MIRROR_USER to the home's basename (US4 incident rule): a re-injected
    # user from a repo .env conflicts with the temporary home.
    os.environ.setdefault("MIRROR_USER", home.name)
    os.environ.setdefault("DB_PATH", str(fixture_db))
    mem = MemoryClient(db_path=fixture_db)
    opened = Path(mem.conn.execute("PRAGMA database_list").fetchone()[2]).resolve()
    if opened != fixture_db.resolve() or not opened.is_relative_to(tmp.resolve()):
        raise RuntimeError(f"refusing non-temporary fixture database: {opened}")
    return home, mem


def _seed_transcript_conversations(mem) -> None:
    """Conversations around the transcript window 10:00:30 .. 13:00:00.

    The window end is deliberately AFTER the frozen clock (12:00) so the
    golden distinguishes "ended_at or window end" from "ended_at or now".
    """
    from memory.models import Conversation, Message

    def seed(conversation_id: str, started_at: str, ended_at: str | None, roles: list[str]):
        mem.store.create_conversation(
            Conversation(
                id=conversation_id,
                interface="claude_code",
                journey="mirror-ts-core",
                started_at=started_at,
                ended_at=ended_at,
            )
        )
        for index, role in enumerate(roles):
            mem.store.add_message(
                Message(
                    id=f"{conversation_id}-m{index:02d}",
                    conversation_id=conversation_id,
                    role=role,
                    content=f"{role} line {index}",
                    created_at=f"{started_at[:17]}{30 + index:02d}.000000Z",
                )
            )

    # Closed inside the window and has no assistant turn: backfilled from the
    # entries between its own start and end.
    seed(
        "conv-closed-empty", "2026-09-03T10:00:00.000000Z", "2026-09-03T10:10:00.000000Z", ["user"]
    )
    # Same window, but an assistant turn already exists: untouched.
    seed(
        "conv-has-assistant",
        "2026-09-03T10:00:00.000000Z",
        "2026-09-03T10:10:00.000000Z",
        ["user", "assistant"],
    )
    # Ended before the transcript began: out of range.
    seed("conv-before", "2026-09-03T09:00:00.000000Z", "2026-09-03T09:30:00.000000Z", ["user"])
    # Ended at the exact window start (same string as the first transcript
    # timestamp): in range only because the SQL bound is `>=`.
    seed(
        "conv-ends-at-window-start",
        "2026-09-03T09:50:00.000000Z",
        "2026-09-03T10:00:30.000Z",
        ["user"],
    )
    # Still open: its end is the transcript's last timestamp, and one entry
    # sits exactly on its start.
    seed("conv-open", "2026-09-03T10:05:00.000000Z", None, ["user"])
    # Started at the exact window end (same string as the last transcript
    # timestamp): in range only because the SQL bound is `<=`.
    seed("conv-starts-at-window-end", "2026-09-03T13:00:00.000Z", None, ["user"])
    # Started after the transcript ended: out of range even though open.
    seed("conv-after", "2026-09-03T14:00:00.000000Z", None, ["user"])


def _run_hook(logger, home: Path, payload: dict) -> None:
    """Drive `hook_session_end` through its stdin contract; it always exits 0."""
    original_stdin = sys.stdin
    sys.stdin = io.StringIO(json.dumps(payload))
    try:
        logger.hook_session_end(str(home))
    except SystemExit as exit_signal:
        if exit_signal.code not in (0, None):
            raise RuntimeError(f"hook exited {exit_signal.code}") from exit_signal
    else:
        raise RuntimeError("hook_session_end returned without exiting")
    finally:
        sys.stdin = original_stdin


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        for key in ("MEMORY_DIR", "MEMORY_PROD_DIR", "MEMORY_ENV", "PI_SESSIONS_DIR"):
            os.environ.pop(key, None)
        os.environ["MEMORY_RECEPTION"] = "0"

        from memory import models

        models._now = lambda: NOW

        from memory.cli import conversation_logger as logger
        from memory.services.conversation import ConversationService

        # ---- Pi sessions directory walk -------------------------------------
        pi_dir = FIXTURES / "pi-sessions"
        pi_home, pi_mem = _open_fixture_db(tmp, "pi-fixture")
        pi_mem.store.upsert_runtime_session(str(pi_dir / "tracked.jsonl"), interface="pi")
        pi_first = logger.backfill_pi_sessions(str(pi_home), sessions_dir=pi_dir)
        pi_state = _snapshot(pi_mem, path_root=str(pi_dir))
        pi_rerun = logger.backfill_pi_sessions(str(pi_home), sessions_dir=pi_dir)
        pi_absent = logger.backfill_pi_sessions(
            str(pi_home), sessions_dir=tmp / "absent-pi-sessions"
        )
        pi_mem.close()

        # ---- Codex single-file imports ---------------------------------------
        codex_dir = FIXTURES / "codex"
        codex_home, codex_mem = _open_fixture_db(tmp, "codex-fixture")
        codex_mem.store.upsert_runtime_session("codex-tracked-0006", interface="codex")
        codex_cases: list[dict] = []
        for label, name, interface in (
            ("valid", "valid.jsonl", "codex"),
            ("valid_rerun_is_tracked", "valid.jsonl", "codex"),
            ("no_session_meta", "no-meta.jsonl", "codex"),
            ("no_messages", "no-messages.jsonl", "codex"),
            ("corrupt_line_skips_file", "broken.jsonl", "codex"),
            ("meta_last_and_last_meta_wins", "meta-last.jsonl", "codex"),
            ("already_tracked", "tracked.jsonl", "codex"),
            ("emoji_title_cut_by_code_points", "emoji-title.jsonl", "codex-cli"),
            ("missing_file", "does-not-exist.jsonl", "codex"),
        ):
            count = logger.backfill_codex_session(
                codex_dir / name, mirror_home=str(codex_home), interface=interface
            )
            codex_cases.append(
                {"label": label, "file": name, "interface": interface, "count": count}
            )
        rows_before = codex_mem.conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        null_timestamp: dict[str, object] = {"raises": False}
        try:
            logger.backfill_codex_session(
                codex_dir / "null-timestamp.jsonl", mirror_home=str(codex_home)
            )
        except Exception as error:  # pydantic rejects created_at=None
            null_timestamp = {"raises": True, "error_type": type(error).__name__}
        if not null_timestamp["raises"]:
            raise RuntimeError("expected the null-timestamp import to raise")
        rows_after = codex_mem.conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        null_timestamp["rows_unchanged"] = rows_before == rows_after
        codex_state = _snapshot(codex_mem)
        codex_mem.close()

        # ---- Claude transcript assistant backfill ------------------------------
        transcript = FIXTURES / "transcript" / "session.jsonl"
        transcript_home, transcript_mem = _open_fixture_db(tmp, "transcript-fixture")
        _seed_transcript_conversations(transcript_mem)
        logger.backfill_assistant_messages(str(transcript), mirror_home=str(transcript_home))
        transcript_state = _snapshot(transcript_mem)
        logger.backfill_assistant_messages(str(transcript), mirror_home=str(transcript_home))
        transcript_rerun_state = _snapshot(transcript_mem)
        transcript_mem.close()

        # ---- hook_session_end routes -------------------------------------------
        # Neutralize the LLM close tail: this golden grades the backfill
        # dispatch around end_session, not the tail (see close-tail golden).
        ConversationService._run_extraction = lambda self, conversation_id: []
        ConversationService.finalize_metadata_on_close = lambda self, conversation_id: {}

        hook_home, hook_mem = _open_fixture_db(tmp, "hook-fixture")
        _seed_transcript_conversations(hook_mem)
        hook_scenarios: list[dict] = []

        # Session-less: an empty session_id with a transcript still backfills.
        _run_hook(logger, hook_home, {"session_id": "", "transcript_path": str(transcript)})
        hook_scenarios.append({"label": "sessionless_backfill_only", "state": _snapshot(hook_mem)})

        # No session and no transcript: silent no-op.
        _run_hook(logger, hook_home, {})
        hook_scenarios.append({"label": "empty_payload_is_noop", "state": _snapshot(hook_mem)})

        # Session-less with a missing transcript file: silent no-op.
        _run_hook(
            logger,
            hook_home,
            {"session_id": "", "transcript_path": str(tmp / "missing-transcript.jsonl")},
        )
        hook_scenarios.append({"label": "missing_transcript_is_noop", "state": _snapshot(hook_mem)})

        # A live session: end it (ended_at = now, session closed), THEN backfill.
        # The conversation is open at 10:05 with a user turn, so after ending it
        # spans 10:05 .. now and the late 10:20 answer lands in it too.
        logger.log_user_message(
            "sess-hook", "live session prompt", interface="claude_code", mirror_home=str(hook_home)
        )
        hook_mem.conn.execute(
            "UPDATE conversations SET started_at = ? WHERE id = "
            "(SELECT conversation_id FROM runtime_sessions WHERE session_id = 'sess-hook')",
            ("2026-09-03T10:05:00.000000Z",),
        )
        hook_mem.conn.commit()
        _run_hook(
            logger, hook_home, {"session_id": "sess-hook", "transcript_path": str(transcript)}
        )
        hook_scenarios.append(
            {"label": "session_ended_then_backfilled", "state": _snapshot(hook_mem)}
        )
        hook_mem.close()

    golden = {
        "meta": {
            "now": NOW,
            "note": (
                "Ids are aliased by insertion order; Pi session ids are relative to "
                f"{SESSIONS_DIR_PLACEHOLDER}. _now() is frozen."
            ),
        },
        "pi_sessions": {
            "first_count": pi_first,
            "rerun_count": pi_rerun,
            "absent_dir_count": pi_absent,
            "state": pi_state,
        },
        "codex": {
            "cases": codex_cases,
            "null_timestamp": null_timestamp,
            "state": codex_state,
        },
        "transcript": {
            "state": transcript_state,
            "rerun_state": transcript_rerun_state,
        },
        "hook_session_end": hook_scenarios,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"pi: imported {pi_first}, rerun {pi_rerun}, absent {pi_absent}")
    for case in codex_cases:
        print(f"  codex {case['label']:34} -> {case['count']}")
    print(f"  codex null_timestamp                     -> raises {null_timestamp['error_type']}")
    print(
        f"transcript: {sum(len(c['messages']) for c in transcript_state['conversations'])} messages"
    )
    print(f"wrote {OUT_PATH.relative_to(HERE.parent.parent)}")


if __name__ == "__main__":
    main()
