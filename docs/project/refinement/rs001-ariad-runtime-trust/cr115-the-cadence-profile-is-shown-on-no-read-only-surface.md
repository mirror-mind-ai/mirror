[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR115 — The cadence profile that changes what Plan does is shown on no read-only surface

## Problem

### As captured (2026-09-30)

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

### As characterized (2026-10-01)

Reproduced at `82c1084a` with CR114's
[validation route](cr114-the-builder-resume-offers-prepare-on-a-completed-item.md#validation-route),
step 17: under each of the four profiles, the resume, `build show`, and the Builder
orientation of a journey with no item pulled print no cadence. The capture holds.

Two facts the capture did not state. The runtime applies `stepwise` to a cursor that
stores no cadence: the sync report prints it, `continue-lifecycle` refuses as stepwise,
and Plan records no authority. Each holds that default separately. And `autonomous` does
not change what Plan does: its plan approval policy is `navigator_approval`, like
`stepwise` and `checkpoint`. Only `accelerated` carries `bounded_story_authority`. What
`autonomous` changes is `continue-lifecycle`, which refuses it without limits.

Characterizing found a defect in the cadence's reach, captured as
[CR117](cr117-a-delivery-story-s-flow-unit-outlives-it.md): after a Delivery Story runs
in Delivery Story flow, no story pulled next can be planned under `accelerated`.

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

Captured 2026-09-30 while working the trust floor, and taken onto it the same day by the
Navigator's decision
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).

**Planned and assigned 2026-10-01, one delivery with
[CR114](cr114-the-builder-resume-offers-prepare-on-a-completed-item.md#plan-or-decision)**,
whose plan, decisions, and validation route cover both. The Navigator approved the plan
and its decisions D1 to D5; Driver `@viniciusteles`, Delivery `mirror-ts-core`. The resume, `build show`, and the
orientation print `cadence profile` and, under `autonomous`, `cadence limits`, from one
function; a cursor that stores no cadence prints `stepwise`. Decision D4 there keeps
`build inspect-method --journey` out.

## Evidence

Observed 2026-09-30 at `9dca47a0`: `build load mirror-ts-core`, `build show`, and
`build inspect-method --journey mirror-ts-core` printed no cadence field. Grepping
`resumeSurface.ts`, `resumeState.ts`, `activeCheckpoint.ts`, and `homeSurface.ts` for
`cadence` finds nothing; `deliveryCursor.ts:507` prints `cadence profile` and
`cadence limits` in the sync report only.

## Outcome

Pending.
