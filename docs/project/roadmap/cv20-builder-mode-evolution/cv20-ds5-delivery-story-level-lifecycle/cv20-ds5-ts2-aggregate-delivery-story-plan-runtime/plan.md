# Plan — CV20.DS5.TS2

## Objective

Implement the runtime substrate for aggregate Delivery Story Plan checkpoints: deterministic DS-level Plan rendering, approval, and aggregate checkpoint status updates when `navigator_flow_unit=delivery_story`.

## Scope

- Add a DS-level Plan checkpoint runtime operation/surface.
- Require active Ariad delivery state with:
  - `navigator_flow_unit=delivery_story`;
  - active item at `delivery_story` level;
  - child work packages supplied or present in cursor state.
- Persist aggregate checkpoint status:
  - `plan:pending` after DS Plan creation;
  - `plan:approved` after DS Plan approval.
- Preserve child work packages as traceable implementation/evidence units.
- Preserve default `story_by_story` Plan behavior.

## Non-Goals

- Do not implement Pi natural-language routing; that is `CV20.DS5.US2`.
- Do not implement DS-level Validation/Debt Review/Coherence/Done; that is `CV20.DS5.US3`.
- Do not automatically execute child work after DS Plan approval.
- Do not skip child artifacts or evidence.
- Do not change non-Ariad Builder behavior.

## Acceptance Behavior

```text
Given `navigator_flow_unit=delivery_story`
And a Delivery Story has child work packages
When Builder creates a DS-level Plan
Then the Plan is rendered at the Delivery Story level
And child work packages are listed as implementation/evidence units
And implementation remains blocked until DS Plan approval
```

```text
Given a DS-level Plan is pending approval
When Builder approves it
Then aggregate checkpoint status records plan approval
And Builder may proceed under the DS-level plan contract
```

```text
Given `navigator_flow_unit=story_by_story`
When Builder uses existing Plan behavior
Then User/Technical Story Plan checkpoints continue unchanged
And DS-level Plan is not silently used
```

## Validation Route

```bash
uv run pytest tests/unit/memory/builder/test_delivery_story_plan.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_flow_unit.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

E2E decision: not required. This is runtime substrate for the user-facing story.

## Implementation Contract

- Use TDD or characterization tests for behavior changes.
- Keep changes scoped to `CV20.DS5.TS2`.
- Use uv run for Python commands and tests.
- Do not use git add .; stage only story-scoped files.
- Commit validated changes locally.
- Do not push without explicit Navigator authorization.

## Approval Gate

- Plan approval was given for the runtime slice after reclassifying it as Technical Story.
