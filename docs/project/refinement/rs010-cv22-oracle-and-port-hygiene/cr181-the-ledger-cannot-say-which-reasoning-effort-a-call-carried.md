[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR181 — The ledger cannot say which reasoning effort a call carried

## Problem

`llm_calls` records a call's `role`, `model`, tokens, latency, and cost, and nothing
about the reasoning effort the request carried. Since CV9.DS9.TS1 an extraction-family
call can carry `reasoning.effort`, and since CV9.DS9.US3 the default pin,
`anthropic/claude-haiku-5.5`, carries `none` unless `MEMORY_EXTRACTION_REASONING`
says otherwise. Two calls to the same model at different efforts write
indistinguishable rows, though they differ in latency, tokens, and what came back.

TS1's Debt Review deferred this to US3's Plan as D2. US3 decided to capture it rather
than build it, for the reason under Impact.

## Expected Behavior

A ledger row says which effort its request carried, or that it carried none, so a
question such as "how did reception's latency move when the effort changed?" can be
answered from the ledger alone.

## Impact

Low today. After US3, the `model` column already separates the two regimes in
practice: every row on the default pin ran at `none`, and every Flash Lite row ran
with no reasoning field. The rows the ledger cannot tell apart are calls made under
an explicit `MEMORY_EXTRACTION_REASONING` on the same model, and no one has asked the
ledger that question yet. The fix is a schema migration (019), a column, and the five
`logLlmCall` call sites, which is more than the unasked question is worth.

It becomes worth it the first time the effort is changed in a running install and
someone wants the before and after from the ledger, or if a future pin's default
effort is anything but `none`.

## Plan Or Decision

Captured, unassigned, 2026-10-28, by CV9.DS9.US3's Plan (design decision 2).

When pulled: migration `019_llm_calls_reasoning` adds a nullable `reasoning TEXT`
column; `LogLlmCallInput` gains `reasoning?: string | null`; the extraction-family
call sites pass the effort `resolveExtractionReasoning` returns, `consult` passes
null; `runtime-status` and the schema inventory goldens take the migration count.
Rows from before the migration read null, which is also what they sent until US3.

## Evidence

- `ts/src/db/schema.ts`, `llm_calls`: the columns.
- `ts/src/observability/llmCalls.ts`, `logLlmCall`: the one writer.
- `ts/src/providers/config.ts`, `resolveExtractionReasoning` (US3): the effort a call
  sends, available to every call site.
- CV9.DS9.TS1's Debt Review, D2, and
  [CV9.DS9.US3's plan](../../roadmap/cv9-mirror-1-0/cv9-ds9-the-extraction-model-chosen-by-measurement/cv9-ds9-us3-the-extraction-pin-moves-or-stays-on-the-evidence/plan.md),
  "D2, the ledger, is captured, not built".

## Outcome

Pending: captured, not planned.
