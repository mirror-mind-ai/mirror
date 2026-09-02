[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR001 — Make Scope Confirmation An Honest Checkpoint

## Problem

Under checkpoint cadence, `plan-delivery-story` has emitted a scope-confirmation surface
phrased as a pre-plan question and then materialized the plan in the same invocation.
The checkpoint appears to gate an action that has already happened.

## Expected Behavior

Either scope confirmation stops before plan artifacts are written, or the surface is
explicitly non-gating and does not ask a precondition question after materialization.
Cadence semantics and visible language must agree.

## Impact

A checkpoint that does not checkpoint weakens trust in every other Ariad stop condition.

## Plan Or Decision

1. Reproduce the scope-confirmation ordering under checkpoint cadence against the
   current runtime.
2. If the finding no longer reproduces, record current evidence and close this CR
   without changing code.
3. If it reproduces, characterize both the emitted surface order and filesystem writes
   before making a change.
4. Choose one smallest honest behavior: either stop before plan materialization or make
   the scope surface explicitly non-gating. Do not implement both routes.
5. Add focused regression evidence for the chosen ordering and disk effects.
6. Preserve existing Navigator approval and publication boundaries.

This document records the plan only. Selecting and planning CR001 does not authorize its
implementation.

## Evidence

The original dogfooding observation is
[AF-004](../../roadmap/cv20-builder-mode-evolution/ariad-dogfooding-ledger.md#af-004--scope-confirmation-checkpoint-collapses-into-plan-materialization).

## Outcome

Pending.
