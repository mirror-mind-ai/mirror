[< Story](index.md)

# Test Guide — CV21.E2.S2 Mirror MCP server

## Automated validation

```bash
uv sync --extra dev
uv run pytest tests/unit/memory/mcp/ tests/unit/memory/plugins/ -q
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/memory
git diff --check
```

Expected result: all pass. MCP tests cover the protocol dispatch
(`initialize` / `tools/list` / `tools/call` / unknown / malformed) and each tool
handler against an isolated temp database, including an assertion that
`mirror_context` does not mutate mirror state.

## Plugin manifest + drift guard

```bash
uv run python scripts/build_claude_plugin.py --check
claude plugin validate plugins/mirror-mind
grep -A4 mcpServers plugins/mirror-mind/.claude-plugin/plugin.json
```

Expected result: drift guard in sync; validation passes; the manifest declares
the `mirror-mind` MCP server as `python3 -m memory mcp`.

## Isolated stdio protocol smoke

```bash
bash scripts/smoke_mirror_mcp.sh
```

The script:

1. Fully sandboxes the runtime (`DB_PATH`, `MEMORY_DIR`) and makes `memory`
   importable (installed-package stand-in).
2. Spawns `python -m memory mcp` and drives a real stdio round-trip:
   `initialize` → `notifications/initialized` → `tools/list` → `tools/call`.
3. Asserts the server advertises `tools` capability, lists the expected tools,
   and returns content for a tool call.
4. Asserts the run's unique data never appears in any production DB.

Expected result: `✅ Smoke test PASSED`, no smoke data leaked into production.

## Manual validation route (Navigator)

Register the server in an isolated MCP client config and confirm a tool call
returns real data, e.g. with the Claude CLI MCP client:

```bash
# read-only: list Mirror tools and call one against your real (or a copy) DB
claude mcp add mirror-mind -- python3 -m memory mcp     # in an isolated config
# then, in a session, ask the agent to call list_journeys / mirror_context
```

Known limitation: S2 ships read + on-demand-context tools only. Writes, the
plugin `statusLine` (S3), and the full reference smoke (S4) are out of scope.
