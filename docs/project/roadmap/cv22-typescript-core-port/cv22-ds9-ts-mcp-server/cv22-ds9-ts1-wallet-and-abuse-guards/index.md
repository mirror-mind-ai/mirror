[< Parent](../index.md)

# CV22.DS9.TS1 — Wallet and abuse guards

**Status:** 🟡 Planned — Plan drafted and panel-reviewed 2026-09-18, pending Navigator approval and **D2**, **D9**
**Type:** Technical Story
**Depends on:** CV22.DS9.TS2 (the ledger row this guard counts from; the launcher and its
`.env` path, which the guard gate and tunables ride on); CV22.DS9.US1 (the threat model,
whose item 3 this story implements; the `isError` result shape a refusal lands in);
CV22.DS9.US2 (the golden that records the `limit` quirks this story refuses)

---

> **No oracle.** US1, US2, and TS2 were ports: Python said what correct meant and byte
> equality proved it. Nothing in this story exists in Python. Every behaviour here is
> deliberate divergence — argued from the threat model, sized from measured spend, tested
> as behaviour, and revertible by one gate — and the Python golden keeps recording the
> oracle's behaviour for the same inputs so the divergence stays visible.

## Outcome

One agent cannot spend or extract without bound through the MCP server. A global rate
guard on the two embedding-crossing tools counts from the cross-process `llm_calls`
ledger, attributed to the MCP surface, so a second client or a user's own session close
neither bypasses nor trips it. Arguments are validated at the boundary and `limit` is
capped per tool. Refusals are agent-readable `isError` results: terminal for spend, a
corrected-retry invitation for arguments. `MIRROR_TS_MCP_GUARDS=0` restores TS2 exactly.
The plugin can be distributed beyond its author.

## Story Statement

As the owner of a mirror an agent can query through MCP,
I want an agent that loops on paid searches — because a document told it to, or because
it is stuck — to be stopped by the server with text it will obey, and an agent that asks
for a whole transcript with `limit: 0` to be told the bound,
so that the surface stays a read oracle with a ceiling, and the wallet behind it is mine.

## Acceptance Behavior

```text
Given the TS MCP server with guards on (default) and a database copy
When  an agent calls search_memories(query) or mirror_context(query)
Then  each call records one llm_calls row attributed to the MCP surface
And   the 31st paid call within 10 minutes is refused before any provider
      call, as an isError result whose text is terminal, and no row is
      written for the refusal
And   a second server process on the same database sees the same count
And   limit=0, negative, fractional, over-cap, and non-numeric limits are
      refused at the boundary with the bound named, while the Python golden
      still records the oracle's behaviour for the same arguments
And   with MIRROR_TS_MCP_GUARDS=0 the server behaves exactly as TS2 left it,
      recording and marker included
And   tools/list, every payload, and every sibling story are untouched
```

## Scope

- `ts/src/mcp/guards.ts` — pure `decideSpend`, ledger adapter, tunables from env.
- `ts/src/mcp/boundary.ts` — the wrapper `main.ts` installs around the wired registry:
  per-tool argument rules, spend decision for the two paid tools, refusal text.
- `ts/src/mirror/context.ts` — `mirror_context(query)` records its embedding through the
  same sink `search_memories` got in TS2; Python never did (an oracle finding, not a port).
- `ts/src/mcp/main.ts` — the `mcp` marker on the sink; the guard gate and tunables.
- `scripts/mcp_guard_probe.sh` — the Navigator's scripted steps on a fresh copy.
- Docs: `configuration.md` (gate, tunables, operator's view), `decisions.md`, US1's threat
  model (item 3 implemented; items 1–2 annotated).

## Out Of Scope

- Any change to `src/memory/mcp/` or the oracle baseline.
- A column, index, or migration on `llm_calls`.
- Capping or reshaping `journey_status` (D9 — a CR).
- Rate-limiting free reads; bounding extension providers' own outbound calls.
- A repeatable eval of agent obedience to the refusal text (named as a candidate).

## Validation

Four steps in [plan.md](plan.md) and [test-guide.md](test-guide.md): the two-engine diff
still empty; the guard probe on a fresh copy (30 allowed, the 31st refused, no row, one
stderr line); argument refusals and the gate-off revert; one Claude session on a fresh
copy with a pre-registered expectation and retries measured from the MCP log. E2E is
required — the refusal text is a hypothesis until a model reads it.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
