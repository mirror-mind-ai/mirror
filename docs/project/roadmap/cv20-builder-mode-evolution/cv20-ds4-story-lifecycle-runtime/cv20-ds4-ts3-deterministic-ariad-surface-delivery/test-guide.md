[< Story](index.md)

# Test Guide — CV20.DS4.TS3 Deterministic Ariad Surface Delivery

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

## Automated Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
68 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
138 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## Expected

Ariad runtime output contains explicit transport markers such as:

```text
<<<ARIAD:PLAN_CHECKPOINT>>>
...
<<<END:PLAN_CHECKPOINT>>>
```
