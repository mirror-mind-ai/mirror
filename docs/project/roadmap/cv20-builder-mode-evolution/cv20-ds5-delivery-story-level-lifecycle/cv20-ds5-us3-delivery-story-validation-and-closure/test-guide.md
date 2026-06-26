[< Story](index.md)

# Test Guide — CV20.DS5.US3

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

## E2E Decision

Pi/Builder natural interaction validation is required. Browser/UI E2E is not required unless implementation introduces browser-facing behavior.

## Navigator Validation

Validate in Builder Mode as the Navigator:

1. Prepare a sandbox Delivery Story with `delivery_story` flow and approved DS Plan.
2. Ask Builder to validate the Delivery Story result.
3. Confirm DS-level Validation is returned as a verbatim Ariad surface.
4. Proceed through Debt Review, Coherence, and Done at DS level.
5. Confirm child work packages remain visible as evidence units.
6. Confirm no push or release occurs.

## Validation Evidence

Pending implementation and validation.
