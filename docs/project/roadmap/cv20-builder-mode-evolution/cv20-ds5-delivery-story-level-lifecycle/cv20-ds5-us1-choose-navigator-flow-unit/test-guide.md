[< Story](index.md)

# Test Guide — CV20.DS5.US1

## Automated Validation

Run focused checks for any changed Builder flow-unit model, surface, persistence, or CLI route.

Expected focused validation if runtime/CLI changes:

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff check src/memory tests/unit/memory
uv run ruff format --check src/memory tests/unit/memory
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

If implementation is documentation-only after discovery, run `git diff --check` and record why no runtime tests apply.

## E2E Decision

Browser/UI E2E is not required. The observable surface is Builder CLI/Pi behavior.

## Navigator Validation

Validate the decision surface and default behavior:

1. **Default flow unit**

Expected observation:

- Builder reports `story_by_story` when no flow unit has been selected.
- Builder identifies it as default/current behavior.

Pass condition: existing behavior remains unchanged by default.

Fail condition: Builder silently switches an existing DS to aggregate flow.

2. **Flow-unit choice surface**

Expected observation:

- Builder presents `story_by_story` and `delivery_story`.
- Builder explains that child stories remain traceable in both modes.
- Builder performs no Plan/Implement/Validate work from this surface alone.

Pass condition: the Navigator can understand and choose the flow unit.

Fail condition: Builder treats `delivery_story` as permission to implement an unexpanded DS or to skip evidence.

3. **Selected delivery-story flow**

Expected observation:

- Builder can show the selected flow unit as `delivery_story`.
- Child work packages remain visible.
- Later DS-level Plan/Validation remain future work unless implemented by later stories.

Pass condition: aggregate flow is selected/visible without collapsing traceability.

Fail condition: child stories disappear or implementation starts without plan approval.

## Validation Evidence

Pending implementation and validation.
