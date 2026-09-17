"""Generate the committed MCP protocol golden (CV22.DS9.US1).

The Python side of the MCP protocol parity contract. Two oracles, one file:

1. **dispatch** — drives the REAL ``memory.mcp.server.handle_message`` over a
   case list covering every branch of the dispatcher: ``initialize`` with and
   without a requested ``protocolVersion``, the initialized notification,
   ``ping``, ``tools/list``, ``tools/call`` against a tool that returns and a
   tool that raises, an unknown tool, an unknown request method, an unknown
   notification, a non-string ``method``, and the id shapes a port loses to
   truthiness (``0``, ``""``, an explicitly present ``null``, and a string).

2. **framing** — spawns the REAL ``python -m memory mcp`` process with a fixed
   transcript on stdin and records stdout bytes, stderr, and the exit code.
   ``serve()`` has no test of its own on either side (it is guaranteed by
   reading today), so this is the first executable statement of the framing
   rules: blank lines skipped, parse errors answered with id ``null``, non-object
   lines answered as Invalid Request, one JSON object per line, nothing but
   responses on stdout, and exit 0 at EOF.

Determinism. Two runtime-dependent values are frozen rather than recorded:
``serverInfo.version`` (``importlib.metadata``, absent in a source checkout) is
patched to a literal, and the database is a fresh temporary file, so the
transcript never touches the developer's home. The dispatch cases need no
database at all -- ``initialize``, ``ping``, ``tools/list``, and the stub
handlers ignore the client -- so ``None`` is passed where the real server passes
a ``MemoryClient``.

Stub dispatch, real list. The stubs are installed in ``TOOLS_BY_NAME`` only,
never in ``TOOLS``: ``tools/call`` resolves through the former and ``tools/list``
serializes the latter, so the golden can exercise call dispatch without a
database while still recording the seven real tools' names, descriptions, and
``inputSchema`` byte-for-byte. Those bytes are the client contract US2 must not
disturb -- and, per the DS9 threat model, the absence of ``annotations`` in them
is a deliberate non-change: ``readOnlyHint`` would let clients skip the per-call
permission prompt, the only human gate on a read oracle over private memory.

Run:  uv run python ts/parity/generate_mcp_protocol_golden.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from memory.mcp import server
from memory.mcp.tools import TOOLS_BY_NAME, Tool

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
OUT_PATH = HERE.parent / "test" / "goldens" / "mcp-protocol.golden.json"
TRANSCRIPT_PATH = HERE.parent / "test" / "fixtures" / "mcp-framing.jsonl"

FROZEN_VERSION = "0.0.0-golden"

# Stub handlers: one that returns text, one that raises. Installed into the
# dispatch map only (see module docstring). The raising stub's message is part
# of the contract the golden records -- Python renders `f"Error: {exc}"`.
STUB_OK = Tool(
    "__stub_ok",
    "Stub tool that returns text.",
    {"type": "object", "properties": {}},
    lambda client, args: f"stub ok: {json.dumps(args, ensure_ascii=False, sort_keys=True)}",
)
STUB_RAISE = Tool(
    "__stub_raise",
    "Stub tool that raises.",
    {"type": "object", "properties": {}},
    lambda client, args: (_ for _ in ()).throw(ValueError("stub failure")),
)

# Every dispatch branch, plus the id shapes. `"id" in message` decides
# request-vs-notification in the oracle, so `id: 0`, `id: ""` and an explicitly
# present `id: null` are all REQUESTS and must be answered with that id echoed.
# A TypeScript port reaching for `||` or `??` on the id fails exactly here.
DISPATCH_CASES: tuple[tuple[str, dict[str, Any]], ...] = (
    (
        "initialize_echoes_requested_version",
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
    ),
    (
        "initialize_defaults_version_when_absent",
        {"jsonrpc": "2.0", "id": 2, "method": "initialize", "params": {}},
    ),
    (
        "initialize_defaults_version_when_not_a_string",
        {"jsonrpc": "2.0", "id": 3, "method": "initialize", "params": {"protocolVersion": 17}},
    ),
    (
        "initialize_without_params",
        {"jsonrpc": "2.0", "id": 4, "method": "initialize"},
    ),
    (
        "initialized_notification_has_no_response",
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
    ),
    ("ping", {"jsonrpc": "2.0", "id": 5, "method": "ping"}),
    ("tools_list_real_seven", {"jsonrpc": "2.0", "id": 6, "method": "tools/list"}),
    (
        "tools_call_returns_text",
        {
            "jsonrpc": "2.0",
            "id": 7,
            "method": "tools/call",
            "params": {"name": "__stub_ok", "arguments": {"b": 2, "a": 1}},
        },
    ),
    (
        "tools_call_without_arguments",
        {"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "__stub_ok"}},
    ),
    (
        "tools_call_non_object_arguments_passes_through",
        {
            "jsonrpc": "2.0",
            "id": 9,
            "method": "tools/call",
            "params": {"name": "__stub_ok", "arguments": [1, 2]},
        },
    ),
    (
        "tools_call_tool_error_is_result_not_protocol_error",
        {"jsonrpc": "2.0", "id": 10, "method": "tools/call", "params": {"name": "__stub_raise"}},
    ),
    (
        "tools_call_unknown_tool",
        {"jsonrpc": "2.0", "id": 11, "method": "tools/call", "params": {"name": "nope"}},
    ),
    (
        "tools_call_non_string_tool_name",
        {"jsonrpc": "2.0", "id": 12, "method": "tools/call", "params": {"name": 42}},
    ),
    (
        "tools_call_without_params",
        {"jsonrpc": "2.0", "id": 13, "method": "tools/call"},
    ),
    ("unknown_request_method", {"jsonrpc": "2.0", "id": 14, "method": "totally/unknown"}),
    ("unknown_notification_ignored", {"jsonrpc": "2.0", "method": "totally/unknown"}),
    ("non_string_method_request", {"jsonrpc": "2.0", "id": 15, "method": 99}),
    ("non_string_method_notification", {"jsonrpc": "2.0", "method": 99}),
    ("id_zero_is_a_request", {"jsonrpc": "2.0", "id": 0, "method": "ping"}),
    ("id_empty_string_is_a_request", {"jsonrpc": "2.0", "id": "", "method": "ping"}),
    ("id_explicit_null_is_a_request", {"jsonrpc": "2.0", "id": None, "method": "ping"}),
    ("id_string", {"jsonrpc": "2.0", "id": "abc-123", "method": "ping"}),
)

# Stdin for the spawned real server. Deliberately includes the shapes only the
# loop can produce: a blank line, a line that is not JSON, a line that is JSON
# but not an object, a notification (no response), and requests that need no
# database. Kept database-free so the transcript grades framing, not tools.
FRAMING_TRANSCRIPT: tuple[str, ...] = (
    "",
    "   ",
    "not json at all",
    "[1, 2, 3]",
    '"a bare string"',
    json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}),
    json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}),
    json.dumps({"jsonrpc": "2.0", "id": 2, "method": "ping"}),
    json.dumps({"jsonrpc": "2.0", "id": 0, "method": "ping"}),
    json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/list"}),
    json.dumps({"jsonrpc": "2.0", "id": 4, "method": "totally/unknown"}),
    json.dumps(
        {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "nope"}}
    ),
    # A unicode payload: Python writes with ensure_ascii=False, and Node's
    # JSON.stringify does not escape either -- pinned so a "safer" TS encoder
    # that escapes non-ASCII fails here instead of in a client.
    json.dumps(
        {"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "não-existe ✳"}},
        ensure_ascii=False,
    ),
)


def _dispatch_golden() -> list[dict[str, Any]]:
    original_version = server._server_version
    server._server_version = lambda: FROZEN_VERSION  # type: ignore[assignment]
    TOOLS_BY_NAME[STUB_OK.name] = STUB_OK
    TOOLS_BY_NAME[STUB_RAISE.name] = STUB_RAISE
    try:
        cases: list[dict[str, Any]] = []
        for name, message in DISPATCH_CASES:
            # The real server passes a MemoryClient; every case here reaches
            # either a stub (which ignores it) or a branch that never touches it.
            response = server.handle_message(message, None)  # type: ignore[arg-type]
            cases.append({"name": name, "request": message, "response": response})
        return cases
    finally:
        server._server_version = original_version  # type: ignore[assignment]
        del TOOLS_BY_NAME[STUB_OK.name]
        del TOOLS_BY_NAME[STUB_RAISE.name]


# The spawned server inherits the repo's `.env`, which sets MIRROR_USER. A
# MIRROR_HOME whose directory name differs from MIRROR_USER is a *conflict*,
# and `resolve_mirror_home` raises for it -- but `config` swallows that at import
# (`except ValueError: _RESOLVED_MIRROR_HOME = None`), so the process dies with
# "Mirror home is not configured" instead of naming the conflict. Measured while
# writing this generator; captured for Debt Review. Here the home directory is
# named after the user so the pair agrees.
GOLDEN_MIRROR_USER = "golden-mirror"


def _framing_golden(transcript: str) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        home = Path(tmp) / GOLDEN_MIRROR_USER
        home.mkdir()
        env = {
            **os.environ,
            "MIRROR_HOME": str(home),
            "MIRROR_USER": GOLDEN_MIRROR_USER,
            "MEMORY_ENV": "test",
        }
        env.pop("DB_PATH", None)
        completed = subprocess.run(
            [sys.executable, "-m", "memory", "mcp"],
            input=transcript,
            capture_output=True,
            text=True,
            cwd=REPO_ROOT,
            env=env,
            timeout=120,
        )
    stdout = completed.stdout
    # The spawned server reports its real installed version; freeze it so the
    # golden does not encode the generating machine's install state. The
    # initialize response is not line 0 -- the transcript opens with lines the
    # loop answers before it (blank, unparseable, non-object) -- so find it.
    real_version = next(
        parsed["result"]["serverInfo"]["version"]
        for parsed in (json.loads(line) for line in stdout.splitlines())
        if isinstance(parsed.get("result"), dict) and "serverInfo" in parsed["result"]
    )
    stdout = stdout.replace(f'"version": "{real_version}"', f'"version": "{FROZEN_VERSION}"')
    return {
        "stdout_lines": stdout.splitlines(),
        "stderr": completed.stderr,
        "exit_code": completed.returncode,
        "trailing_newline": stdout.endswith("\n"),
    }


def main() -> None:
    transcript = "\n".join(FRAMING_TRANSCRIPT) + "\n"
    golden = {
        "_comment": (
            "MCP protocol parity golden (CV22.DS9.US1). Generated from the real "
            "memory.mcp oracle by ts/parity/generate_mcp_protocol_golden.py. "
            "serverInfo.version is frozen to a literal on both sides; parity of the "
            "version MECHANISM is out of scope (DS10 owns versioning under npm)."
        ),
        "protocol_version": server.PROTOCOL_VERSION,
        "server_name": server.SERVER_NAME,
        "frozen_version": FROZEN_VERSION,
        "dispatch": _dispatch_golden(),
        "framing": _framing_golden(transcript),
    }
    TRANSCRIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    TRANSCRIPT_PATH.write_text(transcript, encoding="utf-8")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(golden, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)} ({len(golden['dispatch'])} dispatch cases)")
    print(f"wrote {TRANSCRIPT_PATH.relative_to(REPO_ROOT)} ({len(FRAMING_TRANSCRIPT)} lines)")


if __name__ == "__main__":
    main()
