[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR115 — The cadence profile that changes what Plan does is shown on no read-only surface

## Problem

A journey's cadence profile changes what `build plan-item` does. Under `accelerated`,
Plan records a story preauthorization receipt and the Driver is told to complete the
plan and continue into implementation without a Navigator turn
(`cadencePreauthorizesStoryPlan`, `ts/src/builder/plan.ts`; the Builder skill's
"accelerated cadence" route). Under `autonomous`, the cursor also carries limits.

The cursor stores both (`cadenceProfile`, `cadenceLimits`,
`ts/src/builder/deliveryCursor.ts`). The only surface that prints them is the cursor
sync report, rendered by `set-cadence` and `sync-cursor`
(`renderDeliveryCursorSyncReport`, `deliveryCursor.ts`) — that is, when the cadence is
being changed, or when the cursor is being rewritten. `■ BUILDER RESUME`,
`build show`, the Builder home surface, and `build inspect-method --journey` print
nothing about it. A Navigator resuming a journey cannot see whether the next Plan will
stop for approval or start implementing.

## Expected Behavior

Every read-only surface that orients the Navigator — the resume, `build show`, the home
surface — prints the cadence profile and, under `autonomous`, its limits, in the same
compact form the sync report uses. The default profile is printed as the name it is,
not omitted, so an absent line cannot be read as either.

## Impact

Wrong at the decision point by omission. A cadence set in one session shapes the next
session's Plan; the surface that opens that session says nothing about it. The first
sign of `accelerated` is implementation starting.

## Plan Or Decision

Captured 2026-09-30 while working the trust floor. Proposed for the floor; the Navigator
decides.

## Evidence

Observed 2026-09-30 at `9dca47a0`: `build load mirror-ts-core`, `build show`, and
`build inspect-method --journey mirror-ts-core` printed no cadence field. Grepping
`resumeSurface.ts`, `resumeState.ts`, `activeCheckpoint.ts`, and `homeSurface.ts` for
`cadence` finds nothing; `deliveryCursor.ts:507` prints `cadence profile` and
`cadence limits` in the sync report only.

## Outcome

Pending.
