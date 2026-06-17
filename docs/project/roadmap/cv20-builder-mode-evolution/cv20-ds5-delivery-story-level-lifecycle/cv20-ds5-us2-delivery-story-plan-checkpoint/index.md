[< Parent](../index.md)

# CV20.DS5.US2 — Delivery Story Plan Checkpoint

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

A Navigator operating Builder Mode through Pi can choose Delivery Story flow, request an aggregate Delivery Story Plan, and approve that plan in natural interaction.

## Story Statement

As a Navigator using Builder Mode in Pi,
I want to choose Delivery Story flow and approve its aggregate plan conversationally,
So that cohesive Delivery Stories can proceed without exposing me to low-level CLI commands.

## Acceptance Behavior

```text
Given a Delivery Story is active or in focus
When the Navigator says they want to follow work at Delivery Story level
Then the Driver calls the flow-unit runtime operation with `delivery_story`
And returns the `NAVIGATOR_FLOW_UNIT` surface verbatim
```

```text
Given a Delivery Story is active with `navigator_flow_unit=delivery_story`
When the Navigator asks Builder to plan the DS
Then the Driver calls the DS-level Plan runtime operation
And returns the `DELIVERY_STORY_PLAN_CHECKPOINT` surface verbatim
And explains the plan after the block
```

```text
Given a DS-level Plan is pending approval
When the Navigator approves the plan in natural language
Then the Driver calls the DS-level Plan approval runtime operation
And returns the approved surface verbatim
```

## Scope

- Update Builder Mode/Pi instructions for routing natural requests to flow-unit and DS-level Plan commands.
- Preserve deterministic Ariad surface transport.
- Validate as a Pi/Navigator behavior, not only as CLI runtime behavior.

## Out Of Scope

- Runtime DS-level Plan implementation; covered by `CV20.DS5.TS2`.
- DS-level Validation/Closure; covered by `CV20.DS5.US3`.
- Release/push policy behavior from `CV20.DS7`.

## Validation

- Navigator validates from Pi/Builder natural interaction.
- Focused docs/skill checks if applicable.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
