[< Parent](../index.md)

# CV20.DS5.TS2 — Aggregate Delivery Story Plan Runtime

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Builder runtime can render and approve an aggregate Delivery Story Plan checkpoint through deterministic CLI/runtime surfaces when `navigator_flow_unit` is `delivery_story`.

This is technical substrate for the user-facing `CV20.DS5.US2 — Delivery Story Plan Checkpoint`, not the complete Pi/Navigator experience.

## Technical Story Statement

In order to support Delivery Story-level planning,
As Builder runtime,
I want deterministic DS-level Plan and approval operations,
So that the Driver can later route natural Builder Mode interactions through an aggregate DS plan without losing child-story traceability.

## Acceptance Behavior

```text
Given an active Ariad Delivery Story has `navigator_flow_unit=delivery_story`
And child work packages are known
When Builder creates a DS-level Plan through runtime/CLI
Then Builder renders a deterministic DS-level Plan checkpoint
And records `plan:pending` in aggregate checkpoint status
And implementation remains blocked until approval
```

```text
Given a DS-level Plan is pending approval
When Builder approves the DS-level Plan through runtime/CLI
Then Builder records `plan:approved` in aggregate checkpoint status
And child work packages remain visible
```

```text
Given the default flow unit is `story_by_story`
When Builder uses ordinary Plan behavior
Then existing child-story Plan behavior remains unchanged
And DS-level Plan is not silently used
```

## Scope

- Runtime operation for DS-level Plan checkpoint.
- Runtime operation for DS-level Plan approval.
- Deterministic Ariad surface for DS-level Plan state.
- Cursor updates for aggregate checkpoint status.
- Focused tests for gating, rendering, approval, and default preservation.

## Out Of Scope

- Natural-language Pi/Builder routing for the Navigator; this remains `CV20.DS5.US2`.
- DS-level Validation/Debt Review/Coherence/Done; this belongs to `CV20.DS5.US3`.
- Automatically executing child stories after DS Plan approval.
- Release/push policy behavior from `CV20.DS7`.
- DS8 preferences/config overrides.

## Validation

- Focused Builder unit and CLI tests.
- Static checks.
- No external Navigator validation required because this story is runtime substrate.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
