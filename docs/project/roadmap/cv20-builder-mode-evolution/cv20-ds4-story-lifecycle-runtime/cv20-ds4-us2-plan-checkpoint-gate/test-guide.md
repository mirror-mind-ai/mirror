[< Story](index.md)

# Test Guide — CV20.DS4.US2 Plan Checkpoint Gate

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
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
137 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## Navigator Validation Through Pi/Mirror

With `sandbox-pet-store` reset, activate Builder Mode, pull `CV2.DS1`, prepare it, then run:

```text
planeje o item puxado
```

Pass condition:

- Output includes `<<<ARIAD:PLAN_CHECKPOINT>>>` and matching end marker.
- Output includes `PLAN CHECKPOINT`.
- Ribbon shows `✓ Pull | ✓ Prepare | ◉ Plan`.
- Active item is `CV2.DS1`.
- Pending confirmation is `navigator_approval`.
- The surface shows the full `plan.md` artifact path.
- The visible response includes the actual plan content, not only runtime metadata.
- The surface says implementation remains blocked until approval.

Fail condition:

- Builder starts implementation.
- Builder mutates project files.
- Plan renders without Prepare having happened first.
- Runtime cursor does not record the checkpoint/pending confirmation.
- No `plan.md` artifact path appears.
