#!/usr/bin/env bash
set -euo pipefail

# CV21.E2.S2 — Mirror MCP server stdio smoke test.
#
# Drives a real stdio JSON-RPC round-trip against `python -m memory mcp`:
#   initialize -> notifications/initialized -> tools/list -> tools/call,
# asserts the protocol responses, and proves the run leaks nothing into any
# production database.
#
# Plugin contract (CV21): the server is launched as a bare `python3 -m memory
# mcp`, assuming `memory` is installed. In the dev repo it is not pip-installed,
# so this harness puts the project venv interpreter first on PATH.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "❌ Smoke test FAILED: $1"
  exit 1
}

shopt -s nullglob
PROD_DBS=("$HOME"/.mirror-minds/*/memory.db)

SANDBOX="$(mktemp -d)"
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

export MEMORY_ENV="production"
export MEMORY_DIR="$SANDBOX"
export DB_PATH="$SANDBOX/memory.db"
export DB_BACKUP_PATH="$SANDBOX/backups"
unset MIRROR_HOME MIRROR_USER 2>/dev/null || true

VENV_BIN="$(cd "$REPO_ROOT" && uv run python -c 'import os,sys; print(os.path.dirname(sys.executable))')"
export PATH="$VENV_BIN:$PATH"
export PYTHONPATH="$REPO_ROOT/src${PYTHONPATH:+:$PYTHONPATH}"

MARKER="mcp-smoke-$$"
echo "Isolated DB: $DB_PATH"

# Drive a full round-trip; capture stdout (pure JSON-RPC) to a file.
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"'"$MARKER"'","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_journeys","arguments":{}}}' \
  | python3 -m memory mcp 2>/dev/null > "$SANDBOX/out.jsonl"

# Assert the protocol responses with a strict parser. The captured output is read
# from a file because a heredoc script would otherwise claim stdin.
python3 - "$SANDBOX/out.jsonl" <<'PY' || fail "protocol assertions"
import json, sys

lines = [json.loads(line) for line in open(sys.argv[1]) if line.strip()]
by_id = {m.get("id"): m for m in lines if "id" in m}

init = by_id.get(1)
assert init and "tools" in init["result"]["capabilities"], "initialize missing tools capability"
assert init["result"]["serverInfo"]["name"] == "mirror-mind", "wrong serverInfo"

tools = by_id.get(2)
names = {t["name"] for t in tools["result"]["tools"]}
for required in ("mirror_context", "list_journeys", "search_memories", "recall_conversation"):
    assert required in names, f"tools/list missing {required}"

call = by_id.get(3)
assert call["result"]["isError"] is False, "tools/call reported error"
assert call["result"]["content"][0]["type"] == "text", "tools/call returned no text content"
print(f"protocol OK: {len(names)} tools advertised")
PY

echo "✓ stdio round-trip: initialize / tools/list / tools/call"

# Production guard: the run's unique marker must never appear in production.
for db in "${PROD_DBS[@]}"; do
  leaked="$(sqlite3 "$db" "SELECT count(*) FROM messages WHERE content LIKE '%$MARKER%';" 2>/dev/null || echo ERR)"
  [ "$leaked" = "0" ] || fail "smoke marker leaked into production: $db ($leaked)"
done
echo "✓ no smoke data leaked into production (${#PROD_DBS[@]} db checked)"

echo "✅ Smoke test PASSED"
