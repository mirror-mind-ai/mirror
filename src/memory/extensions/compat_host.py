"""Temporary mirror-context-v1 host for legacy Python extension providers.

This is compatibility-only transition code owned by CV22.DS7.TS2 and has a hard
removal gate in CV22.DS10. It invokes one explicit provider; binding selection,
ordering, context composition, and the complete ``mirror load`` route stay in TS.
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


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
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
