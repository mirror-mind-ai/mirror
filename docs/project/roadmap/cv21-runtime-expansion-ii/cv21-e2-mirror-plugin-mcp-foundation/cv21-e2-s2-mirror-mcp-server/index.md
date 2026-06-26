[< CV21.E2](../index.md)

# CV21.E2.S2 — Mirror MCP server

**Status:** ✅ Done
**Type:** Implementation
**User-visible outcome:** Mirror exposes a runtime-agnostic MCP server (`python -m memory mcp`) over stdio, carrying on-demand identity context and read tools. The canonical plugin declares it as an `mcpServers` entry, so any MCP-capable runtime can pull Mirror context and inspect Mirror state through standard tool calls.

---

## Context

E1 proved MCP is portable but **pull-based**: it carries the command surface and
on-demand context, not automatic per-turn injection (that stays in hooks). E1
also chose **converge** with a thin, dependency-light footprint. S2 builds the
server as a **zero-dependency, hand-rolled stdio JSON-RPC server** (decision D1
Option B) rather than pulling the official SDK's 18-package tree into a
deliberately lean local-first project.

Tools call the `MemoryClient` façade **in-process** (layer model: `mcp →
services`, like `web → surfaces → services`) — no shelling out to the CLI.

---

## Scope

- A minimal MCP-over-stdio JSON-RPC 2.0 server: `initialize`, `notifications/initialized`,
  `tools/list`, `tools/call`, `ping`; newline-delimited JSON on stdout, logs on stderr.
- A `python -m memory mcp` subcommand.
- Read + on-demand-context tools, calling `MemoryClient` in-process:
  - `mirror_context(query, persona?, journey?)` — side-effect-free identity context
  - `list_journeys()`, `journey_status(slug?)`
  - `search_memories(query, type?, layer?, journey?, limit?)`
  - `list_conversations(limit?, journey?, persona?)`, `recall_conversation(id, limit?)`
  - `detect_persona(query)`
- An `mcpServers` entry in the generated plugin manifest so the canonical package
  carries the server.

---

## Non-goals

- No write/mutation tools (journal, mode, soul apply, identity, consolidate/shadow
  apply, runtime update, seed) — a later story with its own consent semantics.
- No automatic per-turn Mirror Mode injection through MCP (E1: impossible; stays in hooks).
- No HTTP/SSE transport, no OAuth — stdio only.
- No official `mcp` SDK dependency.
- No `statusLine` (S3) and no full reference smoke (S4).

---

## Acceptance Criteria

- `python -m memory mcp` speaks MCP over stdio: a client `initialize` →
  `tools/list` → `tools/call` round-trip succeeds.
- `mirror_context` returns identity context **without** mutating mirror state,
  sticky defaults, or the operating-mode lifecycle.
- Each read tool returns useful structured text from the `MemoryClient` façade.
- The plugin manifest declares the `mcpServers` entry; `claude plugin validate`
  passes and the drift guard stays green.
- An isolated stdio protocol smoke passes and leaves the production DB un-leaked.

---

## See also

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Refactoring](refactoring.md)
