[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR075 — Route the journal embedding through the safety wrapper

**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

`ts/src/frontDoor/contentTailRoute.ts` embeds the journal entry by calling
`providers.embedding.embed(...)` **directly**, bypassing
`generateEmbeddingSafely`. Every other embedding path in the TS core goes
through that wrapper, which owns three behaviors Python's `generate_embedding`
has:

1. **bounded retry** of a transient empty payload (`MEMORY_EMBEDDING_ATTEMPTS`,
   default 3, with backoff);
2. the **permanent dimension-mismatch guard** (AI-07) that refuses to store a
   vector the corpus cannot rank against;
3. the **`onAttempt` ledger hook**, which is what writes the `llm_calls` row.

So a journal save today: never retries a transient empty response, would store
a wrong-dimension vector if the pin were changed, and writes **no ledger row**
for an embedding it paid for.

This was harmless while `journal` was replay-gated — a fixture always returns
a well-formed vector, and a replayed call costs nothing, so an absent ledger
row was accurate. It stops being harmless when DS8.US3 flips `journal` to the
live provider: the call becomes billable and invisible, and the two failure
modes become reachable.

Found during the CV22.DS8.US1 handoff review, not by a failing test — no test
asserts that `journal` writes a ledger row, because under replay there is
nothing to assert.

## Expected Behavior

`contentTailRoute` embeds through `generateEmbeddingSafely` with the ledger
hook wired, exactly as `memorySearch` does: transient emptiness retried within
budget, a dimension mismatch refused with the AI-07 diagnostic, and one
`llm_calls` row per round-trip, priced through `computeCost` and with bodies
withheld. Python parity is the acceptance criterion — Python's `add_memory`
path logs an `embedding` row for the journal write.

## Impact

Medium, and it grows on a schedule. Today: one silently unpriced (and unpaid)
call. After DS8.US3: real spend absent from the ledger that the burn-down and
any future budget guard read as ground truth, plus a lost retry on the exact
transient failure CR043 was written to survive.

Adjacent question worth answering in the same change: whether `soul harvest
save` and the other content-tail writes share the bypass.

## Plan Or Decision

Not planned. Natural owner is **CV22.DS8.US3**, which flips `journal`,
`week plan`, `descriptor generate`, and `soul harvest save` to the live
provider — the change should land with the flip, so the ledger row and the
retry exist the first time the call is billable.

## Evidence

- `ts/src/frontDoor/contentTailRoute.ts` — `await providers.embedding.embed(...)`
  with no wrapper.
- `ts/src/search/memorySearch.ts` — the wrapped form, with
  `onAttempt: logQueryEmbeddingAttempt(db)`.
- `src/memory/services/memory.py` — Python builds an `embedding`-role logger
  for the same write.

## Outcome

Done in **CV22.DS8.US3 plateau 4** (2026-09-11), landing with the flip exactly
as the plan asked.

`contentTailRoute` now embeds through `generateEmbeddingSafely` with
`onAttempt: embeddingLedgerHook(db)`, so `journal` gets all three behaviors the
bare call skipped: the bounded retry of a transient empty payload, the AI-07
permanent dimension guard, and the ledger row.

**The adjacent question is answered, and the answer was worse than the
question.** `soul harvest save` did not merely share the bypass — it had no
provider wired at all: `routing.ts` sent it to TypeScript and the route's
default `embed` threw, so the leaf could not complete on the TypeScript path.
`consolidate apply`'s merge half-shared it: the wrapper was already there and
the `onEmbeddingAttempt` hook existed, but no caller had ever passed one. Both
are fixed in the same plateau, and `saveHarvestedFruit` was split into
plan/persist so the fruit is cleared only AFTER a successful embedding — a
provider outage now leaves a harvest recoverable.

Three tests pin what a fixture could not: a provider that returns one empty
vector then a good one produces a memory and TWO ledger rows (the retry, and
the paid round trip that failed); a wrong-dimension vector refuses the write
with the attempt still ledgered; and a failing harvest leaves the fruit in
place.

Verified live on 2026-09-12 against a real provider — `journal` wrote
`journal_classification` + `embedding`, both priced, on a database copy and
then on the real home. See the
[US3 validation evidence](../../roadmap/cv22-typescript-core-port/cv22-ds8-live-provider-cutover/cv22-ds8-us3-long-tail-cutover-and-gate-consolidation/validation.md).
