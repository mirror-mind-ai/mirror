[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR003 — Make Artifact Materialization Surfaces Truthful

## Problem

Ariad artifact surfaces reported files as created or updated when the corresponding
filesystem operation had not occurred or had produced no content change.

## Expected Behavior

Every path and action named by `ARTIFACTS_MATERIALIZED` must come from the writer's
actual result. `created`, `updated`, and `existing` must describe observable disk state.

## Impact

Artifact surfaces are a trust boundary. False write claims force the Navigator to
reinspect the filesystem and undermine the reason deterministic surfaces exist.

## Plan Or Decision

Drive the surface from the materializer result rather than a separately derived template
list. Preserve existing files and distinguish no-op behavior from real updates.

## Evidence

The fixes and regression evidence are recorded in dogfooding findings
[AF-002](../../roadmap/cv20-builder-mode-evolution/ariad-dogfooding-ledger.md#af-002--artifacts_materialized-reports-a-file-that-was-not-written)
and
[AF-006](../../roadmap/cv20-builder-mode-evolution/ariad-dogfooding-ledger.md#af-006--approve-delivery-story-plan-reports-an-update-that-did-not-happen).

## Outcome

Completed. Plan materialization now creates every reported artifact, and approval
preserves existing story files while reporting their real operation status. Regression
tests cover surface-to-disk correspondence and no-clobber behavior.
