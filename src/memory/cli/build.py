"""Build skill: DB-only context loader for Builder Mode."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from memory.builder.ariad_method import get_ariad_method
from memory.builder.method_adoption import get_adopted_method, set_adopted_method
from memory.builder.method_inspection import (
    AVAILABLE_METHODS,
    render_available_method,
    render_journey_method_state,
    render_method_adoption_report,
    render_no_active_journey,
)
from memory.cli.conversation_logger import switch_conversation
from memory.cli.runtime import inspect_clone_role
from memory.client import MemoryClient
from memory.services.operating_mode import (
    activate_mode,
    get_active_mode,
    resolve_operating_session_id,
)
from memory.skills.mirror import _persist_global_sticky_defaults
from memory.surfaces.mode_transition import render_builder_mode_transition


def _print_builder_banner(slug: str, project_path: str | None = None) -> None:
    print(f"\033[38;5;117m⚙ Builder Mode active — journey: {slug}\033[0m", file=sys.stderr)
    if project_path:
        print(f"\033[38;5;117m  📁 {project_path}\033[0m", file=sys.stderr)


def _extract_query(journey_content: str, slug: str) -> str:
    lines = journey_content.splitlines()
    sections = ["description", "briefing", "context", "descrição", "contexto"]
    result = []
    capturing = False
    for line in lines:
        header = line.lstrip("#").strip().lower()
        if any(s in header for s in sections):
            capturing = True
            continue
        if capturing:
            if line.startswith("#"):
                break
            result.append(line)
    text = " ".join(result).strip()
    return text[:500] if text else slug


def _is_mirror_mind_checkout(start: Path | None = None) -> bool:
    """Return True when ``start`` is inside a Mirror Mind source checkout."""
    start_path = (start or Path.cwd()).expanduser().resolve()
    candidates = (start_path, *start_path.parents)
    for candidate in candidates:
        pyproject = candidate / "pyproject.toml"
        memory_package = candidate / "src" / "memory"
        if not pyproject.is_file() or not memory_package.is_dir():
            continue
        try:
            pyproject_text = pyproject.read_text(encoding="utf-8")
        except OSError:
            return False
        return 'name = "mirror"' in pyproject_text
    return False


def _check_clone_role_guard(
    *, ignore_production_role: bool, project_path: str | None = None
) -> None:
    role_start = Path(project_path) if project_path else None
    if not _is_mirror_mind_checkout(role_start):
        return
    role = inspect_clone_role(role_start)
    if not role.is_production:
        return
    if ignore_production_role:
        print(
            "\033[38;5;208m⚠️  Production clone override: --ignore-production-role passed.\033[0m",
            file=sys.stderr,
        )
        return
    source = role.source if role.source is not None else "<default: missing marker>"
    print(
        "Builder Mode refused: the journey project clone is marked 'production'.\n"
        f"  Project path: {project_path or '<current directory>'}\n"
        f"  Clone role source: {source}\n"
        "  Development should happen in a clone marked 'dev'.\n"
        "  To proceed here anyway, pass --ignore-production-role.",
        file=sys.stderr,
    )
    sys.exit(2)


def cmd_load(
    slug: str,
    *,
    ignore_production_role: bool = False,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()

    journey_content = mem.get_identity("journey", slug)
    if not journey_content:
        print(f"Error: journey '{slug}' not found.", file=sys.stderr)
        sys.exit(1)

    project_path = mem.journeys.get_project_path(slug)
    _check_clone_role_guard(
        ignore_production_role=ignore_production_role,
        project_path=project_path,
    )
    _print_builder_banner(slug, project_path)
    journey_text = journey_content if isinstance(journey_content, str) else slug
    print(
        render_builder_mode_transition(
            journey=slug,
            journey_content=journey_text,
            project_path=project_path,
        )
    )

    context = mem.load_mirror_context(persona="engineer", journey=slug)
    print(context)

    query_text = _extract_query(journey_text, slug)
    scoped = mem.search(query_text, limit=5, journey=slug)
    global_ = mem.search(query_text, limit=5)
    seen_ids: set[str] = set()
    merged: list = []
    for memory, score in scoped + global_:
        if memory.id not in seen_ids:
            seen_ids.add(memory.id)
            merged.append((memory, score))
    merged.sort(key=lambda x: x[1], reverse=True)
    relevant_memories = merged[:6]
    if relevant_memories:
        print("\n=== recent memories ===")
        for memory, _ in relevant_memories:
            print(f"\n[{memory.layer}] {memory.title}")
            print(memory.content)

    _persist_global_sticky_defaults(mem, persona="engineer", journey=slug)
    resolved_session_id = resolve_operating_session_id(mem.store, session_id)
    activate_mode(
        mem.store,
        mode="Builder Mode",
        journey=slug,
        session_id=resolved_session_id,
    )
    switch_conversation(session_id=resolved_session_id, persona="engineer", journey=slug)

    if project_path:
        print(f"\nproject_path={project_path}")
    else:
        print(
            f"\n[Journey '{slug}' has no project_path configured. "
            f"Run: python -m memory journey set-path {slug} /path/to/project]"
        )


def cmd_inspect_method(
    method: str | None,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient() if journey or method is None else None
    if journey:
        if mem is None:
            mem = MemoryClient()
        journey_content = mem.get_identity("journey", journey)
        if not journey_content:
            print(f"Error: journey '{journey}' not found.", file=sys.stderr)
            sys.exit(1)
        print(render_journey_method_state(journey, get_adopted_method(mem.store, journey)))
        return

    if method is None:
        if mem:
            resolved_session_id = resolve_operating_session_id(mem.store, session_id)
            active_mode = get_active_mode(mem.store, session_id=resolved_session_id)
            if active_mode and active_mode.mode == "Builder Mode" and active_mode.journey:
                print(
                    render_journey_method_state(
                        active_mode.journey,
                        get_adopted_method(mem.store, active_mode.journey),
                    )
                )
                return
        print(render_no_active_journey())
        return

    if method != "ariad":
        requested = method or "<none>"
        print(
            f"Error: Builder method '{requested}' not found. "
            f"Available methods: {', '.join(AVAILABLE_METHODS)}",
            file=sys.stderr,
        )
        sys.exit(1)
    print(render_available_method(get_ariad_method()))


def cmd_adopt_method(
    method: str,
    *,
    journey: str | None = None,
    session_id: str | None = None,
) -> None:
    mem = MemoryClient()
    if method != "ariad":
        print(
            f"Error: Builder method '{method}' not found. "
            f"Available methods: {', '.join(AVAILABLE_METHODS)}",
            file=sys.stderr,
        )
        sys.exit(1)

    resolved_journey = journey
    if not resolved_journey:
        resolved_session_id = resolve_operating_session_id(mem.store, session_id)
        active_mode = get_active_mode(mem.store, session_id=resolved_session_id)
        if active_mode and active_mode.mode == "Builder Mode" and active_mode.journey:
            resolved_journey = active_mode.journey
    if not resolved_journey:
        print(
            "Error: Builder method adoption requires a journey. "
            "Activate Builder Mode for a journey or pass --journey.",
            file=sys.stderr,
        )
        sys.exit(1)

    journey_content = mem.get_identity("journey", resolved_journey)
    if not journey_content:
        print(f"Error: journey '{resolved_journey}' not found.", file=sys.stderr)
        sys.exit(1)

    already_adopted = get_adopted_method(mem.store, resolved_journey) == method
    adoption = set_adopted_method(mem.store, resolved_journey, method)
    print(
        render_method_adoption_report(
            adoption.journey,
            adoption.method,
            already_adopted=already_adopted,
        )
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build skill — DB context loader")
    sub = parser.add_subparsers(dest="command", required=True)

    p_load = sub.add_parser("load", help="Load journey context from DB (emits project_path)")
    p_load.add_argument("slug", help="Journey ID")
    p_load.add_argument(
        "--ignore-production-role",
        action="store_true",
        dest="ignore_production_role",
        help="Override the production clone role guard for this invocation",
    )
    p_load.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for session-scoped operating mode state",
    )

    p_inspect = sub.add_parser(
        "inspect-method",
        help="Inspect a Builder method or the effective method state for a journey",
    )
    p_inspect.add_argument(
        "method",
        nargs="?",
        help="Builder method id to inspect, such as 'ariad'",
    )
    p_inspect.add_argument(
        "--journey",
        default=None,
        help="Journey slug whose effective Builder method state should be inspected",
    )
    p_inspect.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    p_adopt = sub.add_parser(
        "adopt",
        help="Adopt a Builder method for a journey",
    )
    p_adopt.add_argument(
        "--method",
        required=True,
        help="Builder method id to adopt, such as 'ariad'",
    )
    p_adopt.add_argument(
        "--journey",
        default=None,
        help="Journey slug that should adopt the Builder method",
    )
    p_adopt.add_argument(
        "--session-id",
        default=None,
        help="Runtime session id for resolving the active Builder journey",
    )

    args = parser.parse_args(argv)

    if args.command == "load":
        cmd_load(
            args.slug,
            ignore_production_role=args.ignore_production_role,
            session_id=args.session_id,
        )
    elif args.command == "inspect-method":
        cmd_inspect_method(args.method, journey=args.journey, session_id=args.session_id)
    elif args.command == "adopt":
        cmd_adopt_method(args.method, journey=args.journey, session_id=args.session_id)
