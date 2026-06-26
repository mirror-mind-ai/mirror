[< Story](index.md)

# Test Guide — CV20.DS4.US0 Inspect Pull Candidates

## Automated Validation

```text
uv run pytest tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
```

## Navigator Validation

```text
mostre o roadmap desta jornada
```

Pass condition: output includes `■ Ariad Roadmap Snapshot`, `■ Ariad Pull Candidates`, available candidates, recommended pull, and the boundary that no item was pulled.

## Navigator Validation Evidence

Pi/Mirror validation passed with `sandbox-pet-store`. The response rendered `■ Ariad Roadmap Snapshot` from `docs/project/roadmap/index.md`, listed CV1/CV2/CV3, rendered `■ Ariad Pull Candidates`, listed CV2.DS1–CV2.DS3, recommended CV2.DS1, and preserved the boundary that the roadmap was inspected only and no lifecycle work was executed.
