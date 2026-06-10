[< Story](index.md)

# Test Guide — CV20.DS2.US1 Adopt Ariad For A Journey

Planned after `CV20.DS2.TS1 — Runtime Method State Sync`.

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py
40 passed

uv run ruff check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
All checks passed

uv run ruff format --check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
121 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

CLI smoke support passed for:

```bash
uv run python -m memory build adopt --journey builder-mode-evolution --method ariad
uv run python -m memory build inspect-method --journey builder-mode-evolution
```

## Navigator Validation Through Pi/Mirror

Ask in natural language while Builder Mode is active for this journey:

```text
adote Ariad como método builder desta jornada
```

Then ask:

```text
qual método builder governa esta jornada?
```

Expected observation:

- Mirror uses the Builder skill's adoption route;
- adoption report names journey `builder-mode-evolution`;
- adoption report says Ariad is adopted;
- follow-up inspection says adopted method is `ariad`;
- no story lifecycle work is executed.

Navigator validation passed in Pi/Mirror natural language using the `sandbox-pet-store` journey. Mirror adopted Ariad for the active journey, follow-up inspection reported `adopted method: ariad`, and the response explicitly stated that no templates, delivery cursor, or story lifecycle were executed.
