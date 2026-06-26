# Plan — CV20.DS5.US3

## Objective

Expose aggregate Delivery Story validation and closure through Builder Mode so the Navigator can validate the DS result and proceed through DS-level Debt Review, Coherence, and Done while child work packages remain traceable.

## Scope

- Provide DS-level Validation behavior for active Ariad work with:
  - `navigator_flow_unit=delivery_story`;
  - aggregate plan approved;
  - child work packages visible in cursor state.
- Provide DS-level Debt Review, Coherence, and Done behavior after DS-level Validation.
- Ensure deterministic Ariad surfaces are returned verbatim before commentary.
- Keep child work packages listed as evidence units.
- Preserve default `story_by_story` lifecycle behavior and non-Ariad behavior.
- Update Builder Mode instructions if natural-language routing is needed.

## Non-Goals

- Do not implement release intent, push, or release policy behavior from `CV20.DS7`.
- Do not implement method preferences/config overrides from `CV20.DS9`.
- Do not remove child story artifacts or evidence.
- Do not auto-push or release at DS Done.
- Do not silently close a DS without Navigator validation acceptance.

## Acceptance Behavior

```text
Given `navigator_flow_unit=delivery_story`
And aggregate checkpoint status includes `plan:approved`
When the Navigator validates the Delivery Story result
Then Builder renders DS-level Validation
And records validation status at aggregate checkpoint level
And child work packages remain visible
```

```text
Given DS-level Validation has passed
When Builder proceeds through Debt Review, Coherence, and Done
Then the DS-level lifecycle closes under the aggregate contract
And hard gates remain explicit for debt, push, release, and Done/history boundaries
```

```text
Given `navigator_flow_unit=story_by_story`
When Builder validates or closes work
Then existing child-story lifecycle behavior remains unchanged
```

## Validation Route

Automated/static validation:

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

Navigator-facing validation in Pi/Builder:

1. Use a sandbox Delivery Story with `delivery_story` flow and approved DS Plan.
2. Ask Builder naturally to validate the Delivery Story result.
3. Confirm DS-level Validation surface is returned verbatim and accepted.
4. Proceed through DS-level Debt Review, Coherence, and Done.
5. Confirm no child-story Navigator closure is required and no push/release occurs.

E2E decision: Pi/Builder natural interaction is required; browser/UI E2E is not required unless the story implementation introduces browser-facing behavior.

## Implementation Contract

- Keep changes scoped to `CV20.DS5.US3`.
- Use uv run for Python commands and tests.
- Do not use git add .; stage only story-scoped files.
- Commit validated changes locally.
- Do not push without explicit Navigator authorization.

## Stop Conditions

- The change starts implementing CV20.DS7 release/push policy.
- The change closes child stories invisibly without evidence.
- Existing story-by-story closure behavior changes by default.
- Non-Ariad Builder behavior changes.
- Navigator decision is needed for push, release, or scope change.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
