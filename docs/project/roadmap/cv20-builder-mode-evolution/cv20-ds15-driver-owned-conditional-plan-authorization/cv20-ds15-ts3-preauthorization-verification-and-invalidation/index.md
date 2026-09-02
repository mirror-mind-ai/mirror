[< Parent](../index.md)

# CV20.DS15.TS3 — Preauthorization Verification And Invalidation

**Status:** ✅ Done
**Type:** Technical Story

---

## Technical Story

In order to preserve the Plan hard gate under retries and concurrency,
as the Ariad runtime,
I want exact revalidation and compare-and-swap receipt consumption,
so that at most one caller can approve and start implementation from one receipt.

## Outcome

Conditional approval verifies every receipt coordinate and Plan completeness,
then consumes the receipt in the same cursor metadata compare-and-swap that marks
Plan approval. A concurrent or repeated caller observes `already_approved` and
does not emit a second implementation start. Mismatches invalidate authority,
render one payload-free bounded reason, and retain ordinary approval.

## Acceptance Behavior

```text
Given one complete matching Plan and one pending receipt
When two processes attempt consumption
Then one returns approved with implementation start
And the other returns already_approved without repeating the transition
```

```text
Given changed generation, item, flow, child set, contract, policy, stop, fingerprint,
or incomplete Plan
When conditional approval is attempted
Then authority is not consumed
And ordinary approval remains the next gate
```

## Scope

- Runtime-session metadata compare-and-swap.
- Single-winner approval/receipt transition.
- Exact verification, cancellation, bounded mismatch surfaces, and idempotent retry.

## Out Of Scope

- Distributed locks outside SQLite.
- Authorization across later hard gates.
- Automatic mismatch repair or authority recreation.

## Validation

Focused unit coverage plus
`tests/integration/memory/builder/test_plan_preauthorization_concurrency.py`.
Aggregate Navigator validation was accepted.
