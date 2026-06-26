"""Protocol dispatch tests for the Mirror MCP server (CV21.E2.S2)."""

from __future__ import annotations

from typing import Any

from memory.mcp import server
from memory.mcp.tools import TOOLS


def _call(method: str, *, msg_id: Any = 1, params: dict | None = None, client: Any = None):
    message: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
    if msg_id is not None:
        message["id"] = msg_id
    if params is not None:
        message["params"] = params
    return server.handle_message(message, client)


def test_initialize_echoes_requested_protocol_version() -> None:
    resp = _call("initialize", params={"protocolVersion": "2025-03-26"})
    assert resp is not None
    assert resp["id"] == 1
    assert resp["result"]["protocolVersion"] == "2025-03-26"
    assert "tools" in resp["result"]["capabilities"]
    assert resp["result"]["serverInfo"]["name"] == "mirror-mind"


def test_initialize_defaults_protocol_version_when_absent() -> None:
    resp = _call("initialize", params={})
    assert resp is not None
    assert resp["result"]["protocolVersion"] == server.PROTOCOL_VERSION


def test_initialized_notification_has_no_response() -> None:
    assert _call("notifications/initialized", msg_id=None) is None


def test_ping_returns_empty_result() -> None:
    resp = _call("ping", msg_id=9)
    assert resp == {"jsonrpc": "2.0", "id": 9, "result": {}}


def test_tools_list_returns_every_tool_with_schema() -> None:
    resp = _call("tools/list", msg_id=2)
    assert resp is not None
    listed = resp["result"]["tools"]
    assert {t["name"] for t in listed} == {tool.name for tool in TOOLS}
    assert all("inputSchema" in t and "description" in t for t in listed)


def test_unknown_request_method_returns_method_not_found() -> None:
    resp = _call("does/not/exist", msg_id=3)
    assert resp is not None
    assert resp["error"]["code"] == -32601


def test_unknown_notification_is_ignored() -> None:
    assert _call("notifications/unknown", msg_id=None) is None


def test_tools_call_unknown_tool_is_invalid_params(mcp_client) -> None:
    resp = _call(
        "tools/call", msg_id=4, params={"name": "ghost", "arguments": {}}, client=mcp_client
    )
    assert resp is not None
    assert resp["error"]["code"] == -32602


def test_tools_call_returns_text_content(mcp_client) -> None:
    resp = _call(
        "tools/call", msg_id=5, params={"name": "list_journeys", "arguments": {}}, client=mcp_client
    )
    assert resp is not None
    assert resp["result"]["isError"] is False
    assert resp["result"]["content"][0]["type"] == "text"


def test_tool_error_is_returned_as_result_not_protocol_error(mcp_client) -> None:
    # Missing required argument -> ValueError -> isError result, not a JSON-RPC error.
    resp = _call(
        "tools/call",
        msg_id=6,
        params={"name": "recall_conversation", "arguments": {}},
        client=mcp_client,
    )
    assert resp is not None
    assert "error" not in resp
    assert resp["result"]["isError"] is True
    assert "Error" in resp["result"]["content"][0]["text"]
