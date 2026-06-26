[< Story](index.md)

# Test Guide — CV20.DS4.TS2 Lifecycle Contract Definitions

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/cli/test_build.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/cli/test_build.py
62 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
137 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## Expected

- Ariad declares contracts for every lifecycle phase.
- Plan contract defines acceptance behavior, validation route, E2E decision, and approval gate.
- Implement contract defines TDD/story-scope/E2E rules.
- Validation contract defines E2E execution/evidence rules.
- `inspect-method ariad` shows contracts.
