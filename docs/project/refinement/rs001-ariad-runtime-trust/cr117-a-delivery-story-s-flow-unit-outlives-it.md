[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR117 — A Delivery Story's flow unit outlives it, and no story after it can be preauthorized

## Problem

A flow unit is chosen at a Delivery Story's flow decision, after Prepare or Expand and
before its Plan
([CR105](cr105-choosing-delivery-story-flow-leaves-the-story-confirmation-pending.md)).
In Delivery Story flow the Delivery Story is the lifecycle unit. But Pull carries
`navigator_flow_unit` forward to whatever item is pulled next, with the cadence
(`carriedForward`, `ts/src/builder/cursorTransitions.ts`), while it clears the other
fields that belong to the Delivery Story, its child work items and its aggregate status,
when the item changes (`pullLifecycleItem`, `ts/src/builder/pull.ts`).

So after a Delivery Story runs in Delivery Story flow, every story pulled next holds
`delivery_story`, whichever Delivery Story it belongs to:

- `set-flow-unit` with no `--unit` tells a User Story `Selected flow unit:
  delivery_story`, and that the Delivery Story becomes the lifecycle unit.
- Under `accelerated`, `plan-item` refuses the story: `Error: story Plan
  preauthorization requires story_by_story flow`. No Plan is written. The Navigator's
  explicit delegation, `plan-item --preauthorize-approval --stop-after
  navigator_validation`, refuses the same way under any cadence.
- The remedy the error names cannot be taken. `set-flow-unit --unit story_by_story`
  refuses on a story, as CR105 decided: `no flow unit was chosen: the active item,
  CV1.DS2.US1, is a user story. The flow unit is chosen for its Delivery Story, CV1.DS2,
  before that Delivery Story's Plan.`
- An ordinary Plan works, and so does its approval, with a story's cursor still naming
  Delivery Story flow.

## Expected Behavior

A flow unit belongs to the Delivery Story it was chosen for. Pulling another item does
not carry it, as Pull already does not carry that Delivery Story's children or aggregate
status: the next item starts from the default, `story_by_story`, and a story can be
planned, and preauthorized, as it could before any Delivery Story ran in Delivery Story
flow.

## Impact

Wrong at the decision point, with no way through. A Navigator who chose `accelerated`
to skip the Plan turn is refused on the first story after any Delivery Story run in
Delivery Story flow, and told to change a flow unit the runtime will not let a story
change. The ways out are to change the cadence, or `sync-cursor`, which resets the
cadence with every other field. Nothing on the resume says why.

## Plan Or Decision

Captured 2026-10-01 while characterizing
[CR115](cr115-the-cadence-profile-is-shown-on-no-read-only-surface.md). On the Ariad
trust floor, last, after CR107, by the Navigator's decision of 2026-10-01
([CR114, decision D5](cr114-the-builder-resume-offers-prepare-on-a-completed-item.md#decisions-this-plan-asks-the-navigator-to-take);
[Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).

## Evidence

Reproduced 2026-10-01 at `82c1084a`, in a scratch home, with no `.env` and no Pi
session. The roadmap held CV1 with two Delivery Stories, `CV1.DS1` and `CV1.DS2`, one
User Story each. Under `checkpoint`, `CV1.DS1` was pulled, Delivery Story flow chosen,
and the Delivery Story planned, approved, validated, reviewed, and closed. Then:

```text
--- pull a story in DS2
  answer: <<<ARIAD:ITEM_ACTIVATED>>> <<<ARIAD:PREPARE_FIELD_READING>>>
  cursor: item=CV1.DS2.US1 level=user_story event=prepare flow=delivery_story cadence=checkpoint
--- inspect the flow unit; try to choose story by story
│ Selected flow unit                                     │
│ delivery_story                                         │
  answer: Error: no flow unit was chosen: the active item, CV1.DS2.US1, is a user story. The flow unit is chosen for its Delivery Story, CV1.DS2, before that Delivery Story's Plan.
--- accelerated: plan-item
  answer: Error: story Plan preauthorization requires story_by_story flow
--- the natural explicit delegation route, under checkpoint
  answer: Error: story Plan preauthorization requires story_by_story flow
--- ordinary Plan under checkpoint, then approve
  answer: <<<ARIAD:PLAN_CHECKPOINT>>> <<<ARIAD:ARTIFACTS_MATERIALIZED>>>
  answer: <<<ARIAD:PLAN_APPROVED>>>
  cursor: item=CV1.DS2.US1 level=user_story event=plan_approved flow=delivery_story cadence=checkpoint
```

The shape exists outside the scratch home. In the Navigator's database, another
journey's cursor holds a closed Technical Story whose flow unit is `delivery_story`.

## Outcome

Pending.
