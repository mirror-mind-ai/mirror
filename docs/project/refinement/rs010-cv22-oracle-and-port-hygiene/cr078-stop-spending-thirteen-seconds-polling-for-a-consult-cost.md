[< RS010](index.md)

# CR078 — Stop spending thirteen seconds polling for a `consult` cost

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`consult ask` takes about fifteen seconds to answer a one-line question, and
roughly thirteen of them are cost bookkeeping after the answer already exists.

`fetch_generation_cost` (`src/memory/intelligence/llm_router.py`, ported to
`LiveCreditProvider.fetchGenerationCost`) polls OpenRouter's `/generation`
endpoint up to five times, sleeping 1s, 2s, 3s, then 4s between attempts,
because OpenRouter exposes usage data a few seconds after the completion. Then
`cmd_ask` calls `cmd_credits`, a second GET, to render the balance bar.

Measured on 2026-09-12 during the CV22.DS8.US3 live validation:

```text
/mm-consult gemini lite "what day is today?"
  [prompt: 45, completion: 4] · Call cost: $0.000006 · Balance: R$ 16.93
  Took 14.7s
```

The model call for 45 prompt tokens and a 4-token completion is about a second.
The same shape appeared in the smoke probe: `latency 14589ms` for a call whose
own `latency_ms` was a fraction of that.

This is a faithful port — both engines do it, and CV22.DS8.US3 deliberately
reproduced the poll arithmetic rather than improving it, because a parity story
must match the oracle's behavior. So this is not a port defect. It is a cost
the design has always had, which only became visible when `consult` stopped
being a developer command and started being an interactive skill.

## Expected Behavior

A `consult` answer is not held hostage to its own accounting. The content, the
token counts, and the balance appear at model speed; the exact cost arrives
without blocking the reply, or is not fetched at all when it cannot be useful.

Any of these would satisfy it, and the choice is the decision this CR carries:

1. **Render first, reconcile after.** Print the answer immediately, then poll
   and update the ledger row. The `llm_calls` row is written after the poll
   today, so this needs the row written first and updated, or written once the
   poll settles in a detached step.
2. **Shorten the budget.** Five attempts across ten seconds is the oracle's
   number, not a measured one. If the cost typically lands on attempt one or
   two, a two-attempt budget would recover most of the latency and lose the
   figure rarely — and when it is lost, `compute_cost` already fills the row
   with the static estimate (the fallback CV22.DS8.US3 added).
3. **Skip the poll when it cannot pay for itself.** The fetched figure only
   beats the estimate for models outside the static price table. For a pinned
   model whose price is known, the estimate is as good and free.

Whichever is chosen, the balance bar's second GET should be considered in the
same change: it is a separate round trip for a number the user did not ask for.

## Impact

User-visible latency on every `consult`, on both engines. Fifteen seconds for a
one-line answer reads as a broken command; it is the difference between a skill
someone reaches for and one they avoid. No correctness risk and no spend risk —
the poll is free, it is only slow.

The scope is wider than TypeScript: under the moving-target rule the fix lands
in Python as well, since `consult` is ported and both cores carry the same
poll.

## Plan Or Decision

Not planned. Needs a measurement before a choice: instrument how often the cost
actually arrives on attempt 1, 2, 3, 4, 5 across a handful of real calls. That
distribution decides between shortening the budget and moving the poll off the
reply path — and it may show that most calls already answer on the first
attempt, in which case something else accounts for the thirteen seconds and
this CR's diagnosis needs correcting before any fix.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Observed during the CV22.DS8.US3 live validation on 2026-09-12, on the real
home through `/mm-consult` and on a database copy through
`ts/parity/live_long_tail_smoke.ts ask`. Recorded in that story's
[validation evidence](../../roadmap/cv22-typescript-core-port/cv22-ds8-live-provider-cutover/cv22-ds8-us3-long-tail-cutover-and-gate-consolidation/validation.md)
as an observation, not a defect, and captured here at the Navigator's request.
