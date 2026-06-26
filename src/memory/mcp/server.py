"""Mirror MCP server over stdio (hand-rolled JSON-RPC 2.0, zero dependencies).

Newline-delimited JSON-RPC on stdin/stdout; diagnostics go to stderr so the
stdout stream stays a pure protocol channel. The dispatch (`handle_message`) is a
pure function so it can be unit-tested without real stdio; `serve` is a thin loop
around it.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from memory import MemoryClient
from memory.mcp.tools import TOOLS, TOOLS_BY_NAME

PROTOCOL_VERSION = "2025-06-18"
SERVER_NAME = "mirror-mind"


def _server_version() -> str:
    try:
        from importlib.metadata import version

        return version("mirror")
    except Exception:
        return "0.0.0"


def _result(msg_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def handle_message(message: dict[str, Any], client: MemoryClient) -> dict[str, Any] | None:
    """Dispatch one JSON-RPC message. Returns a response, or None for notifications."""
    method = message.get("method")
    msg_id = message.get("id")
    is_notification = "id" not in message

    if not isinstance(method, str):
        return None if is_notification else _error(msg_id, -32600, "Invalid Request")

    if method == "initialize":
        params = message.get("params") or {}
        requested = params.get("protocolVersion")
        return _result(
            msg_id,
            {
                "protocolVersion": requested if isinstance(requested, str) else PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": SERVER_NAME, "version": _server_version()},
            },
        )

    if method == "notifications/initialized":
        return None

    if method == "ping":
        return _result(msg_id, {})

    if method == "tools/list":
        return _result(
            msg_id,
            {
                "tools": [
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.input_schema,
                    }
                    for tool in TOOLS
                ]
            },
        )

    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name")
        arguments = params.get("arguments") or {}
        tool = TOOLS_BY_NAME.get(name) if isinstance(name, str) else None
        if tool is None:
            return _error(msg_id, -32602, f"Unknown tool: {name}")
        try:
            text = tool.handler(client, arguments)
            return _result(msg_id, {"content": [{"type": "text", "text": text}], "isError": False})
        except Exception as exc:  # tool errors are returned as results, not protocol errors
            return _result(
                msg_id,
                {"content": [{"type": "text", "text": f"Error: {exc}"}], "isError": True},
            )

    # Unknown notifications are ignored; unknown requests get a JSON-RPC error.
    return None if is_notification else _error(msg_id, -32601, f"Method not found: {method}")


def _write(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def serve(client: MemoryClient | None = None) -> None:
    """Read newline-delimited JSON-RPC from stdin and answer on stdout."""
    client = client or MemoryClient()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            _write(_error(None, -32700, "Parse error"))
            continue
        if not isinstance(message, dict):
            _write(_error(None, -32600, "Invalid Request"))
            continue
        response = handle_message(message, client)
        if response is not None:
            _write(response)


def main(argv: list[str] | None = None) -> int:
    serve()
    return 0
