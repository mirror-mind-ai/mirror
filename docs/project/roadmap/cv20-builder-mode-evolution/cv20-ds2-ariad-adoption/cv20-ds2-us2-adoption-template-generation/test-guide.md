[< Story](index.md)

# Test Guide — CV20.DS2.US2 Adoption Template Generation

## Automated Validation

Run:

```bash
uv run pytest tests/unit/memory/builder/test_template_generation.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

## Validation Evidence

Recorded during implementation:

```text
uv run pytest tests/unit/memory/builder/test_template_generation.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_method_adoption.py tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py
53 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
123 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

## CLI Smoke Support

Against an adopted sandbox journey with a project path:

```bash
uv run python -m memory build prepare-templates --journey sandbox-pet-store --method ariad
```

Expected output includes:

```text
■ Ariad Template Preparation

journey
sandbox-pet-store

method
ariad

checked
...

created
...

preserved
...

pending
runtime delivery cursor sync
story lifecycle execution
```

## Navigator Validation Through Pi/Mirror

In Pi/Mirror with Builder Mode active for an Ariad-adopted sandbox journey:

```text
prepare os templates Ariad desta jornada
```

Pass condition:

- Mirror runs the contained template preparation operation.
- The report names the active journey.
- The report lists checked files.
- The report lists created or preserved templates.
- Existing files are not overwritten.
- The response states that no story lifecycle work was executed.

Navigator validation passed in Pi/Mirror natural language using the `sandbox-pet-store` journey. Mirror rendered `■ Ariad Template Preparation`, named journey `sandbox-pet-store`, method `ariad`, listed the prepared Ariad template files, and stated that no story cycle was executed while delivery cursor, active item resolution, and lifecycle remain pending.

Fail condition:

- The operation creates lifecycle story work.
- The operation changes story status.
- Existing human-authored files are overwritten.
- The report omits pending lifecycle/cursor limitations.
