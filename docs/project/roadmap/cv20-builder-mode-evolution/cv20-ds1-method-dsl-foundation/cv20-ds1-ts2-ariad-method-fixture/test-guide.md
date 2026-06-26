[< Story](index.md)

# Test Guide — CV20.DS1.TS2 Ariad Method Fixture

This Technical Story is validated through automated internal evidence.

## Focused Tests

```bash
uv run pytest tests/unit/memory/builder/test_ariad_method.py
```

Expected result: all Ariad method fixture tests pass.

## Lint And Format

```bash
uv run ruff check src/memory tests/unit/memory/builder/test_ariad_method.py
uv run ruff format --check src/memory tests/unit/memory/builder/test_ariad_method.py
```

Expected result: both commands pass without changes required.

## Type Check

```bash
uv run mypy src/memory/builder
```

Expected result: mypy passes for the Builder package.

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py
17 passed

uv run ruff check src/memory tests/unit/memory/builder/test_ariad_method.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder/test_ariad_method.py
116 files already formatted

uv run mypy src/memory/builder
Success
```

## Navigator Validation

Manual Navigator validation is not required for this Technical Story unless the implementation exposes a design ambiguity that needs product or process judgment.
