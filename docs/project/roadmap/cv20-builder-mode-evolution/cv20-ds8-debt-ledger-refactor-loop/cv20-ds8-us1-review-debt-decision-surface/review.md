[< Story](index.md)

# Review — CV20.DS8.US1 Review Debt Decision Surface

## Changed Surface

- Added deterministic `DEBT_REVIEW_CHECKPOINT` surface.
- Added `review-item` command for Ariad-adopted journeys.
- Debt Review now runs after passed Validation and before Coherence.
- The surface names debt findings, the Navigator debt decision, missing decision evidence, the debt review contract, and the review artifact path.

## Runtime Behavior

- Debt Review requires `last_delivery_event=validation_passed`.
- `pending` decision blocks progression with `pending_confirmation=navigator_debt_decision`.
- `no_action` clears pending confirmation and records `last_delivery_event=review_complete`.
- `defer` requires a defer reason and revisit trigger.
- `pay_now` blocks Coherence until the future Refactor loop exists.
- `review.md` is materialized when the active story package path can be resolved.

## Manual Validation

Validated against `/Users/alissonvale/Code/sandbox-pet-store` after Validation passed. The Driver rendered `DEBT_REVIEW_CHECKPOINT` with:

```text
status
reviewed

debt decision
no_action

missing decision
✓ none

boundary
Debt Review is complete; Builder may proceed to Coherence.
```

## Debt

- Durable versioned debt ledger remains planned in `CV20.DS8.TS1`.
- Pay-now Refactor loop remains planned in `CV20.DS8.US2`.

## Decision

Done. The no-action Debt Review flow is deterministic and manually validated.
