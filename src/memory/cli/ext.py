"""CLI dispatcher for ``python -m memory ext <id> <subcommand>``.

The dispatcher is the runtime side of the extension contract: given an
installed extension and a subcommand, it loads the extension, looks up
the handler registered through ``api.register_cli``, and runs it.

Three top-level commands are recognised by the dispatcher itself
(``list``, ``bind``, ``unbind``, ``bindings``, ``migrate``). Everything
else is treated as ``<extension_id> <subcommand>`` and forwarded to the
extension's CLI registry.

The dispatcher is intentionally thin. It does not parse the arguments
of individual subcommands — that is the extension's job. Each handler
receives the remaining argv as a plain ``list[str]``.
"""

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from memory.cli.extensions import (
    discover_extensions,
)
from memory.config import (
    default_extensions_dir_for_home,
    resolve_mirror_home,
)
from memory.db.connection import get_connection
from memory.extensions.errors import ExtensionError
from memory.extensions.loader import load_extension

# --- argv helpers ---------------------------------------------------------


def _split_global_flags(args: list[str]) -> tuple[list[str], dict[str, str]]:
    """Pull ``--mirror-home`` out of an arbitrary argv list.

    Returns ``(remaining_args, flags)``. The mirror-home flag is the only
    global flag the dispatcher consumes; everything else is handed to the
    extension subcommand unchanged.
    """
    remaining: list[str] = []
    flags: dict[str, str] = {}
    i = 0
    while i < len(args):
        if args[i] == "--mirror-home" and i + 1 < len(args):
            flags["mirror_home"] = args[i + 1]
            i += 2
            continue
        remaining.append(args[i])
        i += 1
    return remaining, flags


def _resolve_home(flags: dict[str, str]) -> Path:
    explicit = flags.get("mirror_home")
    if explicit is not None:
        return Path(explicit).expanduser()
    try:
        return resolve_mirror_home()
    except ValueError as exc:
        print(str(exc))
        sys.exit(1)


def _open_connection(mirror_home: Path) -> sqlite3.Connection:
    # CV9.E2.S6: extension dispatch resolves the same env-aware database as
    # the core (one database per mirror home and environment) so a session
    # can never straddle two files.
    from memory.config import db_path_for_home

    return get_connection(db_path_for_home(mirror_home))


def _installed_extension_dir(mirror_home: Path, extension_id: str) -> Path:
    return default_extensions_dir_for_home(mirror_home) / extension_id


# --- Top-level commands ---------------------------------------------------


def _cmd_list(mirror_home: Path) -> int:
    extensions_root = default_extensions_dir_for_home(mirror_home)
    manifests, errors = discover_extensions(extensions_root)
    command_skills = [m for m in manifests if m.get("kind") == "command-skill"]
    print(f"Extensions root: {extensions_root}")
    print("=== COMMAND-SKILL EXTENSIONS ===")
    if not command_skills:
        print("  (none)")
    for manifest in command_skills:
        print(f"  {manifest['id']}: {manifest['summary']}")
    if errors:
        print("\n=== INVALID EXTENSIONS ===")
        for ext_id, message in errors:
            print(f"  {ext_id}: {message}")
    return 0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cmd_bind(
    *,
    mirror_home: Path,
    extension_id: str,
    capability_id: str,
    target_kind: str,
    target_id: str | None,
) -> int:
    """Insert a binding into _ext_bindings. No-op if already present (PK conflict)."""
    conn = _open_connection(mirror_home)
    try:
        conn.execute(
            "INSERT OR IGNORE INTO _ext_bindings "
            "(extension_id, capability_id, target_kind, target_id, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (extension_id, capability_id, target_kind, target_id, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    label = f"{target_kind}/{target_id}" if target_id else target_kind
    print(f"bound {extension_id}/{capability_id} -> {label}")
    return 0


def _cmd_unbind(
    *,
    mirror_home: Path,
    extension_id: str,
    capability_id: str,
    target_kind: str,
    target_id: str | None,
) -> int:
    conn = _open_connection(mirror_home)
    try:
        cursor = conn.execute(
            "DELETE FROM _ext_bindings WHERE "
            "extension_id = ? AND capability_id = ? AND "
            "target_kind = ? AND (target_id IS ? OR target_id = ?)",
            (extension_id, capability_id, target_kind, target_id, target_id),
        )
        removed = cursor.rowcount
        conn.commit()
    finally:
        conn.close()
    if removed:
        label = f"{target_kind}/{target_id}" if target_id else target_kind
        print(f"unbound {extension_id}/{capability_id} -> {label}")
    else:
        print("no matching binding")
    return 0


def _cmd_bindings(*, mirror_home: Path, extension_id: str) -> int:
    conn = _open_connection(mirror_home)
    try:
        rows = conn.execute(
            "SELECT capability_id, target_kind, target_id, created_at "
            "FROM _ext_bindings WHERE extension_id = ? "
            "ORDER BY capability_id, target_kind, target_id",
            (extension_id,),
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        print(f"no bindings for extension/{extension_id}")
        return 0
    print(f"=== bindings for extension/{extension_id} ===")
    for row in rows:
        target = row["target_id"] or "(global)"
        print(f"  {row['capability_id']} -> {row['target_kind']}/{target}")
    return 0


def _cmd_migrate(*, mirror_home: Path, extension_id: str) -> int:
    """Re-run pending migrations for an installed extension."""
    ext_dir = _installed_extension_dir(mirror_home, extension_id)
    if not ext_dir.exists():
        print(f"extension not installed: {ext_dir}")
        return 1
    migrations_dir = ext_dir / "migrations"
    conn = _open_connection(mirror_home)
    try:
        from memory.extensions.migrations import run_migrations

        applied = run_migrations(conn, extension_id=extension_id, migrations_dir=migrations_dir)
    except ExtensionError as exc:
        print(str(exc))
        return 1
    finally:
        conn.close()
    print(f"applied {applied} migration(s) for extension/{extension_id}")
    return 0


# --- Extension subcommand dispatch ----------------------------------------


def _dispatch_subcommand(
    *,
    mirror_home: Path,
    extension_id: str,
    subcommand: str,
    rest: list[str],
) -> int:
    ext_dir = _installed_extension_dir(mirror_home, extension_id)
    if not ext_dir.exists():
        print(f"extension not installed: {ext_dir}")
        return 1

    conn = _open_connection(mirror_home)
    try:
        try:
            # reload=True: each CLI invocation gets a fresh API bound to
            # the current connection. The loader cache is designed for
            # in-process repeated dispatches (e.g. Mirror Mode assembling
            # several providers at once), not for cross-invocation use
            # where each call opens and closes its own sqlite handle.
            api = load_extension(ext_dir, connection=conn, reload=True)
        except ExtensionError as exc:
            print(str(exc))
            return 1

        if subcommand in {"--help", "-h", "help"}:
            return _print_subcommand_help(extension_id, api)

        handler = api.cli_registry.get(subcommand)
        if handler is None:
            print(f"unknown subcommand '{subcommand}' for extension/{extension_id}")
            _print_subcommand_help(extension_id, api)
            return 1

        try:
            return int(handler(api, rest))
        except ExtensionError as exc:
            print(str(exc))
            return 1
    finally:
        conn.close()


def _print_subcommand_help(extension_id: str, api) -> int:
    print(f"=== subcommands of extension/{extension_id} ===")
    if not api.cli_registry:
        print("  (none registered)")
        return 0
    for name in sorted(api.cli_registry):
        handler = api.cli_registry[name]
        summary = (handler.__doc__ or "").strip().splitlines()[0] if handler.__doc__ else ""
        if summary:
            print(f"  {name} — {summary}")
        else:
            print(f"  {name}")
    return 0


# --- Top-level argument parsing -------------------------------------------


def cmd_ext(args: list[str]) -> int:
    """python -m memory ext [list | <id> <subcommand> [...] | <id> bind|unbind|bindings|migrate ...]"""
    args, flags = _split_global_flags(args)
    if not args:
        _print_top_help()
        return 1

    head = args[0]
    rest = args[1:]
    mirror_home = _resolve_home(flags)

    if head == "list":
        return _cmd_list(mirror_home)

    if head in {"--help", "-h", "help"}:
        _print_top_help()
        return 0

    # Anything else is treated as <extension_id> <verb> [args...]
    extension_id = head
    if not rest:
        # `python -m memory ext <id>` lists the extension's subcommands.
        return _dispatch_subcommand(
            mirror_home=mirror_home,
            extension_id=extension_id,
            subcommand="--help",
            rest=[],
        )

    verb = rest[0]
    tail = rest[1:]

    if verb == "bind":
        return _handle_binding(
            mirror_home=mirror_home,
            extension_id=extension_id,
            tail=tail,
            action="bind",
        )
    if verb == "unbind":
        return _handle_binding(
            mirror_home=mirror_home,
            extension_id=extension_id,
            tail=tail,
            action="unbind",
        )
    if verb == "bindings":
        return _cmd_bindings(mirror_home=mirror_home, extension_id=extension_id)
    if verb == "migrate":
        return _cmd_migrate(mirror_home=mirror_home, extension_id=extension_id)

    return _dispatch_subcommand(
        mirror_home=mirror_home,
        extension_id=extension_id,
        subcommand=verb,
        rest=tail,
    )


def _handle_binding(
    *,
    mirror_home: Path,
    extension_id: str,
    tail: list[str],
    action: str,
) -> int:
    """Parse ``<capability> --persona <id>`` / ``--journey <id>`` / ``--global``."""
    if not tail:
        print(
            f"usage: python -m memory ext {extension_id} {action} <capability> "
            f"(--persona <id> | --journey <id> | --global)"
        )
        return 1
    capability = tail[0]
    target_kind: str | None = None
    target_id: str | None = None
    i = 1
    while i < len(tail):
        if tail[i] == "--persona" and i + 1 < len(tail):
            target_kind, target_id = "persona", tail[i + 1]
            i += 2
        elif tail[i] == "--journey" and i + 1 < len(tail):
            target_kind, target_id = "journey", tail[i + 1]
            i += 2
        elif tail[i] == "--global":
            target_kind, target_id = "global", None
            i += 1
        else:
            print(f"unrecognised argument '{tail[i]}'")
            return 1

    if target_kind is None:
        print("missing target: pass --persona <id>, --journey <id>, or --global")
        return 1

    if action == "bind":
        return _cmd_bind(
            mirror_home=mirror_home,
            extension_id=extension_id,
            capability_id=capability,
            target_kind=target_kind,
            target_id=target_id,
        )
    return _cmd_unbind(
        mirror_home=mirror_home,
        extension_id=extension_id,
        capability_id=capability,
        target_kind=target_kind,
        target_id=target_id,
    )


def _print_top_help() -> None:
    print(
        "Usage:\n"
        "  python -m memory ext list\n"
        "  python -m memory ext <id> [--help]\n"
        "  python -m memory ext <id> <subcommand> [args...]\n"
        "  python -m memory ext <id> bind <capability> (--persona <id> | --journey <id> | --global)\n"
        "  python -m memory ext <id> unbind <capability> (--persona <id> | --journey <id> | --global)\n"
        "  python -m memory ext <id> bindings\n"
        "  python -m memory ext <id> migrate"
    )


def main(args: list[str]) -> int:
    return cmd_ext(args)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(cmd_ext(sys.argv[1:]))
