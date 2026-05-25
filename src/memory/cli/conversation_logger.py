"""Conversation logging for Claude Code hooks and instructions."""

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from memory.cli.common import db_path_from_mirror_home
from memory.client import MemoryClient
from memory.config import MUTE_FLAG_PATH

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


def log_user_message(
    session_id: str,
    content: str,
    interface: str = "claude_code",
    mirror_home: str | Path | None = None,
) -> None:
    """Record a user message and set the title on the first message."""
    mem = _memory_client(mirror_home)
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
        mem.store.update_conversation(conv_id, title=title)
    mem.add_message(conv_id, role="user", content=content)


def log_assistant_message(
    session_id: str,
    content: str,
    interface: str = "claude_code",
    mirror_home: str | Path | None = None,
) -> None:
    """Record an assistant message."""
    conv_id = get_or_create_conversation(session_id, interface=interface, mirror_home=mirror_home)
    mem = _memory_client(mirror_home)
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


def extract_pending(mirror_home: str | Path | None = None) -> int:
    """Extract memories from ended conversations not yet processed."""
    mem = _memory_client(mirror_home)
    pending = mem.store.get_unextracted_conversations()
    for conv in pending:
        mem.conversations.extract_conversation(conv.id)
    return len(pending)


def session_start(mirror_home: str | Path | None = None) -> str:
    """Unmute, close stale orphans, backfill Pi sessions, and run pending extraction."""
    set_mute(False, mirror_home)
    orphans = close_stale_orphans(threshold_minutes=30, mirror_home=mirror_home)
    backfilled = backfill_pi_sessions(mirror_home=mirror_home)
    extracted = extract_pending(mirror_home=mirror_home)
    parts = ["Conversation logging ACTIVE."]
    if orphans:
        parts.append(f"Closed {orphans} stale conversation(s).")
    if backfilled:
        parts.append(f"Backfilled {backfilled} Pi session(s).")
    if extracted:
        parts.append(f"Extracted memories from {extracted} pending conversation(s).")
    return "\n".join(parts)


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
        mem.conversations.end_conversation(conv.id, extract=True)
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
            mem.store.update_conversation(conv.id, title=title)
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
        print(session_start(mirror_home=mirror_home))
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
