[< Story](index.md)

# Test Guide — CV20.DS3.US1 Resume Ariad Journey

## Automated Validation

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

## Navigator Validation Through Pi/Mirror

Run:

```text
ative Builder Mode na jornada sandbox-pet-store
```

Pass condition:

- Output includes `■ BUILDER RESUME`.
- Output names journey `sandbox-pet-store`.
- Output shows adopted method `ariad`.
- Output shows resumable `yes` when cursor exists.
- Output shows active item, active checkpoint, pending confirmation, last delivery event, and allowed next actions.
- Output states no story lifecycle work was executed.

Fail condition:

- Resume surface is absent for an adopted/cursor-synced journey.
- Builder executes lifecycle work during load.
- Cursor fields are missing.

## Navigator Validation Evidence

Pi/Mirror validation passed with `sandbox-pet-store`. Builder Mode load rendered `■ BUILDER RESUME`, method `ariad`, resumable `sim`, roadmap position, active item, pending confirmation, allowed next actions, and preserved the boundary that the Navigator chooses the next movement. The skill was tightened afterward to preserve all resume fields verbatim, including active checkpoint and last delivery event.
