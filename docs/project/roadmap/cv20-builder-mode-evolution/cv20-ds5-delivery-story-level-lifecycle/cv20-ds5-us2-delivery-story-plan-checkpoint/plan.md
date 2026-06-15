# Plan — CV20.DS5.US2

## Objective

Implement the aggregate Delivery Story Plan checkpoint so Navigator can approve one DS-level plan when `navigator_flow_unit` is `delivery_story`, while preserving child stories as traceable Driver work packages.

## Scope

- Add a DS-level Plan checkpoint operation/surface, likely as a new Builder command or mode-specific route.
- Require active Ariad delivery state with:
  - `navigator_flow_unit=delivery_story`;
  - an active Delivery Story or explicit parent DS context;
  - child work packages available in cursor state or supplied by the command.
- Render a deterministic Ariad surface showing:
  - Delivery Story target;
  - child work packages;
  - aggregate objective/scope/acceptance/validation route;
  - approval gate and blocked implementation boundary.
- Persist aggregate checkpoint status when the DS Plan is created and approved.
- Preserve existing `plan-item` behavior for User/Technical Stories and for default `story_by_story` flow.

## Non-Goals

- Do not implement DS-level Validation/Debt Review/Coherence/Done; that is CV20.DS5.US3.
- Do not automatically execute child work after DS Plan approval.
- Do not skip child story artifacts, evidence, or implementation traceability.
- Do not implement release/push policy behavior from CV20.DS6.
- Do not implement method preferences/config overrides from CV20.DS8.
- Do not alter non-Ariad Builder behavior.

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
When Navigator approves it
Then aggregate checkpoint status records plan approval
And Builder may proceed to implementation under the DS-level plan contract
```

```text
Given `navigator_flow_unit=story_by_story`
When Builder uses existing Plan behavior
Then User/Technical Story Plan checkpoints continue unchanged
And DS-level Plan is not silently used
```

## Validation Route

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

Navigator-visible CLI validation:

1. Set/prepare `delivery_story` flow with child work packages.
2. Render DS-level Plan checkpoint.
3. Approve DS-level Plan.
4. Inspect cursor state and confirm aggregate checkpoint status records approval.
5. Confirm default story-by-story Plan behavior still works.

E2E decision: browser/UI E2E is not required; Builder CLI/runtime surfaces are the validation surface.

## Implementation Contract

- Use TDD or characterization tests for behavior changes.
- Keep changes scoped to `CV20.DS5.US2`.
- Use uv run for Python commands and tests.
- Do not use git add .; stage only story-scoped files.
- Commit validated changes locally.
- Do not push without explicit Navigator authorization.

## Stop Conditions

- The change starts implementing DS-level Validation/Done.
- The change makes Delivery Stories opaque implementation units.
- Existing story-by-story Plan behavior changes by default.
- Non-Ariad Builder behavior changes.
- Navigator decision is needed for push, release, or scope change.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
