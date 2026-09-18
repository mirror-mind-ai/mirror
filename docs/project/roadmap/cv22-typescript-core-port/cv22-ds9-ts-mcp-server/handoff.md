[< CV22.DS9](index.md)

# CV22.DS9 — Handoff

**Written 2026-09-18, at the close of US2.** Addressed to the next session and to the
Mirror that loads this journey next, per the
[collaboration strategy](../collaboration-strategy.md)'s plateau rule.

---

## What is true now

DS9 is **2/4**. The MCP protocol and all seven tools answer from TypeScript, proven on a
fixture and on a read-only copy of the 50 MB production database where **12 of 12 tools
produce identical SHA-256** and neither engine writes a row.

**Nothing is routed.** `ts/src/mcp/main.ts` is referenced by nothing; the plugin manifest
still launches `python3 -m memory mcp`, and Claude — the only runtime consuming that
manifest today — is unaffected. The product has not changed.

Two user-visible repairs did land on the way, both in Python, both deliberate:

- `journey_status` no longer returns 3.2 MB of Pydantic reprs and embedding bytes on a
  no-slug call (226 KB now). It was unusable in exactly the case it was written for.
- `memories --search` no longer reinforces the ranker, restoring the AI-12 behavior Python
  has had since 2026-07-16 and TypeScript never had.

## What to do next, and why it is not what the plan said

**Pull CV22.DS9.TS2, not TS1.** The original sequence was protocol → tools → guards → flip.
US2's **D12** inverted the tail: the server opens the database **read-only**, so an
agent-initiated search records **no `llm_calls` row**. TS1's wallet guard counts spend from
that ledger. It cannot guard what the server does not record, so TS2 goes first.

TS2 therefore owns two things, not one:

1. **The database-open decision.** Three options, all measured:
   - read-only (today) — strongest posture, matches the threat model's read-oracle framing,
     but no spend accounting and TS1 stays blocked;
   - backup-gated writable, as the front door does for `memories --search` — keeps DS4
     discipline, costs **399 ms and a 49.3 MB snapshot per client launch** on the owner's
     database, paid every time a client spawns the process;
   - ledger-only writable — no per-launch cost, but narrows the DS4 write gate and needs
     that narrowing written down as a decision rather than absorbed.
2. **The manifest flip**, with D5's launcher revert: a thin TS entry honoring
   `MIRROR_TS_MCP=0` by exec'ing `python3 -m memory mcp`, deleted in DS10. A revert that
   requires editing an installed plugin is not a revert a user can perform under pressure.

## What travels with this story

- **D10's tolerance.** The ranked `search_memories` score is graded to 1e-6, not byte-equal.
  Python's `np.dot` accumulates in float32, JavaScript widens to double — and Python
  disagrees with Python across machines by ~3e-08, so the score was never a byte contract in
  any language. **Any later claim that this surface is byte-identical to Python carries this
  exception, including DS10's deletion rationale.**
- **The threat model** lives in `cv22-ds9-us1-json-rpc-protocol-core/plan.md`. Its central
  correction: the trust boundary is not client↔server but user-intent↔model-context. The
  caller is the model, and the model is driven by anything in its context.
- **`journey_status` with no slug** is still the widest read on the surface (226 KB / ~57K
  tokens over 21 journeys). A cap candidate for TS1.

## Open Change Requests raised here

- **CR086** (RS010) — a baseline advance must name the oracle change it absorbs. Raised
  because the `memories --search` defect ran for two months behind *two* failed guards: the
  drift tripwire was advanced inside an unrelated commit, and a test **asserted** the defect
  because it had been written from observed TypeScript behavior instead of from the oracle.
- US1's two deferred findings remain open: the `MIRROR_HOME`/`MIRROR_USER` conflict reported
  as "Mirror home is not configured", and Python's `serve()` having no framing test.

## How to run what exists

```bash
cd ts && node --test "test/mcp/**/*.test.ts"   # 81 tests
scripts/mcp_two_engine_diff.sh                 # fixture, both engines, 9 responses
scripts/mcp_real_copy_probe.sh                 # a copy of a real DB, 12 tools, hashes only
```

The probe prints no content — only hashes, byte counts, and tool names — and ends by
asserting that neither engine wrote to the copy.

## The habit worth carrying forward

Three fixtures in this story passed while proving less than they claimed, and mutation
testing is what exposed each one: sort direction was ungraded because every candidate row
shared a timestamp; no null persona was ever rendered because a transcript stopped at
`limit: 2`; and every journey description was `""` because the regex needed a terminator the
seed lacked. **Green tests were never the claim — the claim is that the tests bite.** Run
the mutants before believing a new golden.
