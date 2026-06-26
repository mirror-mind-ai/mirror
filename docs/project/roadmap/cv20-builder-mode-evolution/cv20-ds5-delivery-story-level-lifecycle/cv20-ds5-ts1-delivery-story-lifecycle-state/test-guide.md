[< Story](index.md)

# Test Guide — CV20.DS5.TS1

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_flow_unit.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

## E2E Decision

Not required. This is internal Builder runtime state substrate.

## Validation Evidence

Pending implementation and validation.
