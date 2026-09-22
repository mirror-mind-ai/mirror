# Review — CV22.DS10.TS3

## Status

Reviewed

## Debt Findings

- Two findings, both named during the work rather than discovered at closure. (1) THE HARNESS RECORDS NO SPEND: the approved Plan promised actually-spent in validation.md, but eval probes call the provider without a ledger hook, so the full live suite wrote zero rows to llm_calls (verified by query). Inherited from the Python harness, which recorded eval spend nowhere either. The provider response already carries what the ledger hook consumes, so a per-run spend total is small and contained. (2) RECEPTION'S CATALOGUE LOADER MIRRORS THE PYTHON EVAL, NOT TS PRODUCTION: it reads content[:200] plus routing_keywords, while resolveMirrorDefaults prefers a generated descriptor when one exists. Deliberate at plateau 4, because matching the eval is what kept the 70/70 plateau-5 diff meaningful, but it means this module measures something production does not quite do. Debt PAID by this story: D-017, the averaged injection score, is fixed — six probes are now blocking and an obeyed injection fails its module at any score. Debt whose SUBJECT was retired: D-005, the stale routing fixtures, retired with the module, with the absence of a successor gate named in the engineering principles rather than assumed covered.

## Debt Decision

defer

## Defer Reason

Neither finding affects what the gate now proves. Behavior parity is established at 70/70 probe verdicts and the D-017 fence hole is closed, which was the story's purpose. Paying either now reopens a complete story for work that is better done where it belongs: the spend ledger is a harness feature with its own small design (which response fields, which sink, how the suite reports a total), and changing reception's loader immediately after establishing parity would move the numbers for a reason unrelated to the port.

## Revisit Trigger

Finding 1: the first time a run's cost is questioned, or before any model-pin migration, where cost per run is part of the decision. Finding 2: the next story that touches reception routing or descriptor generation.

## Missing Decision

- none

## Durable Ledger Entries

The debt-review contract asks whether a durable ledger entry is required. It
is: a deferral that lives only in a closed story's `review.md` is a deferral
nobody will find. Both findings are recorded in
[the debt ledger](../../../../debt.md) with their revisit triggers.

| finding | ledger | status |
|---|---|---|
| The harness records no spend | **D-020** | Carried |
| `reception`'s loader diverges from production; routing quality has no gate | **D-021** | Carried |

Two existing entries were resolved by this story rather than left to drift:

- **D-017** (injection probes averaged into a module score) → **Paid**. Its
  closure condition was "an obeyed injection probe fails its module and the
  suite regardless of the aggregate score, in whichever harness owns the
  release gate, with a test proving the failure path." All three parts hold.
- **D-005** (stale `routing` fixtures) → **Dropped**. Its revisit trigger
  explicitly handed the disposition to this story, which retired the module.
  The retirement is not a fix, so the successor gap is carried as D-021 rather
  than allowed to close silently.
