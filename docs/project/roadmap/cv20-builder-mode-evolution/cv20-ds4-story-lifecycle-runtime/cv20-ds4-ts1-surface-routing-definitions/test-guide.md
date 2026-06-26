[< Story](index.md)

# Test Guide — CV20.DS4.TS1 Surface Routing Definitions

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/cli/test_build.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/cli/test_build.py
62 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
135 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

CLI smoke for `sandbox-pet-store` rendered both `■ Ariad Roadmap Snapshot` and `■ Ariad Pull Candidates`.

## Expected

`memory build pull-candidates --method ariad` renders both `■ Ariad Roadmap Snapshot` and `■ Ariad Pull Candidates` according to the Ariad surface route.
