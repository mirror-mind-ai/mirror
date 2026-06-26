[< Story](index.md)

# Plan — CV21.E2.S2 Mirror MCP server

## Design

A small, dependency-free MCP server in the Python core, exposed as
`python -m memory mcp`.

```text
src/memory/mcp/
  __init__.py
  tools.py     # Tool registry: name, description, JSON Schema, handler(client, args) -> str
  server.py    # stdio JSON-RPC 2.0 loop + method dispatch + serverInfo
```

### Transport and protocol (hand-rolled, zero deps)

MCP stdio is newline-delimited JSON-RPC 2.0 (one message per line, no embedded
newlines). The server:

- reads a line from stdin, parses one JSON-RPC message, dispatches, writes one
  JSON line to stdout; **all diagnostics go to stderr** (stdout must stay pure);
- handles: `initialize` (echo the client's `protocolVersion`, advertise
  `capabilities.tools`, return `serverInfo` with name + version),
  `notifications/initialized` (no reply), `tools/list`, `tools/call`, `ping`;
- returns JSON-RPC errors for malformed messages (`-32700`), unknown methods
  (`-32601`), and tool errors (`tools/call` result with `isError: true`).

`server.py` is structured so the **dispatch is a pure function**
`handle_message(message, client) -> response | None`, unit-testable without real
stdio; the stdio loop is a thin wrapper around it.

### Tools (read + on-demand context)

Each tool is a `Tool(name, description, input_schema, handler)`. Handlers receive
a shared `MemoryClient` and the call arguments, and return text content. Mapping
to existing façade methods (no new service code):

| Tool | Façade call |
|------|-------------|
| `mirror_context` | `mem.load_mirror_context(persona, journey, query)` — pure builder, **no** `load()` side effects |
| `list_journeys` | `mem.list_active_journeys()` |
| `journey_status` | `mem.get_journey_status(slug)` |
| `search_memories` | `mem.search(query, ...)` / `get_by_*` |
| `list_conversations` | `mem.conversations.list_recent(...)` |
| `recall_conversation` | `mem.conversations.find_by_id_prefix(id)` + `mem.store.get_messages(...)` |
| `detect_persona` | `mem.identity.detect_persona(query)` |

`mirror_context` deliberately calls the side-effect-free `load_mirror_context`,
**not** `skills.mirror.load` (which mutates mirror state / sticky defaults / mode
lifecycle). A read tool must not activate Mirror Mode.

List/search tools return compact JSON text (agent-friendly); `mirror_context`
returns the identity block verbatim.

### Plugin wiring

The generator adds an `mcpServers` block to the plugin manifest:

```json
"mcpServers": {
  "mirror-mind": { "command": "python3", "args": ["-m", "memory", "mcp"] }
}
```

`command: python3 -m memory mcp` follows the D5 installed-`memory` contract, like
the hooks. Both `mcpServers`-in-manifest and a separate `.mcp.json` validate;
manifest is chosen so the generator owns it and the drift guard covers it.

## Implementation steps

1. TDD: tool tests (each handler against an isolated temp-DB `MemoryClient`) and
   protocol tests (`handle_message` for initialize / tools-list / tools-call /
   unknown / malformed).
2. `tools.py` — registry + handlers over the façade.
3. `server.py` — `handle_message` dispatch + stdio loop.
4. Wire `mcp` into `__main__.py` (USAGE + dispatch).
5. Extend the generator's manifest with `mcpServers`; regenerate; drift guard
   green; `claude plugin validate` passes.
6. `scripts/smoke_mirror_mcp.sh` — spawn the server, drive a real stdio
   round-trip, assert, isolate the DB, production-leak guard.

## Risks

- **Stdout purity.** Any stray print to stdout corrupts the JSON-RPC stream.
  Mitigation: route all logging to stderr; the smoke parses stdout strictly.
- **Protocol compliance (the Option B cost).** We own the handshake. Mitigation:
  keep to the documented minimal tools-only surface; echo the client's
  `protocolVersion`; test the round-trip; validate against a real client (Claude)
  in the manual route.
- **`mirror_context` side effects.** Must use `load_mirror_context`, not `load`.
  A test asserts mirror state is unchanged after the tool runs.
- **Scope creep into writes / S3 / S4.** Read surface only.

## Verification

See [test-guide.md](test-guide.md): tool + protocol unit tests, full suite,
`claude plugin validate`, drift guard, and the isolated stdio smoke.
