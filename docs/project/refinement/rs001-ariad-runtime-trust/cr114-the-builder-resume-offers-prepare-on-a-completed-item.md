[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR114 — The Builder resume offers Prepare on a completed item

## Problem

`■ BUILDER RESUME` chooses its `allowed next actions` from two facts: whether a
confirmation is pending, and whether the cursor has an active item
(`readBuilderResumeState`, `ts/src/builder/resumeState.ts`). It never reads the last
delivery event. So a cursor whose item closed — `last delivery event: done_complete`,
no checkpoint, nothing pending — is offered the list for an item in progress:

```text
active item            CV22.DS10.TS5
active checkpoint      none
pending confirmation   none
last delivery event    done_complete
allowed next actions   - prepare_active_item
                       - inspect_roadmap
                       - inspect_method
```

`prepare_active_item` on a done item is not a next action; the next action is to pull
the next item, which the list does not name. The same list serves every event between
Pull and Done, so a cursor at `implementation_started` is also told to Prepare.

## Expected Behavior

The resume's next actions follow the cursor's position: after `done_complete`, pull the
next item or inspect the roadmap; after Pull, Prepare; after Prepare or Expand, Plan (or
the flow-unit choice for a Delivery Story); after Plan approval, implement; after
implementation, validate; and so on through the lifecycle the ribbon already draws. One
table, read by the resume and by `build show`, so the two cannot disagree — the way
[CR105](cr105-choosing-delivery-story-flow-leaves-the-story-confirmation-pending.md)
gave the flow-unit choice one table for the question it asks.

## Impact

Wrong at the decision point, on the first surface a session reads. The Builder skill
tells the agent to orient from this card; a card that offers Prepare on a closed item
sends the reader to the wrong command, or teaches the reader to ignore the list, which
is worse.

## Plan Or Decision

Captured 2026-09-30 while working the trust floor. Proposed for the floor; the Navigator
decides.

## Evidence

Observed 2026-09-30 at `9dca47a0`, the `build load mirror-ts-core` that opened this
session, with the cursor still on CV22.DS10.TS5 five days after its Done. The card above
is the one rendered. `ACTIVE_ITEM_ACTIONS` (`ts/src/builder/resumeSurface.ts`) is the
list, and `resumeState.ts` selects it whenever `activeItem` is set and nothing is
pending.

## Outcome

Pending.
