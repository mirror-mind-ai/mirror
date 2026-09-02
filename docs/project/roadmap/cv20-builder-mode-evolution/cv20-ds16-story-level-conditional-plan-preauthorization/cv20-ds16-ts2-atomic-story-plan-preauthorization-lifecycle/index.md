[< CV20.DS16](../index.md)

# CV20.DS16.TS2 — Atomic Story Plan Preauthorization Lifecycle

**Type:** Technical Story
**Status:** ✅ Done

## Outcome

Story Plan authority is recorded during `plan-item`, revalidated against a
complete Driver-owned Plan, and consumed atomically with approval exactly once;
all failures preserve ordinary approval.

## Scope

- `plan-item` explicit preauthorization;
- conditional `approve-plan` and cancellation;
- completeness verification and bounded mismatch reasons;
- compare-and-swap consumption and retry idempotency;
- backward-compatible ordinary and Delivery Story approval routes.

## Done Condition

Matching US/TS authority starts implementation once, concurrent or repeated
consumption does not duplicate transitions, and invalid authority cannot cross
the Plan hard gate.
