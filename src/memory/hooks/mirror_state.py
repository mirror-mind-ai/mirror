"""Read and update Mirror Mode state stored per runtime session."""

from __future__ import annotations

import argparse
import sys
from typing import Any

from memory.client import MemoryClient


def _memory_client() -> MemoryClient:
    return MemoryClient()


def _normalize_session_id(session_id: str | None) -> str:
    """Return a non-empty session id or the empty string.

    Callers decide how to handle the empty case. CLI entry points warn on
    stderr instead of silently no-op'ing so that a missing --session-id from a
    hook integration is visible.
    """
    if not session_id:
        return ""
    return session_id


def _load_state(session_id: str | None) -> dict[str, Any]:
    resolved_session_id = _normalize_session_id(session_id)
    if not resolved_session_id:
        return {}
    client = _memory_client()
    session = client.store.get_runtime_session(resolved_session_id)
    if not session:
        return {}
    data: dict[str, Any] = {
        "active": session.mirror_active,
        "hook_injected": session.hook_injected,
    }
    if session.persona:
        data["persona"] = session.persona
    if session.journey:
        data["journey"] = session.journey
    return data


def needs_inject(session_id: str | None = None) -> bool:
    """Return True when Mirror Mode is active and hook context was not injected."""
    state = _load_state(session_id)
    return bool(state.get("active")) and not bool(state.get("hook_injected"))


def get_value(key: str, session_id: str | None = None) -> str:
    """Return a text field from the Mirror state, or an empty string."""
    state = _load_state(session_id)
    value = state.get(key, "")
    if key == "journey" and not isinstance(value, str):
        value = ""
    return value if isinstance(value, str) else ""


def write_state(
    active: bool,
    persona: str | None = None,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    """Write Mirror Mode state for one runtime session.

    Side-effect inversion note: when ``active=True`` we set
    ``hook_injected=False`` because a newly-activated session owes an
    injection; when ``active=False`` we set ``hook_injected=True`` because
    a deactivated session has nothing more to inject.
    """
    resolved_session_id = _normalize_session_id(session_id)
    if not resolved_session_id:
        return
    client = _memory_client()
    client.store.upsert_runtime_session(
        resolved_session_id,
        mirror_active=active,
        persona=persona,
        journey=journey,
        hook_injected=not active,
    )


def mark_injected(session_id: str | None = None) -> None:
    """Mark hook context as injected for a runtime session."""
    resolved_session_id = _normalize_session_id(session_id)
    if not resolved_session_id:
        return
    # Reuse one client for the read + write pair. Opening two clients means
    # running full bootstrap + migrations twice for a single hook invocation.
    # We intentionally do not close() here: the hook runs as a subprocess and
    # exits shortly after, and closing would break test doubles that share a
    # mocked client across calls.
    mem = _memory_client()
    session = mem.store.get_runtime_session(resolved_session_id)
    if not session:
        return
    mem.store.upsert_runtime_session(
        resolved_session_id,
        hook_injected=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Mirror hook state helpers")
    parser.add_argument("--session-id", default=None, help="Runtime session id")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("needs-inject", help="Print true if context should be injected")

    p_get = subparsers.add_parser("get", help="Print a string value from state")
    p_get.add_argument("key")

    subparsers.add_parser("mark-injected", help="Mark context as injected")

    args = parser.parse_args()

    if not args.session_id:
        # Fail loud, not silent: hooks that forget to pass --session-id should
        # show up as a visible warning on stderr rather than a silent no-op.
        print(
            "warning: mirror_state invoked without --session-id; no state change.",
            file=sys.stderr,
        )

    if args.command == "needs-inject":
        print("true" if needs_inject(args.session_id) else "false")
    elif args.command == "get":
        print(get_value(args.key, args.session_id))
    elif args.command == "mark-injected":
        mark_injected(args.session_id)


if __name__ == "__main__":
    main()
