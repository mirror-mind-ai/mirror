[< Story](index.md)

# Test Guide — CV20.DS5.US2

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

## E2E Decision

Browser/UI E2E is not required. The observable surface is Builder CLI/runtime behavior.

## Navigator Validation

Validate through Builder CLI surfaces:

1. Configure or simulate `navigator_flow_unit=delivery_story` with child work packages.
2. Render the DS-level Plan checkpoint.
3. Confirm child work packages remain visible.
4. Approve the DS-level Plan.
5. Confirm aggregate checkpoint status records approval.
6. Confirm default story-by-story behavior is unchanged.

## Validation Evidence

Pending implementation and validation.
