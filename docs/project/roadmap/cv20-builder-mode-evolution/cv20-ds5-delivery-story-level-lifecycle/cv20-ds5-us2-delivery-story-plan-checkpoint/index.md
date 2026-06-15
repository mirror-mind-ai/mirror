[< Parent](../index.md)

# CV20.DS5.US2 — Delivery Story Plan Checkpoint

**Status:** 🟡 Planned
**Type:** User Story

---

## Outcome

A Navigator operating Builder Mode through Pi can request and approve an aggregate Delivery Story Plan in natural interaction when `navigator_flow_unit` is `delivery_story`.

## Story Statement

As a Navigator using Builder Mode in Pi,
I want to say that a Delivery Story should be planned as one aggregate flow and approve that plan conversationally,
So that cohesive Delivery Stories can proceed without exposing me to low-level CLI commands.

## Acceptance Behavior

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

- Update Builder Mode/Pi instructions for routing natural requests to DS-level Plan commands.
- Preserve deterministic Ariad surface transport.
- Validate as a Pi/Navigator behavior, not only as CLI runtime behavior.

## Out Of Scope

- Runtime DS-level Plan implementation; covered by `CV20.DS5.TS2`.
- DS-level Validation/Closure; covered by `CV20.DS5.US3`.
- Release/push policy behavior from `CV20.DS6`.

## Validation

- Navigator validates from Pi/Builder natural interaction.
- Focused docs/skill checks if applicable.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
