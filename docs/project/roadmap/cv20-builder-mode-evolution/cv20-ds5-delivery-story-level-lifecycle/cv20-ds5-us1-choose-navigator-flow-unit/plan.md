# Plan — CV20.DS5.US1

## Objective

Introduce the Navigator Flow Unit decision so an expanded Delivery Story can be governed either story-by-story or as one aggregate Delivery Story lifecycle from the Navigator's perspective.

## Scope

- Define the flow-unit concept and vocabulary in Builder/Ariad runtime code or method data:
  - `story_by_story`: current behavior; each child US/TS is planned, approved, validated, reviewed, and closed independently.
  - `delivery_story`: the DS becomes the Navigator-facing lifecycle unit; child US/TS items remain Driver work packages and evidence containers.
- Render a deterministic decision surface after DS expansion or through an explicit Builder command.
- Preserve `story_by_story` as the default for backwards compatibility.
- Ensure non-Ariad journeys continue to behave as they do today.
- If runtime state is touched, persist/resume the selected flow unit narrowly enough for this story.

## Non-Goals

- Do not implement DS-level Plan approval beyond the flow-unit choice; that is CV20.DS5.US2.
- Do not implement DS-level Validation/Debt Review/Coherence/Done; that is CV20.DS5.US3.
- Do not build the full aggregate lifecycle state machine if a narrower decision model suffices; broader lifecycle state belongs to CV20.DS5.TS1.
- Do not change release/push policy behavior from CV20.DS7.
- Do not implement DS8 method preferences/config overrides.
- Do not remove or flatten child story artifacts.

## Acceptance Behavior

```text
Given an Ariad Delivery Story has been expanded
When Builder asks for the Navigator flow unit
Then it offers `story_by_story` and `delivery_story`
And describes the checkpoint consequences of each option
And performs no implementation work
```

```text
Given no flow unit has been selected
When Builder resumes the Delivery Story
Then the effective flow unit is `story_by_story`
And the source is shown as the default behavior
```

```text
Given the Navigator selects `delivery_story`
When Builder inspects or resumes active delivery work
Then the selected flow unit is visible
And child stories remain listed as traceable work packages
```

## Validation Route

Expected focused validation if runtime/CLI changes:

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff check src/memory tests/unit/memory
uv run ruff format --check src/memory tests/unit/memory
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

Navigator-visible validation:

1. Expand or inspect a Delivery Story.
2. Confirm Builder presents `story_by_story` and `delivery_story` as explicit choices.
3. Confirm `story_by_story` is the default when no choice exists.
4. Select or simulate `delivery_story` and confirm resume/inspection shows the selected flow unit without executing implementation.

E2E decision: browser/UI E2E is not required; Builder CLI/Pi-visible behavior is the validation surface.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV20.DS5.US1`.
- Use uv run for Python commands and tests.
- Do not use git add .; stage only story-scoped files.
- Commit validated changes locally.
- Do not push without explicit Navigator authorization.
- Use descriptive English commit messages explaining why.

## Stop Conditions

- The change starts implementing DS-level Plan/Validate/Done instead of only choosing the flow unit.
- The runtime state change becomes broad enough to require CV20.DS5.TS1 first.
- The default `story_by_story` behavior for existing Ariad journeys would change.
- Non-Ariad Builder behavior would change.
- Navigator decision is needed for commit, push, release, or scope change.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
