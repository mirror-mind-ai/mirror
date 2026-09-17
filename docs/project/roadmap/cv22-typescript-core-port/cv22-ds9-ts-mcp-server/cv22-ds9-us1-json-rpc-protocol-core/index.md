[< Parent](../index.md)

# CV22.DS9.US1 — JSON-RPC protocol core

**Status:** 🟡 Planned — pulled 2026-09-17
**Type:** User Story
**Depends on:** nothing new — `resolveDbPath` (DS3), the DS6 TS-owned database, and the
DS9 package's decisions D1–D5 and flow unit

---

## Outcome

The Mirror MCP server's protocol layer — `handle_message` and the stdio framing loop — is
answered by TypeScript with exact parity to `src/memory/mcp/server.py`, graded on a committed
golden generated from the Python oracle and on a process-level stdio harness. The seven tools
are registered with byte-identical `tools/list` output but dispatch to stubs; wiring them to
the TS capabilities is US2. Nothing is routed: no manifest edit, no launcher, no flip.

This story also produces DS9's **threat model** as its Plan input, reviewed by the
security-engineer and ai-engineer lenses before implementation, so that US2, TS1, and TS2
inherit a written boundary instead of rediscovering one.

## Story Statement

As an MCP client (Claude today; Codex, Antigravity, and Grok Build when CV21 propagates the
plugin),
I want the Mirror server to answer `initialize`, `ping`, `tools/list`, and `tools/call`
exactly as the Python server does — same ids, same errors, same framing —
so that the TypeScript server can replace the Python one without a single client noticing
the language changed.

## Acceptance Behavior

```text
Given the committed golden of JSON-RPC request → response pairs generated from
      the Python handle_message, covering initialize (with and without a
      requested protocolVersion), notifications/initialized, ping, tools/list,
      tools/call for a known tool, an unknown tool, a tool that raises, unknown
      request methods, unknown notifications, a non-string method, and ids of
      0, "", null-present, and string
When  the TS dispatcher answers each request
Then  every response is deeply equal to the golden, including error codes
      (-32600, -32601, -32602), the isError result shape for tool failures,
      and the absence of a response for every notification
And   the process-level harness proves the framing: blank lines skipped, parse
      errors answered with id null and code -32700, non-object lines answered
      as Invalid Request, one JSON object per line flushed per response,
      stderr never carrying protocol bytes, and exit 0 on EOF
And   tools/list is byte-identical to the Python server's on the same
      database, so no client re-negotiates
And   the threat model exists as a written section of this plan, reviewed
And   no routing entry, manifest edit, or launcher exists
```

## Scope

- `ts/src/mcp/protocol.ts` — `handleMessage(message, tools)` as a pure function.
- `ts/src/mcp/registry.ts` — the seven tool declarations (name, description, `inputSchema`)
  byte-identical to Python's, each with a handler slot US2 fills; US1 handlers throw
  `NotImplemented` so `tools/call` can be graded for its error shape.
- `ts/src/mcp/serve.ts` — the stdio loop over `process.stdin`, with the Python framing rules.
- `ts/parity/generate_mcp_protocol_golden.py` and `ts/test/goldens/mcp-protocol.golden.json`,
  registered in the CI determinism gate.
- `src/memory/mcp/server.py` and `src/memory/mcp/tools.py` added to the oracle-drift baseline.
- The threat model, in `plan.md`.

## Out Of Scope

- Tool behavior (US2), guards and argument validation (TS1), the manifest and launcher (TS2).
- Any transport other than stdio.
- Any change to `src/memory/mcp/`.

## Validation

- `npm run typecheck && npm run lint && npm test` (golden + harness) in `ts/`.
- Determinism gate: `uv run python ts/parity/generate_mcp_protocol_golden.py` produces no diff.
- Navigator route in the [Test Guide](test-guide.md): pipe a fixed transcript into both
  servers and diff.

---

## Artifacts

- [Plan](plan.md) — carries the threat model
- [Test Guide](test-guide.md)
