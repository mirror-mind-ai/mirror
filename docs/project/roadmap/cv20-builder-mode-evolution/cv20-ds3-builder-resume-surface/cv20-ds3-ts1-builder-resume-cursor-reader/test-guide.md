[< Story](index.md)

# Test Guide — CV20.DS3.TS1 Builder Resume Cursor Reader

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder/test_resume_state.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory/builder tests/unit/memory/builder
uv run ruff format --check src/memory/builder tests/unit/memory/builder
uv run mypy src/memory/builder
```

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_resume_state.py tests/unit/memory/builder/test_roadmap_position.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
51 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
131 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## Pass Condition

- Non-adopted journeys return non-resumable state with `adoption_required`.
- Ariad-adopted journeys without cursor return non-resumable state with `cursor_sync_required`.
- Ariad-adopted journeys with cursor return resumable state and expose cursor fields.
- Pending confirmation constrains allowed next-action hints.
- Helper is read-only and does not mutate runtime state.
