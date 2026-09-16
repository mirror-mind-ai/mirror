"""Temporary host for legacy Python extensions: two request kinds, one bridge.

This is compatibility-only transition code owned by CV22.DS7.TS2 and CV22.DS7.TS4,
with a hard removal gate in CV22.DS10.

``mirror-context-v1`` (TS2) invokes one explicit context provider; binding
selection, ordering, context composition, and the complete ``mirror load`` route
stay in TS.

``mirror-cli-v1`` (TS4, Navigator decision D1 on 2026-09-16) runs one extension
subcommand registered through ``api.register_cli``. The TypeScript dispatcher
owns everything it can decide by itself -- argv splitting, the built-in verbs,
the help guard that describes without executing, the installed check, and the
exit code -- and reaches here only for the part that needs Python: importing the
extension and calling its handler.

One host, one deletion gate. An extension that declares a language-neutral
command runtime never arrives here, which is what makes the gate reachable.

The two modes differ in ONE deliberate way: the context mode redirects the
provider's streams (its text is a payload inside a protocol envelope), while the
command mode inherits them (a command's streams ARE its product).
"""

from __future__ import annotations

import io
import json
import re
import sqlite3
import sys
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

from memory.extensions.api import ContextRequest
from memory.extensions.loader import load_extension

_PROTOCOL = "mirror-context-v1"
_CLI_PROTOCOL = "mirror-cli-v1"
_EXTENSION_ID = re.compile(r"^[a-z][a-z0-9-]*$")


def _record(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("request must be an object")
    return value


def _required_string(request: dict[str, Any], key: str) -> str:
    value = request.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"missing {key}")
    return value


def _optional_string(request: dict[str, Any], key: str) -> str | None:
    value = request.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"invalid {key}")
    return value


def invoke(request_value: object) -> str | None:
    """Invoke exactly one named legacy provider from a validated request."""
    request = _record(request_value)
    if request.get("protocol") != _PROTOCOL:
        raise ValueError("unsupported protocol")
    extension_id = _required_string(request, "extension_id")
    capability_id = _required_string(request, "capability_id")
    if not _EXTENSION_ID.fullmatch(extension_id):
        raise ValueError("invalid extension id")

    mirror_home = Path(_required_string(request, "extension_root")).resolve().parent.parent
    extension_root = Path(_required_string(request, "extension_root")).resolve()
    expected_root = (mirror_home / "extensions" / extension_id).resolve()
    if extension_root != expected_root or not extension_root.is_dir():
        raise ValueError("extension root mismatch")

    database_path = Path(_required_string(request, "database_path")).resolve()
    if database_path.parent != mirror_home or not database_path.is_file():
        raise ValueError("database path mismatch")

    connection = sqlite3.connect(database_path, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        # Extension output is payload-bearing and must never corrupt the protocol
        # envelope or escape into the TS front-door diagnostics.
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            api = load_extension(extension_root, connection=connection, reload=True)
            provider = api.context_registry.get(capability_id)
            if provider is None:
                raise ValueError("unknown capability")
            context = ContextRequest(
                persona_id=_optional_string(request, "persona_id"),
                journey_id=_optional_string(request, "journey_id"),
                user=_required_string(request, "user") if request.get("user") else "",
                query=_optional_string(request, "query"),
                binding_kind=_required_string(request, "binding_kind"),
                binding_target=_optional_string(request, "binding_target"),
            )
            text = provider(api, context)
        return None if not text else str(text)
    finally:
        connection.close()


def _validated_cli_request(request_value: object) -> dict[str, Any]:
    """Validate a ``mirror-cli-v1`` request without running anything yet.

    Separated from execution on purpose: a malformed request is the host's
    failure and is reported as one line, while anything the extension's own
    handler raises must escape exactly as ``python -m memory ext`` lets it
    escape. Catching both in one ``try`` would turn every extension traceback
    into an indistinguishable host error.
    """
    from memory.config import db_path_for_home

    request = _record(request_value)
    if request.get("protocol") != _CLI_PROTOCOL:
        raise ValueError("unsupported protocol")
    extension_id = _required_string(request, "extension_id")
    if not _EXTENSION_ID.fullmatch(extension_id):
        raise ValueError("invalid extension id")
    subcommand = _required_string(request, "subcommand")

    argv = request.get("argv", [])
    if not isinstance(argv, list) or not all(isinstance(item, str) for item in argv):
        raise ValueError("invalid argv")

    # The home is validated RESOLVED and dispatched RAW. Resolving what the
    # dispatcher receives would rewrite every path it prints -- on macOS a home
    # under /var is really /private/var -- and those strings are graded output,
    # not diagnostics.
    mirror_home = Path(_required_string(request, "mirror_home"))
    resolved_home = mirror_home.resolve()
    extension_root = Path(_required_string(request, "extension_root")).resolve()
    if extension_root != (resolved_home / "extensions" / extension_id).resolve():
        raise ValueError("extension root mismatch")
    if not extension_root.is_dir():
        raise ValueError("extension root mismatch")

    # One database per (mirror home, environment). TS resolves the path and
    # Python resolves it again; if they disagree the handler would write to a
    # file the front door never opened, so the host fails closed instead.
    database_path = Path(_required_string(request, "database_path")).resolve()
    if database_path != db_path_for_home(resolved_home).resolve():
        raise ValueError("database path mismatch")

    return {
        "mirror_home": mirror_home,
        "extension_id": extension_id,
        "subcommand": subcommand,
        "rest": list(argv),
    }


def invoke_cli(request_value: object) -> int:
    """Run one registered extension subcommand and return its exit code.

    Streams are inherited, not captured: the handler prints straight to the
    caller. ``--help`` is the listing request, which is how the Python
    dispatcher already models ``ext <id>`` with no subcommand.
    """
    from memory.cli.ext import _dispatch_subcommand

    return _dispatch_subcommand(**_validated_cli_request(request_value))


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
    except Exception:
        sys.stderr.write("legacy extension host received an unreadable request\n")
        return 1

    if isinstance(request, dict) and request.get("protocol") == _CLI_PROTOCOL:
        try:
            call = _validated_cli_request(request)
        except Exception:
            # Payload-free: the request carries extension argv.
            sys.stderr.write("legacy extension command host rejected the request\n")
            return 1
        # Outside the try: a handler's own traceback belongs to the user, and
        # this host is the only place that can still reproduce it byte for byte.
        from memory.cli.ext import _dispatch_subcommand

        return _dispatch_subcommand(**call)

    try:
        text = invoke(request)
        sys.stdout.write(json.dumps({"protocol": _PROTOCOL, "text": text}, ensure_ascii=False))
        sys.stdout.write("\n")
        return 0
    except Exception:
        # Deliberately payload-free. TS records only the failure category.
        sys.stderr.write("legacy extension context provider failed\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
