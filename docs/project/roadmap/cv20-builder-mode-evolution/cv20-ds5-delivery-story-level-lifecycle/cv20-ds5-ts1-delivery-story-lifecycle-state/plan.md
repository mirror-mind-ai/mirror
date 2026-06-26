# Plan — CV20.DS5.TS1

## Objective

Persist and resume the minimal Delivery Story lifecycle state needed for aggregate DS flow: Navigator flow unit, child work package list, and aggregate checkpoint status.

## Scope

- Add cursor fields for:
  - `child_work_items`: ordered child User/Technical Story identifiers or labels;
  - `aggregate_checkpoint_status`: compact status for DS-level checkpoint progress.
- Keep default values empty so existing Ariad and non-Ariad behavior remains unchanged.
- Preserve these fields across lifecycle cursor updates where existing cursor fields are already preserved.
- Render the fields in cursor sync/inspection output where useful.
- Add focused tests for persistence, defaults, and preservation.

## Non-Goals

- Do not implement DS-level Plan checkpoint behavior; that is CV20.DS5.US2.
- Do not implement DS-level Validation, Debt Review, Coherence, or Done; that is CV20.DS5.US3.
- Do not alter the existing story-by-story lifecycle default.
- Do not implement release/push policy behavior from CV20.DS7.
- Do not implement method preferences/config overrides from CV20.DS9.

## Acceptance Behavior

```text
Given a delivery cursor is stored with child work items and aggregate checkpoint status
When Builder reads the delivery cursor
Then both fields are restored exactly
```

```text
Given an existing cursor has no DS lifecycle state fields
When Builder reads or renders it
Then child work items and aggregate checkpoint status default to empty values
And no lifecycle behavior changes
```

```text
Given cursor lifecycle operations preserve existing context
When Builder updates cadence, flow unit, or lifecycle checkpoints
Then child work items and aggregate checkpoint status are not silently discarded
```

## Validation Route

```bash
uv run pytest tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_flow_unit.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

E2E decision: not required. This is internal Builder runtime state substrate with CLI/unit validation.

## Implementation Contract

- Use TDD or characterization tests for behavior changes.
- Keep changes scoped to `CV20.DS5.TS1`.
- Use uv run for Python commands and tests.
- Do not use git add .; stage only story-scoped files.
- Commit validated changes locally.
- Do not push without explicit Navigator authorization.

## Stop Conditions

- The change starts implementing DS-level Plan/Validation instead of only state substrate.
- Existing story-by-story behavior changes by default.
- Runtime state migration requires a broader storage decision.
- Navigator decision is needed for push, release, or scope change.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation approved by Navigator instruction to proceed through TS1 without interruption.
