# Plan — CV20.DS6.US5

## Objective

Make the RS-level close path coherent: review completed CR outcomes, check coherence without mutation, close the RS with summary preserved, clear active Refinement cursor, and keep Delivery Work untouched.

## Scope

- Deliver Close A Refinement Story as an observable slice.
- Keep the implementation narrow enough to validate at the Plan-defined checkpoint.

## Non-Goals

- Do not implement sibling roadmap item: Builder Documentation And Migration.
- Do not implement sibling roadmap item: Refinement Workbench And Flow.
- Do not implement sibling roadmap item: Define Delivery Story Release Intent.
- Do not implement sibling roadmap item: Release And Push Policies.
- Do not implement sibling roadmap item: Debt Ledger And Refactor Loop.
- Do not implement sibling roadmap item: Method Preferences And Overrides.

## Acceptance Behavior

```text
Given the starting state needed for Close A Refinement Story
When the Navigator exercises Close A Refinement Story
Then the planned observable behavior is visible
And out-of-scope sibling roadmap items remain untouched
```

## Validation Route

- Run automated tests that cover the planned behavior.
- Provide a Navigator-visible route with expected observation, pass condition, and fail condition.

E2E decision: required unless Navigator explicitly accepts a narrower fixture-level validation route

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV20.DS6.US5`.
- Use uv run for Python commands and tests.
- Do not use git add .; commit only story-scoped files.
- Use descriptive English commit messages explaining why.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
