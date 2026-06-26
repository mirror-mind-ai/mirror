[< Story](index.md)

# Review — CV20.DS1.TS1 Method Definition Model

## Changed Surface

- Added `src/memory/builder/` as the Builder method support package.
- Added `src/memory/builder/method_definition.py` with typed method-definition objects and structural validation.
- Added focused unit tests in `tests/unit/memory/builder/test_method_definition.py`.

## Refactoring Done

- Kept the implementation model-only and avoided introducing parser, fixture, CLI, persistence, or Builder load changes.
- Kept policies and open questions as generic mappings so Ariad-specific policy payloads remain data, not hard-coded behavior.

## Refactoring Considered But Not Done

- A richer validation result object instead of raising `MethodDefinitionError`. Deferred because the first slice only needs fail-fast structural validation.
- Pydantic models. Deferred because standard-library dataclasses are sufficient until method file parsing and user-facing errors require richer schema behavior.

## Debt Paid

None. This story creates new substrate.

## New Debt Introduced

None identified during review.

## Debt Carried Forward

None.

## Review Decision

Recommendation: no debt action required. Proceed to Coherence after Navigator confirmation.
