[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR105 — Choosing Delivery Story flow leaves the story-by-story confirmation pending

## Problem

When `pull-item` expands a Delivery Story, Expand records the story-by-story stop on
the cursor: `active_checkpoint=next_story_confirmation` and
`pending_confirmation=navigator_story_confirmation` (`ts/src/builder/expand.ts`).
`set-flow-unit --unit delivery_story` then changes only the flow unit and
`last_delivery_event`, and carries both fields forward untouched
(`setNavigatorFlowUnit`, `ts/src/builder/flowUnit.ts`). Delivery Story flow never
consumes that confirmation; `plan-delivery-story` overwrites it.

Until the Delivery Story is planned, every surface that reads the cursor reports a stop
the chosen flow will never ask for. `■ BUILDER RESUME` shows the story-by-story
checkpoint as pending and offers `answer_pending_confirmation` as the next action.
Planning the Delivery Story is not among its allowed actions.

CR001 makes this state routine. The Builder skill now ends the agent's turn at the
Delivery Story scope confirmation, so every Delivery Story flow crosses a turn boundary
in exactly this state.

## Expected Behavior

After `set-flow-unit --unit delivery_story`, the cursor and every surface that reads it
describe what Delivery Story flow is actually waiting for. No story-by-story
confirmation remains pending that the chosen flow will never consume, and the resume
surface's allowed next actions include the flow's real next step.

## Impact

The resume surface is what a new session reads first. At this point it contradicts the
scope confirmation rendered one turn earlier. It steers the Navigator and the agent
toward a next-story question Delivery Story flow never asks, and it omits the Plan that
the scope confirmation promised.

## Plan Or Decision

Pending. Captured while working the Ariad trust floor on CR001, which captures what it
finds instead of fixing it
([decision](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3));
this CR is not on the floor. Decide first whether choosing Delivery Story flow clears
the story-level confirmation or replaces it with a stop Delivery Story flow owns.
CR001 declined runtime enforcement of the scope stop, so the second would be a new
decision, not a follow-through. The reverse switch, from Delivery Story flow back to
story by story, was not exercised and should be checked while planning.

## Evidence

Reproduced 2026-09-26 on `mirror-ts-core` at `724938a1` with the real front door, an
isolated `MIRROR_HOME`, a scratch Git project under `/tmp`, and no `.env` loaded,
during [CR001](cr001-scope-confirmation-checkpoint.md)'s reproduction:

- After `pull-item --item-level delivery_story`, the cursor held
  `next_story_confirmation` / `navigator_story_confirmation` / `expand`.
- After `set-flow-unit --unit delivery_story`, it held `next_story_confirmation` /
  `navigator_story_confirmation` / `navigator_flow_unit_selected`, with flow unit
  `delivery_story`.
- `build load` at that point rendered `■ BUILDER RESUME` with
  `active checkpoint: next_story_confirmation`,
  `pending confirmation: navigator_story_confirmation`, and allowed next actions
  `answer_pending_confirmation` and `inspect_method`.

## Outcome

Pending.
