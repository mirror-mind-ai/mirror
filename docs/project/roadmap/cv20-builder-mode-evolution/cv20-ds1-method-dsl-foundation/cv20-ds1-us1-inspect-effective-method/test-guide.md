[< Story](index.md)

# Test Guide — CV20.DS1.US1 Inspect Effective Method

## Automated Tests

```bash
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py
```

Expected result: build CLI method-inspection tests and builder method tests pass.

## Lint And Format

```bash
uv run ruff check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
uv run ruff format --check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
```

Expected result: both commands pass without changes required.

## Type Check

```bash
uv run mypy src/memory/builder src/memory/cli/build.py
```

Expected result: mypy passes for Builder package and Builder CLI.

## CLI Smoke Support

Inspect Ariad as an available built-in method:

```bash
uv run python -m memory build inspect-method ariad
```

Inspect the journey's effective method state before adoption:

```bash
uv run python -m memory build inspect-method --journey builder-mode-evolution
```

Expected observation: the CLI output distinguishes available built-in defaults from effective journey configuration and recommends Ariad adoption without executing adoption.

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_method_definition.py
25 passed

uv run ruff check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
All checks passed

uv run ruff format --check src/memory tests/unit/memory/cli/test_build.py tests/unit/memory/builder
119 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

CLI smoke support passed for:

```bash
uv run python -m memory build inspect-method ariad
uv run python -m memory build inspect-method --journey builder-mode-evolution
```

## Navigator Validation Through Pi/Mirror

Ask in natural language while Builder Mode is active for this journey:

```text
qual método builder governa esta jornada?
```

Expected observation:

- if no Builder journey is active, Mirror says no Builder journey is active yet and asks the user to activate or name one;
- if Builder Mode is active for `builder-mode-evolution`, Mirror uses the Builder skill's inspection route;
- output names journey `builder-mode-evolution`;
- output says adopted method is `none`;
- output lists Ariad as available;
- output recommends Ariad adoption without executing adoption.

Navigator validation passed in Pi/Mirror natural language. The active journey validation correctly reported that `builder-mode-evolution` has not adopted a Builder method yet, listed Ariad as available, and did not execute adoption.
