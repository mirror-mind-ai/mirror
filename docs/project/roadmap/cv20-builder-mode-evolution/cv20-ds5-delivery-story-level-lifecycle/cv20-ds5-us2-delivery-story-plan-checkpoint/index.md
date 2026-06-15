[< Parent](../index.md)

# CV20.DS5.US2 — Delivery Story Plan Checkpoint

**Status:** 🟡 Planned
**Type:** User Story

---

## Outcome

Builder can render and approve an aggregate Delivery Story Plan checkpoint when `navigator_flow_unit` is `delivery_story`, while preserving child User/Technical Stories as traceable Driver work packages.

## Story Statement

As a Navigator,
I want to approve one aggregate Delivery Story plan when I choose Delivery Story flow,
So that cohesive work can proceed without requiring a separate Navigator-facing Plan checkpoint for every child story.

## Acceptance Behavior

```text
Given an Ariad Delivery Story has `navigator_flow_unit=delivery_story`
And child work packages are known
When Builder plans the Delivery Story
Then Builder renders a DS-level Plan checkpoint
And lists child work packages as traceable implementation units
And blocks implementation until the DS-level plan is approved
```

```text
Given an Ariad Delivery Story has `navigator_flow_unit=story_by_story`
When Builder plans work
Then existing child story Plan behavior remains unchanged
And no aggregate DS Plan is used by default
```

```text
Given a DS-level Plan has been approved
When Builder resumes active delivery state
Then the aggregate checkpoint status shows plan approval
And child work packages remain visible for implementation evidence
```

## Scope

- Add the minimal runtime operation/surface for a DS-level Plan checkpoint.
- Require `navigator_flow_unit=delivery_story` before DS-level Plan behavior is allowed.
- Use persisted DS lifecycle state from `CV20.DS5.TS1` for child work packages and aggregate checkpoint status.
- Preserve existing story-by-story Plan behavior as the default.
- Add focused unit/CLI tests for DS-level Plan rendering, approval, and state preservation.

## Out Of Scope

- Implementing DS-level Validation, Debt Review, Coherence, or Done; this belongs to CV20.DS5.US3.
- Automatically executing child stories after DS Plan approval.
- Removing child story artifacts or evidence requirements.
- Implementing release intent/push policy behavior from CV20.DS6.
- Implementing DS8 preferences/config overrides.
- Changing non-Ariad Builder behavior.

## Validation

- Automated tests cover DS-level Plan checkpoint gating, rendering, approval, and default story-by-story preservation.
- CLI validation demonstrates that DS-level Plan is available only for `delivery_story` flow.
- No external sandbox validation is required unless the implementation exposes new Navigator behavior beyond Builder CLI surfaces.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
