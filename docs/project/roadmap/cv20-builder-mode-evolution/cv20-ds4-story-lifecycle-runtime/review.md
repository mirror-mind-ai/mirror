[< CV20](../index.md)

# Review — CV20.DS4 Story Lifecycle Runtime

## Changed Capability

DS4 turns Ariad Builder Mode from roadmap inspection and partial lifecycle support into an end-to-end delivery runtime. Builder can now guide an Ariad-adopted journey through:

```text
Pull -> Prepare -> Expand -> Plan -> Approval -> Implement -> Validate -> Debt Review -> Coherence -> Done
```

## Runtime Surfaces

DS4 added deterministic Ariad runtime surfaces for the full happy path and its hard gates:

- Roadmap Snapshot and Pull Candidates.
- Delivery Story Identified.
- Prepare Field Reading.
- Expand Decision.
- Plan Checkpoint.
- Plan Approved.
- Implementation Guard.
- Validation Checkpoint.
- Debt Review Checkpoint.
- Coherence Checkpoint.
- Done Checkpoint.

Ariad surfaces are now method-declared runtime artifacts with verbatim transport and after-block interpretation.

## Method Semantics

- Delivery Stories always expand before Plan and are never directly implementable.
- User Stories and Technical Stories are implementable units.
- Plan materializes story packages with `index.md`, `plan.md`, and `test-guide.md`.
- Plan approval is a deterministic runtime transition.
- Implementation is blocked until the approved Plan gate is cleared.
- Validation distinguishes automated checks, E2E evidence, Navigator route, and explicit Navigator acceptance.
- Debt Review is explicit before Coherence.
- Coherence verifies process/project/product alignment.
- Done records history action, roadmap/story package update, and next Ariad movement.

## Cadence

DS4 introduced cadence profiles:

- `stepwise` for phase-by-phase dogfooding.
- `checkpoint` for normal hard-gate cadence.
- `accelerated` for safe continuation through soft stops.
- `autonomous` with explicit Navigator limits and hard gates preserved.

`continue-lifecycle` proves the first accelerated continuation path after Debt Review.

## Manual Validation

The lifecycle was dogfooded against `/Users/alissonvale/Code/sandbox-pet-store` from full reset through Done. The final accelerated run confirmed that hard gates were not skipped and that Coherence/Done could be reached through safe continuation after Review.

## Debt And Exclusions

- Durable versioned debt ledger remains in DS7.
- Pay-now Refactor loop remains in DS7.
- Method preferences and `.ariad/config.yml` overrides remain in DS8.
- Parent Delivery Story collapse and release automation remain future work.

## Decision

Done. DS4 is a release boundary for Ariad Builder lifecycle runtime.
