[< Story](index.md)

# Test Guide — CV20.DS1.TS1 Method Definition Model

This Technical Story is validated through automated internal evidence.

## Focused Tests

```bash
uv run pytest tests/unit/memory/builder/test_method_definition.py
```

Expected result: all method-definition model tests pass.

## Lint And Format

```bash
uv run ruff check src/memory tests/unit/memory/builder/test_method_definition.py
uv run ruff format --check src/memory tests/unit/memory/builder/test_method_definition.py
```

Expected result: both commands pass without changes required.

## Type Check

```bash
uv run mypy src/memory
```

Expected result: mypy passes.

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py
9 passed

uv run ruff check src/memory tests/unit/memory/builder/test_method_definition.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder/test_method_definition.py
Success after formatting the new test file

uv run mypy src/memory/builder
Success
```

Full-project mypy was also run as planned and failed on pre-existing errors in unrelated modules. No mypy errors were reported for `src/memory/builder`.

## Navigator Validation

Manual Navigator validation is not required for this Technical Story unless the implementation exposes a design ambiguity that needs product or process judgment.
