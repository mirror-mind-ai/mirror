[< Parent](../index.md)

# CV22.DS9.US2 — The seven read/context tools

**Status:** 🟡 Planned — pulled 2026-09-17
**Type:** User Story
**Depends on:** CV22.DS9.US1 (registry seam, golden generator pattern, `wire.ts`, threat
model); DS8 (the live embedding transport behind `search_memories` and `mirror_context`);
the DS2/DS5/DS7 capabilities the tools wrap

---

> **Parity scope (Navigator decision, 2026-09-17 — plan D10).** Payloads are byte-identical
> **except** the score field of the two ranked `search_memories` query cases, which is graded
> to 1e-6. Python's `np.dot` accumulates in float32 and JavaScript has no float32 arithmetic,
> so identical vectors diverge at the ~8th significant digit (measured: 3.6e-08). Order and
> every other field stay exact. Any later claim that this surface is byte-identical to
> Python — including DS10's deletion rationale — carries this exception.

## Outcome

Every `tools/call` the Python MCP server answers is answered by TypeScript with a
byte-identical payload (within the scope above): the seven handlers in `src/memory/mcp/tools.py` are ported over the
TS capabilities that already exist, graded on a golden generated from the real Python
handlers against a seeded fixture database, with the two embedding-crossing tools under the
replay transport. Nothing is routed — `main.ts` stays unreferenced until TS2.

## Story Statement

As the model behind an MCP client,
I want `mirror_context`, `list_journeys`, `journey_status`, `search_memories`,
`list_conversations`, `recall_conversation`, and `detect_persona` to return exactly the text
the Python server returns for the same database,
so that nothing I have learned to read from those payloads changes when the server changes
language.

## Acceptance Behavior

```text
Given a fixture database seeded with journeys (active/paused/completed, with
      metadata and descriptions over 150 chars), memories across types, layers,
      journeys, and tags (JSON-string tags, null fields, non-ASCII content,
      deterministic embeddings), conversations with messages, and personas
      whose routing yields whole-number scores
When  each of the seven tools is called through the TS registry with the
      golden's argument sets — including no-argument, filter-only, unknown
      slug/prefix, limit=0, and non-ASCII query cases
Then  the returned text equals the Python handler's text byte for byte,
      including indent=2 layout, unescaped Unicode, `2.0` for whole floats,
      and `null` for None
And   search_memories with a query reinforces nothing (no access rows
      written), while mirror_context reinforces exactly what the CLI's
      load does — asserted by database diff on a copy
And   the framing transcript from US1, extended with tool calls, produces an
      empty diff between the two spawned servers on the fixture database
And   no route, manifest edit, or launcher exists
```

## Scope

- `ts/src/mcp/payload.ts` — Python `json.dumps(indent=2, ensure_ascii=False, default=str)`
  semantics with float-ness declared per field.
- `ts/src/mcp/tools/*.ts` — seven handlers; two small read models ported where TS has only a
  renderer (`list_journeys` dicts, `journey_status` dict).
- `ts/parity/generate_mcp_tools_golden.py` + `ts/test/goldens/mcp-tools.golden.json` +
  fixture seeding, registered in the determinism gate.
- Decision D1's Python fix to `journey_status`, if the Navigator takes it, with a conscious
  oracle re-baseline in the same commit.

## Out Of Scope

- Argument validation, limit caps, rate or budget guards (TS1).
- The manifest, launcher, `MIRROR_TS_MCP` (TS2).
- Any new tool, write tool, or annotation.
- Extension context providers' own output (TS2's contract; asserted empty in the golden).

## Validation

- `npm run typecheck && npm run lint && npm test` in `ts/`; determinism gate; oracle drift.
- Navigator route in the [Test Guide](test-guide.md): the two-engine byte diff on the
  fixture database, plus a redacted real-database-copy probe for the deterministic tools.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
