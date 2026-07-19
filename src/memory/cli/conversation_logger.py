"""Conversation logging for Claude Code hooks and instructions."""

import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from memory.cli.common import db_path_from_mirror_home
from memory.client import MemoryClient
from memory.config import (
    MEMORY_MAINTENANCE_MAX_EXTRACTIONS,
    MIRROR_HOME_REQUIRED_HINT,
    MUTE_FLAG_PATH,
)

_DEFAULT_PI_SESSIONS_DIR = Path.home() / ".pi" / "agent" / "sessions"


def _resolve_pi_sessions_dir() -> Path:
    """Resolve the Pi agent sessions directory.

    Pi writes session jsonl files to ``~/.pi/agent/sessions`` by default. When
    running under a non-default Pi home (tests, multi-user-on-one-machine),
    set ``PI_SESSIONS_DIR`` to point at the right directory. Supports ``~``.
    """
    raw = os.environ.get("PI_SESSIONS_DIR")
    if raw:
        return Path(raw).expanduser()
    return _DEFAULT_PI_SESSIONS_DIR


# Kept for backwards compatibility with tests that monkey-patch the module-level
# constant directly. Treated as an override when set to a truthy Path.
_PI_SESSIONS_DIR: Path | None = None

_MUTE_FLAG_PATH = MUTE_FLAG_PATH


def _mute_flag_path(mirror_home: str | Path | None = None) -> Path:
    if mirror_home is None:
        if _MUTE_FLAG_PATH is None:
            raise ValueError(MIRROR_HOME_REQUIRED_HINT)
        return _MUTE_FLAG_PATH
    return Path(mirror_home).expanduser() / "mute"


def _memory_client(mirror_home: str | Path | None = None) -> MemoryClient:
    return MemoryClient(db_path=db_path_from_mirror_home(mirror_home))


def _resolve_active_session_id(mirror_home: str | Path | None = None) -> str | None:
    """Return the most recently updated active runtime session, when available.

    Some SKILL.md-native runtimes invoke skill commands from the agent shell
    without exporting a session id. Pi still records the active session in the
    runtime session table through its extension. In that case, use the latest
    active runtime session as a best-effort bridge so Builder/Mirror skills can
    attach the current conversation to the selected journey.
    """
    try:
        mem = _memory_client(mirror_home)
        row = mem.store.conn.execute(
            """SELECT session_id FROM runtime_sessions
               WHERE active = 1
                 AND session_id != '__global_sticky_defaults__'
                 AND interface IS NOT NULL
                 AND interface != 'global_defaults'
               ORDER BY updated_at DESC
               LIMIT 1"""
        ).fetchone()
    except Exception:
        return None
    if not row:
        return None
    return row["session_id"]


def _resolve_session_id(
    session_id: str | None = None,
    mirror_home: str | Path | None = None,
) -> str | None:
    if session_id:
        return session_id
    env_session = os.environ.get("MIRROR_SESSION_ID", "").strip()
    if env_session:
        return env_session
    return _resolve_active_session_id(mirror_home)


def is_muted(mirror_home: str | Path | None = None) -> bool:
    """Return True when conversation logging is muted."""
    return _mute_flag_path(mirror_home).exists()


def set_mute(on: bool, mirror_home: str | Path | None = None) -> None:
    """Enable or disable muted mode."""
    mute_flag_path = _mute_flag_path(mirror_home)
    if on:
        mute_flag_path.parent.mkdir(parents=True, exist_ok=True)
        mute_flag_path.touch()
    elif mute_flag_path.exists():
        mute_flag_path.unlink()


def get_or_create_conversation(
    session_id: str,
    interface: str = "claude_code",
    persona: str | None = None,
    journey: str | None = None,
    mirror_home: str | Path | None = None,
) -> str:
    """Return the conversation_id for a session_id, creating it if needed."""
    mem = _memory_client(mirror_home)
    conv = mem.runtime_sessions.get_or_create_conversation(
        session_id,
        interface=interface,
        persona=persona,
        journey=journey,
    )
    return conv.id


def _generate_title(content: str) -> str:
    """Generate a short title from the first message content."""
    text = content.strip().split("\n")[0][:80]
    if len(text) > 60:
        text = text[:60].rsplit(" ", 1)[0] + "..."
    return text


def _session_metadata(session) -> dict:
    if not session or not session.metadata or not isinstance(session.metadata, str):
        return {}
    try:
        data = json.loads(session.metadata)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _discard_marker_active(session) -> bool:
    return bool(_session_metadata(session).get("discard_current_conversation"))


def log_user_message(
    session_id: str,
    content: str,
    interface: str = "claude_code",
    mirror_home: str | Path | None = None,
) -> None:
    """Record a user message and set the title on the first message."""
    mem = _memory_client(mirror_home)
    existing = mem.store.get_runtime_session(session_id)
    if _discard_marker_active(existing):
        mem.store.upsert_runtime_session(session_id, metadata=None, active=True, closed_at=None)
        existing = mem.store.get_runtime_session(session_id)
    is_new = existing is None or existing.conversation_id is None
    conv_id = get_or_create_conversation(
        session_id,
        interface=interface,
        mirror_home=mirror_home,
    )
    mem.store.upsert_runtime_session(
        session_id,
        interface=interface,
        active=True,
        closed_at=None,
    )
    if is_new:
        title = _generate_title(content)
        mem.conversations.set_provisional_title(conv_id, title)
    mem.add_message(conv_id, role="user", content=content)


def log_assistant_message(
    session_id: str,
    content: str,
    interface: str = "claude_code",
    mirror_home: str | Path | None = None,
) -> None:
    """Record an assistant message."""
    mem = _memory_client(mirror_home)
    existing = mem.store.get_runtime_session(session_id)
    if _discard_marker_active(existing):
        return
    conv_id = get_or_create_conversation(session_id, interface=interface, mirror_home=mirror_home)
    mem.add_message(conv_id, role="assistant", content=content)


def switch_conversation(
    session_id: str | None = None,
    persona: str | None = None,
    journey: str | None = None,
    mirror_home: str | Path | None = None,
    **kwargs,
) -> str | None:
    """Create a new conversation for a specific session."""
    resolved_session_id = _resolve_session_id(session_id, mirror_home)
    if not resolved_session_id:
        return None

    mem = _memory_client(mirror_home)
    runtime_session = mem.store.get_runtime_session(resolved_session_id)
    old_conv_id = runtime_session.conversation_id if runtime_session else None

    if old_conv_id:
        mem.end_conversation(old_conv_id, extract=True)

    interface = (
        runtime_session.interface
        if runtime_session and runtime_session.interface
        else "claude_code"
    )
    conv = mem.start_conversation(
        interface=interface,
        persona=persona,
        journey=journey,
    )
    if kwargs:
        mem.store.update_conversation(conv.id, **kwargs)

    mem.store.upsert_runtime_session(
        resolved_session_id,
        conversation_id=conv.id,
        interface=interface,
        persona=persona,
        journey=journey,
        active=True,
        closed_at=None,
    )
    return conv.id


def bind_conversation_context(
    session_id: str | None = None,
    persona: str | None = None,
    journey: str | None = None,
    mirror_home: str | Path | None = None,
) -> str | None:
    """Bind persona/journey to the current conversation without splitting it.

    Mirror Mode can be loaded many times during one runtime session as context is
    refreshed. Loading context should attach the current conversation to the
    resolved persona/journey, not close the conversation and create a new one.
    Explicit conversation boundaries remain owned by ``switch_conversation``.
    """
    resolved_session_id = _resolve_session_id(session_id, mirror_home)
    if not resolved_session_id:
        return None

    mem = _memory_client(mirror_home)
    runtime_session = mem.store.get_runtime_session(resolved_session_id)
    interface = (
        runtime_session.interface
        if runtime_session and runtime_session.interface
        else "claude_code"
    )
    conv_id = runtime_session.conversation_id if runtime_session else None
    conversation = mem.store.get_conversation(conv_id) if conv_id else None

    if conversation is not None and conversation.ended_at is None:
        mem.store.update_conversation(conv_id, persona=persona, journey=journey)
    else:
        conversation = mem.start_conversation(
            interface=interface,
            persona=persona,
            journey=journey,
        )
        conv_id = conversation.id

    mem.store.upsert_runtime_session(
        resolved_session_id,
        conversation_id=conv_id,
        interface=interface,
        persona=persona,
        journey=journey,
        active=True,
        closed_at=None,
    )
    return conv_id


def update_current_conversation(
    session_id: str | None = None,
    mirror_home: str | Path | None = None,
    **kwargs,
) -> None:
    """Update fields on the current conversation for a specific session."""
    resolved_session_id = _resolve_session_id(session_id, mirror_home)
    if not resolved_session_id:
        return
    mem = _memory_client(mirror_home)
    runtime_session = mem.store.get_runtime_session(resolved_session_id)
    conv_id = runtime_session.conversation_id if runtime_session else None
    if not conv_id:
        return
    mem.store.update_conversation(conv_id, **kwargs)


def log_assistant_to_session(
    content: str,
    session_id: str | None = None,
    mirror_home: str | Path | None = None,
) -> None:
    """Record an assistant message for a specific session."""
    resolved_session_id = _resolve_session_id(session_id, mirror_home)
    if not resolved_session_id:
        return
    log_assistant_message(resolved_session_id, content, mirror_home=mirror_home)


def log_assistant_to_current(
    content: str,
    session_id: str | None = None,
    mirror_home: str | Path | None = None,
) -> None:
    """Backward-compatible alias for session-aware assistant logging."""
    log_assistant_to_session(content, session_id=session_id, mirror_home=mirror_home)


def end_session(
    session_id: str,
    extract: bool = False,
    mirror_home: str | Path | None = None,
) -> None:
    """End a conversation session."""
    mem = _memory_client(mirror_home)
    runtime_session = mem.store.get_runtime_session(session_id)
    conv_id = runtime_session.conversation_id if runtime_session else None
    if not conv_id:
        return

    mem.end_conversation(conv_id, extract=extract)
    from memory.models import _now

    mem.store.upsert_runtime_session(session_id, active=False, closed_at=_now())


# --- Pi session lifecycle ---


def extract_pending(mirror_home: str | Path | None = None, limit: int | None = None) -> int:
    """Extract memories from ended conversations not yet processed.

    Each conversation is isolated: a failure (provider outage, poison-pill
    transcript, auth error) is recorded and skipped so it cannot crash the
    batch or block the conversations queued behind it. Returns the number of
    conversations successfully extracted.

    ``limit`` bounds worst-case startup spend (CV9.E2.S26, AI-05): at most
    ``limit`` conversations are processed per call, oldest-ended first. Any
    remainder is left pending and carries over to the next call (typically the
    next session start) rather than being silently dropped. Defaults to
    ``MEMORY_MAINTENANCE_MAX_EXTRACTIONS`` so a backlog can never turn one
    session start into an unbounded, invisible spend loop.
    """
    if limit is None:
        limit = MEMORY_MAINTENANCE_MAX_EXTRACTIONS
    mem = _memory_client(mirror_home)
    pending = mem.store.get_unextracted_conversations(limit=limit)
    extracted = 0
    for conv in pending:
        try:
            mem.conversations.extract_conversation(conv.id)
            extracted += 1
        except Exception:
            continue
    return extracted


def _count_quarantined_conversations(mirror_home: str | Path | None = None) -> int:
    """Conversations quarantined after repeated extraction failure (fail-quiet).

    The client is held in a local for the whole read. Chaining
    ``_memory_client(...).store.count_...()`` lets the temporary client be
    garbage-collected — closing its connection via ``__del__`` — before the
    query runs, which raises "Cannot operate on a closed database".
    """
    mem = None
    try:
        mem = _memory_client(mirror_home)
        return mem.store.count_quarantined_conversations()
    except Exception:
        return 0


def _count_parse_failed_conversations(mirror_home: str | Path | None = None) -> int:
    """Conversations whose model output could not be parsed (fail-quiet, AI-10).

    Held in a local for the whole read for the same closed-connection reason as
    ``_count_quarantined_conversations``.
    """
    mem = None
    try:
        mem = _memory_client(mirror_home)
        return mem.store.count_conversations_with_extraction_status("parse_failed")
    except Exception:
        return 0
    finally:
        if mem is not None:
            mem.close()


def _count_carried_over_conversations(mirror_home: str | Path | None = None) -> int:
    """Conversations still eligible for extraction after a capped run (CV9.E2.S26, AI-05).

    Held in a local for the whole read for the same closed-connection reason as
    ``_count_quarantined_conversations``.
    """
    mem = None
    try:
        mem = _memory_client(mirror_home)
        return mem.store.count_unextracted_conversations()
    except Exception:
        return 0
    finally:
        if mem is not None:
            mem.close()


def retitle_pending_conversations(
    mirror_home: str | Path | None = None,
    *,
    limit: int = 5,
) -> int:
    """Opportunistically improve a small batch of ended conversation titles at startup."""
    if limit <= 0:
        return 0
    try:
        mem = _memory_client(mirror_home)
        scan_limit = max(limit * 10, 50)
        rows = mem.store.conn.execute(
            """
            SELECT c.id
              FROM conversations c
             WHERE c.ended_at IS NOT NULL
               AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user')
               AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'assistant')
             ORDER BY c.ended_at DESC, c.started_at DESC
             LIMIT ?
            """,
            (scan_limit,),
        ).fetchall()
    except Exception:
        return 0

    changed = 0
    for row in rows:
        if changed >= limit:
            break
        try:
            conversation = mem.store.get_conversation(row["id"])
            if conversation is None or not mem.conversations.title_needs_improvement(conversation):
                continue
            before_title = conversation.title
            updated = mem.conversations.maybe_generate_title(
                conversation.id,
                source="startup_maintenance",
            )
            if updated is not None and updated.title != before_title:
                changed += 1
        except Exception:
            continue
    return changed


def _reset_session_orientation(mirror_home: str | Path | None = None) -> None:
    """New runtime sessions start from intention, not stale mode or journey context."""
    from memory.services.operating_mode import deactivate_mode
    from memory.skills.mirror import _GLOBAL_STICKY_DEFAULTS_SESSION_ID

    mem = _memory_client(mirror_home)
    try:
        deactivate_mode(mem.store)
        mem.conn.execute(
            "DELETE FROM runtime_sessions WHERE session_id = ?",
            (_GLOBAL_STICKY_DEFAULTS_SESSION_ID,),
        )
        mem.conn.commit()
    finally:
        mem.close()


def session_start_fast(mirror_home: str | Path | None = None) -> str:
    """Start logging without running expensive maintenance work."""
    set_mute(False, mirror_home)
    _reset_session_orientation(mirror_home=mirror_home)
    return "Conversation logging ACTIVE. Maintenance deferred."


def _timed_step(label: str, fn) -> tuple[str, int, float]:
    started = time.monotonic()
    count = fn()
    elapsed = time.monotonic() - started
    return label, count, elapsed


def session_maintenance(mirror_home: str | Path | None = None) -> str:
    """Run startup maintenance with per-step timing.

    This may be slow because extraction can call LLMs. Pi runs it in the
    background so opening the runtime is not blocked by pending maintenance.
    """
    steps = [
        _timed_step(
            "Closed stale conversations",
            lambda: close_stale_orphans(threshold_minutes=30, mirror_home=mirror_home),
        ),
        _timed_step(
            "Backfilled Pi sessions", lambda: backfill_pi_sessions(mirror_home=mirror_home)
        ),
        _timed_step(
            "Retitled pending conversations",
            lambda: retitle_pending_conversations(mirror_home=mirror_home),
        ),
        _timed_step(
            "Extracted pending conversations", lambda: extract_pending(mirror_home=mirror_home)
        ),
    ]
    parts = ["Conversation maintenance complete."]
    for label, count, elapsed in steps:
        parts.append(f"{label}: {count} ({elapsed:.1f}s)")
    quarantined = _count_quarantined_conversations(mirror_home)
    if quarantined:
        parts.append(
            f"⚠ {quarantined} conversation(s) quarantined after repeated extraction failure"
        )
    parse_failed = _count_parse_failed_conversations(mirror_home)
    if parse_failed:
        parts.append(
            f"⚠ {parse_failed} conversation(s) with unreadable model output (parse_failed)"
        )
    carried_over = _count_carried_over_conversations(mirror_home)
    if carried_over:
        parts.append(
            f"{carried_over} conversation(s) carried over to the next run "
            "(maintenance extraction budget)"
        )
    return "\n".join(parts)


def session_start(mirror_home: str | Path | None = None) -> str:
    """Unmute, close stale orphans, backfill Pi sessions, and run pending extraction."""
    set_mute(False, mirror_home)
    _reset_session_orientation(mirror_home=mirror_home)
    maintenance = session_maintenance(mirror_home=mirror_home)
    return "\n".join(["Conversation logging ACTIVE.", maintenance])


def close_stale_orphans(
    threshold_minutes: int = 30,
    mirror_home: str | Path | None = None,
) -> int:
    """End open conversations idle longer than threshold_minutes."""
    threshold_dt = (datetime.now(timezone.utc) - timedelta(minutes=threshold_minutes)).isoformat()
    mem = _memory_client(mirror_home)
    active_conv_ids = mem.store.get_active_runtime_conversation_ids()
    orphans = mem.store.get_open_conversations_idle_since(threshold_dt)
    count = 0
    for conv in orphans:
        if conv.id in active_conv_ids:
            continue
        try:
            mem.conversations.end_conversation(conv.id, extract=True)
        except Exception:
            # The orphan is still closed (ended_at is set before extraction);
            # an extraction failure is recorded and must not stop the loop.
            pass
        count += 1
    return count


def _parse_pi_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


def _parse_pi_timestamp(ts: object) -> str:
    if isinstance(ts, (int, float)) and ts > 1e10:
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat()
    if isinstance(ts, str):
        return ts
    from memory.models import _now

    return _now()


def backfill_pi_sessions(
    mirror_home: str | Path | None = None,
    *,
    sessions_dir: str | Path | None = None,
) -> int:
    """Import untracked Pi session JSONL files into the memory system.

    The source directory is resolved in this order:
      1. explicit ``sessions_dir`` argument
      2. module-level ``_PI_SESSIONS_DIR`` override (for test monkey-patching)
      3. ``PI_SESSIONS_DIR`` environment variable
      4. ``~/.pi/agent/sessions`` (Pi's default)
    """
    if sessions_dir is not None:
        pi_sessions_dir = Path(sessions_dir).expanduser()
    elif _PI_SESSIONS_DIR is not None:
        pi_sessions_dir = _PI_SESSIONS_DIR
    else:
        pi_sessions_dir = _resolve_pi_sessions_dir()

    if not pi_sessions_dir.exists():
        return 0
    count = 0
    for session_file in sorted(pi_sessions_dir.rglob("*.jsonl")):
        session_id = str(session_file)
        mem = _memory_client(mirror_home)
        if mem.store.get_runtime_session(session_id):
            continue
        messages: list[dict] = []
        try:
            for line in session_file.read_text().splitlines():
                if not line.strip():
                    continue
                entry = json.loads(line)
                if entry.get("type") != "message":
                    continue
                msg = entry.get("message", {})
                role = msg.get("role", "")
                if role not in ("user", "assistant"):
                    continue
                content = _parse_pi_content(msg.get("content", ""))
                if not content.strip():
                    continue
                ts = _parse_pi_timestamp(msg.get("timestamp"))
                messages.append({"role": role, "content": content, "created_at": ts})
        except Exception:
            continue
        if len(messages) < 2:
            continue
        from memory.models import Message as _Msg

        conv = mem.start_conversation(interface="pi")
        for m in messages:
            mem.store.add_message(
                _Msg(
                    conversation_id=conv.id,
                    role=m["role"],
                    content=m["content"],
                    created_at=m["created_at"],
                )
            )
        first_user = next((m for m in messages if m["role"] == "user"), None)
        if first_user:
            title = first_user["content"].strip().split("\n")[0][:60]
            mem.conversations.set_provisional_title(conv.id, title)
        mem.store.update_conversation(conv.id, ended_at=messages[-1]["created_at"])
        mem.store.upsert_runtime_session(
            session_id,
            conversation_id=conv.id,
            interface="pi",
            active=False,
            closed_at=messages[-1]["created_at"],
        )
        count += 1
    return count


def backfill_codex_session(
    jsonl_path: str | Path,
    mirror_home: str | Path | None = None,
    interface: str = "codex",
) -> int:
    """Import a Codex session JSONL file into the memory system."""
    jsonl_path = Path(jsonl_path).expanduser()
    if not jsonl_path.exists():
        return 0

    session_id = None
    messages: list[dict] = []

    try:
        with open(jsonl_path) as f:
            for line in f:
                if not line.strip():
                    continue
                entry = json.loads(line)
                entry_type = entry.get("type")
                payload = entry.get("payload", {})

                if entry_type == "session_meta":
                    session_id = payload.get("id")
                elif entry_type == "event_msg":
                    payload_type = payload.get("type")
                    if payload_type in ("user_message", "agent_message"):
                        role = "user" if payload_type == "user_message" else "assistant"
                        content = payload.get("message", "")
                        ts = entry.get("timestamp")
                        if content:
                            messages.append({"role": role, "content": content, "created_at": ts})
    except Exception:
        return 0

    if not session_id or not messages:
        return 0

    mem = _memory_client(mirror_home)
    if mem.store.get_runtime_session(session_id):
        return 0

    from memory.models import Message as _Msg

    conv = mem.start_conversation(interface=interface)
    for m in messages:
        mem.store.add_message(
            _Msg(
                conversation_id=conv.id,
                role=m["role"],
                content=m["content"],
                created_at=m["created_at"],
            )
        )

    first_user = next((m for m in messages if m["role"] == "user"), None)
    if first_user:
        title = _generate_title(first_user["content"])
        mem.store.update_conversation(conv.id, title=title)

    mem.store.update_conversation(conv.id, ended_at=messages[-1]["created_at"])
    mem.store.upsert_runtime_session(
        session_id,
        conversation_id=conv.id,
        interface=interface,
        active=False,
        closed_at=messages[-1]["created_at"],
    )
    return 1


# --- Hook entry points ---


def hook_user_prompt():
    """Entry point for the UserPromptSubmit hook. Reads JSON from stdin."""
    try:
        if is_muted():
            sys.exit(0)
        data = json.load(sys.stdin)
        session_id = data.get("session_id", "")
        prompt = data.get("prompt", "")
        if session_id and prompt and not prompt.startswith("/"):
            log_user_message(session_id, prompt)
    except Exception:
        pass
    sys.exit(0)


def backfill_assistant_messages(transcript_path: str) -> None:
    """Backfill assistant messages from a JSONL transcript.

    Called at session end to capture responses that were not explicitly recorded
    through run.py log. Stores the complete response text, excluding tool-call
    metadata, for each uncovered turn.
    """
    from memory.cli.transcript_export import _assistant_text, parse_jsonl

    entries = parse_jsonl(transcript_path)
    if not entries:
        return

    timestamps = [e.get("timestamp", "") for e in entries if e.get("timestamp")]
    if not timestamps:
        return

    start_time = min(timestamps)
    end_time = max(timestamps)

    mem = MemoryClient()
    conversations = mem.store.get_conversations_in_range(start_time, end_time)

    for conv in conversations:
        existing = mem.store.get_messages(conv.id)
        if any(m.role == "assistant" for m in existing):
            continue

        conv_start = conv.started_at
        conv_end = conv.ended_at or end_time

        for entry in entries:
            ts = entry.get("timestamp", "")
            if not ts or not (conv_start <= ts <= conv_end):
                continue
            if entry.get("type") != "assistant":
                continue
            content_blocks = entry.get("message", {}).get("content", [])
            text = _assistant_text(content_blocks)
            if text:
                mem.add_message(conv.id, role="assistant", content=text)


def _journey_aliases(mem: MemoryClient) -> dict[str, list[str]]:
    rows = mem.store.conn.execute(
        "SELECT key, content FROM identity WHERE layer = 'journey' ORDER BY key"
    ).fetchall()
    aliases: dict[str, list[str]] = {}
    for row in rows:
        slug = row["key"]
        content = row["content"] or ""
        values = {slug.lower(), slug.replace("-", " ").lower()}
        for line in content.splitlines():
            heading = line.strip()
            if heading.startswith("#"):
                title = heading.lstrip("#").strip()
                if title:
                    values.add(title.lower())
                break
        aliases[slug] = sorted(values, key=len, reverse=True)
    return aliases


def _first_user_message(mem: MemoryClient, conversation_id: str) -> str:
    row = mem.store.conn.execute(
        """SELECT content FROM messages
           WHERE conversation_id = ? AND role = 'user'
           ORDER BY created_at ASC LIMIT 1""",
        (conversation_id,),
    ).fetchone()
    return row["content"] if row else ""


def _activation_text(title: str | None, first_user: str) -> str:
    parts = [title or ""]
    stripped = first_user.strip()
    if "</skill>" in stripped:
        parts.append(stripped.rsplit("</skill>", 1)[-1])
    first_line = stripped.splitlines()[0] if stripped else ""
    parts.append(first_line)
    return "\n".join(parts).lower()


def _infer_journey_for_conversation(
    title: str | None,
    first_user: str,
    aliases: dict[str, list[str]],
) -> tuple[str | None, str | None]:
    text = _activation_text(title, first_user)
    if not text.strip():
        return None, None

    build_match = re.search(r"(?:/mm-build|\$mm-build|/mm:build)\s+([a-z0-9][a-z0-9_-]*)", text)
    if build_match:
        slug = build_match.group(1)
        if slug in aliases:
            return slug, "explicit build command"

    candidates: list[tuple[str, str, str]] = []
    for slug, values in aliases.items():
        for alias in values:
            escaped = re.escape(alias)
            if re.search(rf"(?:^|\n)\s*{escaped}\s*$", text):
                candidates.append((slug, alias, "standalone journey slug/name"))
                break
            activation = (
                rf"(?:vamos|quero|preciso|let'?s)\s+"
                rf"(?:retomar\s+)?(?:trabalhar|ativar|continuar|retomar|work)"
                rf"(?:\s+\w+){{0,5}}\s+(?:journey|jornada|travessia|projeto|project)?\s*"
                rf"(?:no|na|em|on|with)?\s*{escaped}\b"
                rf"(?=$|\s*[.,;:!?)]|\s+(?:em|in|journey|jornada|travessia|modo)\b)"
            )
            if re.search(activation, text):
                candidates.append((slug, alias, "activation phrase"))
                break

    if not candidates:
        return None, None
    candidates.sort(key=lambda item: len(item[1]), reverse=True)
    best = candidates[0]
    if len(candidates) > 1 and len(candidates[0][1]) == len(candidates[1][1]):
        return None, None
    return best[0], best[2]


def diagnose_journey_associations(
    *,
    mirror_home: str | Path | None = None,
    apply: bool = False,
    limit: int | None = None,
) -> list[dict[str, str | int]]:
    """Find and optionally repair journeyless conversations with high-confidence matches."""
    mem = _memory_client(mirror_home)
    aliases = _journey_aliases(mem)
    sql = """SELECT id, title, started_at FROM conversations
             WHERE journey IS NULL
             ORDER BY started_at DESC"""
    if limit is not None:
        sql += " LIMIT ?"
        rows = mem.store.conn.execute(sql, (limit,)).fetchall()
    else:
        rows = mem.store.conn.execute(sql).fetchall()

    findings: list[dict[str, str | int]] = []
    for row in rows:
        first_user = _first_user_message(mem, row["id"])
        journey, reason = _infer_journey_for_conversation(row["title"], first_user, aliases)
        if not journey:
            continue
        msg_count = mem.store.conn.execute(
            "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?",
            (row["id"],),
        ).fetchone()["count"]
        findings.append(
            {
                "conversation_id": row["id"],
                "journey": journey,
                "reason": reason or "high-confidence match",
                "title": row["title"] or "",
                "started_at": row["started_at"],
                "message_count": msg_count,
            }
        )

    if apply and findings:
        from memory.cli.backup import backup
        from memory.config import _RESOLVED_MIRROR_HOME

        backup_home = Path(mirror_home).expanduser() if mirror_home else _RESOLVED_MIRROR_HOME
        backup_path = backup(silent=False, mirror_home=backup_home)
        if backup_path is None:
            raise RuntimeError("Database backup failed; refusing to repair conversations.")
        for finding in findings:
            mem.store.update_conversation(
                str(finding["conversation_id"]), journey=str(finding["journey"])
            )

    return findings


def discard_current_conversation(
    *,
    session_id: str | None = None,
    interface: str = "pi",
    mirror_home: str | Path | None = None,
) -> str | None:
    """Delete the current runtime conversation and mark the session discarded."""
    mem = _memory_client(mirror_home)
    resolved_session_id = session_id
    if resolved_session_id is None:
        active_sessions = mem.store.get_active_runtime_session_ids(interface)
        resolved_session_id = active_sessions[0] if active_sessions else None
    if resolved_session_id is None:
        return None

    runtime_session = mem.store.get_runtime_session(resolved_session_id)
    if runtime_session is None or runtime_session.conversation_id is None:
        return None

    conversation_id = runtime_session.conversation_id
    mem.conversations.delete_conversations([conversation_id])
    mem.store.upsert_runtime_session(
        resolved_session_id,
        conversation_id=None,
        interface=runtime_session.interface or interface,
        active=False,
        metadata=json.dumps({"discard_current_conversation": True}),
    )
    return conversation_id


def _print_journey_association_findings(
    findings: list[dict[str, str | int]], *, applied: bool
) -> None:
    label = "Repaired" if applied else "Repair candidates"
    print(f"{label}: {len(findings)}")
    for finding in findings:
        print(
            f"- {finding['conversation_id']} -> {finding['journey']} "
            f"({finding['reason']}; {finding['message_count']} messages; "
            f"{finding['started_at']}; {finding['title']})"
        )


def hook_session_end():
    """Entry point for the SessionEnd hook. Reads JSON from stdin."""
    try:
        data = json.load(sys.stdin)
        session_id = data.get("session_id", "")
        if session_id:
            end_session(session_id, extract=True)

        transcript_path = data.get("transcript_path", "")
        if not transcript_path:
            project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
            if project_dir:
                project_hash = project_dir.lstrip("/").replace("/", "-")
                transcript_path = str(
                    Path.home() / ".claude" / "projects" / project_hash / f"{session_id}.jsonl"
                )
        if transcript_path and Path(transcript_path).exists():
            backfill_assistant_messages(transcript_path)
    except Exception:
        pass
    sys.exit(0)


def main(argv: list[str] | None = None) -> None:
    """CLI entry point for `python -m memory conversation-logger ...`"""
    args = list(argv if argv is not None else sys.argv[1:])
    mirror_home = None
    session_id = None
    if "--mirror-home" in args:
        idx = args.index("--mirror-home")
        if idx + 1 >= len(args):
            print("Error: --mirror-home requires a path", file=sys.stderr)
            sys.exit(1)
        mirror_home = args[idx + 1]
        del args[idx : idx + 2]
    if "--session-id" in args:
        idx = args.index("--session-id")
        if idx + 1 >= len(args):
            print("Error: --session-id requires a value", file=sys.stderr)
            sys.exit(1)
        session_id = args[idx + 1]
        del args[idx : idx + 2]
    if not args:
        sys.exit(1)
    cmd = args[0]
    if cmd == "user-prompt":
        hook_user_prompt()
    elif cmd == "session-end":
        hook_session_end()
    elif cmd == "mute":
        set_mute(True, mirror_home)
        print("Conversation logging MUTED.")
    elif cmd == "unmute":
        set_mute(False, mirror_home)
        print("Conversation logging ACTIVE.")
    elif cmd == "status":
        print("MUTED" if is_muted(mirror_home) else "ACTIVE")
    elif cmd == "switch":
        conv_id = switch_conversation(session_id=session_id, mirror_home=mirror_home)
        if conv_id:
            print(f"New conversation created: {conv_id}")
        else:
            print("No active session found.")
    elif cmd in ("log-assistant", "log-user"):
        remaining = list(args[1:])
        interface = "claude_code"
        if "--interface" in remaining:
            idx = remaining.index("--interface")
            if idx + 1 < len(remaining):
                interface = remaining[idx + 1]
                del remaining[idx : idx + 2]
        if len(remaining) >= 2:
            fn = log_user_message if cmd == "log-user" else log_assistant_message
            fn(remaining[0], remaining[1], interface=interface, mirror_home=mirror_home)
    elif cmd == "session-start":
        if "--fast" in args:
            print(session_start_fast(mirror_home=mirror_home))
        else:
            print(session_start(mirror_home=mirror_home))
    elif cmd == "session-maintenance":
        print(session_maintenance(mirror_home=mirror_home))
    elif cmd == "discard-current":
        interface = "pi"
        if "--interface" in args:
            idx = args.index("--interface")
            if idx + 1 < len(args):
                interface = args[idx + 1]
        conversation_id = discard_current_conversation(
            session_id=session_id,
            interface=interface,
            mirror_home=mirror_home,
        )
        if conversation_id:
            print(f"Discarded current conversation: {conversation_id}")
        else:
            print("No current conversation to discard.")
    elif cmd == "session-end-pi":
        if len(args) >= 2:
            end_session(args[1], extract=False, mirror_home=mirror_home)
    elif cmd in ("diagnose-journeys", "repair-journeys"):
        apply = cmd == "repair-journeys" and "--apply" in args
        limit = None
        if "--limit" in args:
            idx = args.index("--limit")
            if idx + 1 >= len(args):
                print("Error: --limit requires a number", file=sys.stderr)
                sys.exit(1)
            limit = int(args[idx + 1])
        findings = diagnose_journey_associations(
            mirror_home=mirror_home,
            apply=apply,
            limit=limit,
        )
        _print_journey_association_findings(findings, applied=apply)
        if cmd == "repair-journeys" and not apply:
            print("Dry run only. Re-run with --apply to repair after reviewing candidates.")
    elif cmd == "backfill-codex-session":
        if len(args) >= 2:
            path = args[1]
            interface = "codex"
            if "--interface" in args:
                idx = args.index("--interface")
                if idx + 1 < len(args):
                    interface = args[idx + 1]
            count = backfill_codex_session(path, mirror_home=mirror_home, interface=interface)
            if count:
                print(f"Backfilled 1 Codex session from {path}")
            else:
                print(f"No new Codex session backfilled from {path}")


if __name__ == "__main__":
    main()
