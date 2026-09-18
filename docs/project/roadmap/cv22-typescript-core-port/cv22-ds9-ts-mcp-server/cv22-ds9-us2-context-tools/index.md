[< Parent](../index.md)

# CV22.DS9.US2 — The seven read/context tools

**Status:** ✅ Done — 2026-09-17 (Navigator validation accepted)
**Type:** User Story
**Depends on:** CV22.DS9.US1 (registry seam, golden generator pattern, `wire.ts`, threat
model); DS8 (the live embedding transport behind `search_memories` and `mirror_context`);
the DS2/DS5/DS7 capabilities the tools wrap

---

> **Parity scope (Navigator decision, 2026-09-17 — plan D10).** Payloads are byte-identical
> **except** the score field of the two ranked `search_memories` query cases, which is graded
> to 1e-6. Python's `np.dot` accumulates in float32 and JavaScript has no float32 arithmetic,
> so identical vectors diverge at the ~8th significant digit (measured: 3.6e-08). Stronger
> still: **Python disagrees with Python across machines** by ~3e-08 (CI versus the
> development laptop), because numpy's float32 accumulation is platform-dependent — the
> score was never a byte contract in any language. The golden records it rounded to six
> decimals. Order and every other field stay exact. Any later claim that this surface is byte-identical to
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

## What Was Delivered

`ts/src/mcp/`: `payload.ts` (one Python-JSON encoder at two widths, with the `PyFloat`
runtime marker), `readModels.ts` (the two read models TS lacked), `tools/deterministic.ts`
and `tools/providerCrossing.ts` (the seven handlers), `registry.ts`'s `wiredRegistry`, and a
`main.ts` that opens read-only. 81 tests under `ts/test/mcp/`.

Evidence: 28 golden cases, a fixture two-engine transcript diff (9 responses byte-identical),
and a read-only copy of the 50 MB production database where **12 of 12 tools agree** —
`mirror_context` at 19,113 bytes, `journey_status` at 14,439 — with all four row counts
unchanged. Eight mutations run, each expected to fail and each failing; the table is in the
[test guide](test-guide.md).

Two user-visible repairs landed on the way: `journey_status` stopped returning 3.2 MB of
Pydantic reprs and vector bytes (D1, fixed in Python first), and `memories --search` stopped
reinforcing the ranker, restoring the AI-12 behavior Python has had since July.

## Deferred Debt (Debt Review, 2026-09-17)

1. **Accepted scope, not debt:** D12 leaves agent-initiated searches uncounted as spend, so
   **TS2's database-open decision is a prerequisite for TS1's wallet guard**.
2. D10's 1e-6 score tolerance travels with every "byte-identical" claim about this surface,
   including DS10's deletion rationale.
3. Python's `list_journeys` docstring disagrees with its code (promises three fields,
   returns five). Ported as the code behaves.
4. `journey_status` with no slug is still the widest read here — 226 KB / ~57K tokens over
   21 journeys — a cap candidate for TS1.

Also captured during this story: **CR086** against RS010, for the root cause of the
`memories --search` defect — a baseline advance that absorbed an oracle change nobody ported.

---

## Artifacts

- [Plan](plan.md) — D1–D12, the corrected D6, and the scope amendment
- [Test Guide](test-guide.md) — evidence and the mutation table
- [Validation](validation.md) · [Review](review.md) · [Coherence](coherence.md)
