#!/usr/bin/env bash
set -euo pipefail

# CV21.E2.S2 — Mirror MCP server stdio smoke test.
#
# Drives a real stdio JSON-RPC round-trip against the MCP server the packaged
# plugin launches (`plugins/mirror-mind/mcp/launch.sh`):
#   initialize -> notifications/initialized -> tools/list -> tools/call,
# asserts the protocol responses, and proves the run leaks nothing into any
# production database.
#
# The server is TypeScript since CV22.DS9, and the launcher lost its Python
# branch at CV22.DS10.TS5 plateau 1; this smoke drove the Python server until
# TS5 plateau 3 deleted it. It runs the launcher from THIS checkout --
# resolving the server from an installed plugin is CV22.DS10.US3's npm `bin`.

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


MARKER="mcp-smoke-$$"
echo "Isolated DB: $DB_PATH"

# Drive a full round-trip; capture stdout (pure JSON-RPC) to a file.
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"'"$MARKER"'","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_journeys","arguments":{}}}' \
  | bash "$REPO_ROOT/plugins/mirror-mind/mcp/launch.sh" 2>/dev/null > "$SANDBOX/out.jsonl"

# Assert the protocol responses with a strict parser: every line must be JSON.
node - "$SANDBOX/out.jsonl" <<'JS' || fail "protocol assertions"
const { readFileSync } = require("node:fs");
const assert = require("node:assert/strict");

const lines = readFileSync(process.argv[2], "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const byId = new Map(lines.filter((m) => "id" in m).map((m) => [m.id, m]));

const init = byId.get(1);
assert.ok(init && "tools" in init.result.capabilities, "initialize missing tools capability");
assert.equal(init.result.serverInfo.name, "mirror-mind", "wrong serverInfo");

const names = new Set(byId.get(2).result.tools.map((tool) => tool.name));
for (const required of ["mirror_context", "list_journeys", "search_memories", "recall_conversation"]) {
  assert.ok(names.has(required), `tools/list missing ${required}`);
}

const call = byId.get(3);
assert.equal(call.result.isError, false, "tools/call reported error");
assert.equal(call.result.content[0].type, "text", "tools/call returned no text content");
console.log(`protocol OK: ${names.size} tools advertised`);
JS

echo "✓ stdio round-trip: initialize / tools/list / tools/call"

# Production guard: the run's unique marker must never appear in production.
# `${arr[@]+...}`: bash 3.2 -- macOS's /bin/bash -- treats an EMPTY array as
# unbound under `set -u`, and with the EXIT trap above the abort exits 0, so a
# machine with no production home skipped this check and still "passed".
for db in ${PROD_DBS[@]+"${PROD_DBS[@]}"}; do
  leaked="$(sqlite3 "$db" "SELECT count(*) FROM messages WHERE content LIKE '%$MARKER%';" 2>/dev/null || echo ERR)"
  [ "$leaked" = "0" ] || fail "smoke marker leaked into production: $db ($leaked)"
done
echo "✓ no smoke data leaked into production (${#PROD_DBS[@]} db checked)"

echo "✅ Smoke test PASSED"
