[< Story](index.md)

# Test Guide — CV20.DS4.US1 Pull And Prepare

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
51 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
133 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## Navigator Validation Through Pi/Mirror

With Builder Mode active for `sandbox-pet-store` and Ariad adopted/cursor synced:

```text
puxe o item Checkout Flow como user story para esta jornada porque é a próxima capacidade candidata
prepare o item puxado
```

Pass condition:

- Pull report appears and names `Checkout Flow`.
- Pull report records level `user_story` and why-now text.
- Pull report says next event is Prepare.
- Prepare report appears for the pulled item.
- Prepare report includes context summary, story shape assessment, risks, and applicable rules.
- Prepare report says next event is Plan.
- Response states Plan/Implement/later lifecycle work was not executed.

Fail condition:

- Builder creates a Plan artifact during this story.
- Builder starts implementation.
- Builder changes roadmap files or story statuses.
- Cursor is not updated after Pull/Prepare.

## Navigator Validation Evidence

Pull validation passed in Pi/Mirror with `sandbox-pet-store`. The Pull response rendered the Ariad `Delivery Story Identified` grammar, identified `CV2.DS1` as the active Delivery Story, showed roadmap placement, commitment, next event `Prepare`, and preserved the boundary that Prepare, Plan, and later lifecycle work were not executed.

Prepare validation passed in Pi/Mirror with `sandbox-pet-store`. The Prepare response rendered the Ariad `Prepare Field Reading` grammar, showed active item `CV2.DS1`, terrain read, story shape, risks, applicable rules, next event `Plan`, and preserved the boundary that Plan was not created and implementation remains blocked.
