[< Story](index.md)

# Review — CV20.DS4.US5 Accelerated And Autonomous Cadence

## Changed Behavior

- Activated conservative higher-autonomy cadence profiles:
  - `accelerated`
  - `autonomous`
- `autonomous` requires explicit Navigator limits before it can be selected.
- Delivery cursor persists `cadence_limits`.
- Added `continue-lifecycle` as the first safe accelerated continuation behavior.

## Runtime Behavior

- `stepwise` refuses automatic continuation.
- `accelerated` and `autonomous` may continue only through bypassable soft stops.
- Hard gates remain hard:
  - Plan approval;
  - Navigator validation acceptance;
  - debt decisions;
  - unsafe operations;
  - scope changes;
  - push/release;
  - Done/history evidence.
- First supported continuation path:

```text
review_complete -> coherence_complete -> done_complete
```

when Coherence and Done/history evidence are supplied explicitly.

## Manual Validation

Validated against `/Users/alissonvale/Code/sandbox-pet-store` from a full reset.

The accelerated flow correctly:

- accepted `accelerated` cadence;
- pulled and expanded `CV2.DS1` without crossing hard gates;
- stopped for User Story confirmation;
- stopped for Plan approval;
- stopped for Navigator validation acceptance;
- completed Debt Review;
- used accelerated continuation to reach Coherence and Done with the expected surfaces.

## Debt

- Accelerated continuation currently supports a conservative post-review path. More bypassable paths can be added later as the method accumulates evidence.
- Autonomous behavior is intentionally constrained by explicit limits and hard gates.

## Decision

Done. Higher-autonomy cadence is available without weakening Ariad's hard gates.
