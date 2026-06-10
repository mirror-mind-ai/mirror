[< Story](index.md)

# Test Guide — CV20.DS2.TS1 Runtime Method State Sync

This Technical Story is validated through automated internal evidence.

## Focused Tests

```bash
uv run pytest tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/cli/test_build.py
```

Expected result: Builder method adoption state tests and existing Builder CLI tests pass.

## Lint And Format

```bash
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
```

Expected result: both commands pass.

## Type Check

```bash
uv run mypy src/memory/builder src/memory/cli/build.py
```

Expected result: mypy passes for the Builder package and Builder CLI.

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/cli/test_build.py
17 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
121 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## Navigator Validation

Manual Navigator validation is not required for this Technical Story. The Navigator-visible adoption behavior belongs to `CV20.DS2.US1`.
