[< CV20.DS4](../index.md)

# CV20.DS4.US4 — Validation Checkpoint

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

After implementation, Builder presents a deterministic Validation Checkpoint that combines automated evidence, E2E decision/evidence, and a concrete Navigator validation route.

---

## Context

Plan defines validation obligations. Ariad requires User Stories to remain Navigator-visible; automated tests support but do not replace validation for user-visible behavior.

---

## Acceptance Behavior

```text
Given an active item has an approved Plan and implementation changes exist
When Builder reaches Validation
Then Builder renders a Validation Checkpoint surface
And shows required automated checks and results
And shows whether E2E was required, run, skipped, or explicitly waived
And provides a Navigator-visible validation route with expected observation, pass condition, and fail condition
```

```text
Given required validation evidence is missing
When Builder attempts to move past Validation
Then Builder blocks progression
And names the missing evidence or required Navigator decision
```

---

## Scope

- Add Validation lifecycle operation and deterministic surface.
- Read validation obligations from Plan package/method contracts.
- Record validation evidence in runtime state and/or story package.
- Support E2E required/waived evidence language.
- Stop for Navigator validation acceptance.

---

## Out Of Scope

- Debt Review.
- Coherence.
- Done/history recording.
- Accelerated/autonomous cadence bypass behavior.

---

## Implementation Notes

Runtime support adds `validate-item`, which renders deterministic `VALIDATION_CHECKPOINT` surfaces, records validation state in the delivery cursor, materializes `validation.md` when a story package path is available, and blocks progression when automated evidence, E2E evidence, or explicit Navigator acceptance is missing. Providing a Navigator route is not treated as acceptance.

Manual dogfooding validated both states:

- pending Navigator validation when `--navigator-accepted` is absent;
- passed validation when the Navigator explicitly accepts the validation route/evidence.

## Validation

Focused tests plus Pi/Mirror natural-language validation against sandbox-pet-store.

Automated validation so far:

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_lifecycle_ribbon.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
106 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
138 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```
