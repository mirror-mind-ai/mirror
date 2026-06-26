[< Story](index.md)

# Coherence — CV20.DS4.US2 Plan Package And Granularity Gate

## Process

The story was reworked after dogfooding exposed methodological inconsistencies in the narrower Plan gate. The final behavior now matches canonical Ariad:

- Delivery Stories expand before Plan.
- User Stories and Technical Stories are implementable units.
- Plan is a checkpoint for implementable work only.
- Approval is explicit before implementation.

## Project

Runtime state, Builder method DSL, Pi skill routing, roadmap docs, and Ariad docs now describe the same lifecycle shape:

```text
Pull -> Prepare -> Expand -> Plan -> Approval -> Implement
```

## Product

Manual validation confirmed the desired Navigator experience:

- Pulling `CV2.DS1` produced Pull, Prepare, and Expand surfaces.
- Expand materialized the Delivery Story and recommended `CV2.DS1.US1`.
- Planning the recommended User Story produced `index.md`, `plan.md`, and `test-guide.md`.
- Implementation remained blocked until Plan approval.

## Validation Evidence

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_lifecycle_ribbon.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
101 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
138 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## Result

Coherent. The story can be marked Done.
