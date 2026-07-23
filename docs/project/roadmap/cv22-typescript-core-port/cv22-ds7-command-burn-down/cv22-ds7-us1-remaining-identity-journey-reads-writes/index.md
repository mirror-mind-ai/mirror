[< Parent](../index.md)

# CV22.DS7.US1 — Remaining identity/journey reads & writes

**Status:** 🟡 Planned
**Type:** User Story

---

## Outcome

The remaining **deterministic** identity/journey command surface is answered by the
TS core at ordered/behavioral parity, every routing flip invisible and revertible,
with the `kebab_slug` and DS6.US3 atomic `parent_journey` dual-write riders landed.

## Story Statement

As a Navigator dogfooding Mirror through Pi,
I want the remaining deterministic identity/journey reads and writes answered by
the TS core instead of the Python fallback,
So that the strangler burns down another command family with no user-visible change.

## Acceptance Behavior

```text
Given a copy of a real memory.db and committed synthetic goldens
When the Navigator runs each ported identity/journey read/write through the front door
Then the TS core answers with byte-exact rendered-surface and DB-state parity to Python
And identity edit / descriptor generate / conversation-lifecycle writes still fall back to Python
And every routing flip is invisible to the runtime and revertible with no data migration
```

## Scope

See [plan.md](plan.md) for the grounded surface map and slice sequence. In short:
Slice A (deterministic reads — `identity list/get`, `journey status`,
`list personas|journeys`, `inspect persona|extension|runtime-catalog`,
`descriptor list`, `recall`, `conversations` listing), Slice B (deterministic
writes — `journey update`, `seed`, `init`, backup-gated), Slice C (riders —
`kebab_slug`, atomic `parent_journey` dual-write).

## Out Of Scope

- `identity edit` (interactive `$EDITOR`) — kept on Python.
- `descriptor generate` (LLM) — kept on Python as the DS7↔DS8 live seam.
- Conversation Metadata Lifecycle writes (ES-001) — own slice; US1 ports the read.
- `list extensions|all`, `inspect llm-calls|embedding-provenance` — CV22.DS7.TS1.
- Live-provider cutover (DS8), MCP (DS9), Python deletion/rename/npm (DS10).
- Sibling DS7 stories US2–US8/TS1.

## Validation

- Committed synthetic goldens per read family + `kebab_slug`; DS4 copy-harness
  write parity for `journey update`/`seed`/`init`; atomicity/rollback test for the
  `parent_journey` dual-write; oracle-drift tripwire extended per ported oracle.
- Redacted real-DB-copy probe families for realism (never live).
- Per-family front-door E2E smoke before each routing flip (no user-visible change).

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
