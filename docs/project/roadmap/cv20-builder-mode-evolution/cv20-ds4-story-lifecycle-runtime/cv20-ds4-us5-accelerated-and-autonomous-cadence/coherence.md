[< Story](index.md)

# Coherence — CV20.DS4.US5 Accelerated And Autonomous Cadence

## Process

The story was implemented conservatively after the full Ariad happy path was already available. This prevented accelerated/autonomous cadence from becoming a shortcut around product judgment. The implementation activates the profiles and proves one safe continuation route while preserving all hard gates.

## Project

The runtime now distinguishes cadence selection from lifecycle semantics:

```text
cadence changes stop frequency, not method truth
```

`accelerated` and `autonomous` are available profiles, but they do not erase Ariad checkpoints. The first continuation behavior operates only after Debt Review is complete and only when the required Coherence/Done evidence is supplied.

## Product

Manual dogfooding confirmed the desired Navigator experience:

- accelerated Pull of a Delivery Story continued through Prepare and Expand;
- the runtime stopped before Plan/Implementation;
- Plan approval and Navigator validation acceptance remained hard gates;
- Debt Review remained explicit;
- after Debt Review, accelerated continuation reached Coherence and Done with deterministic surfaces.

## Validation Evidence

Automated validation:

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_lifecycle_ribbon.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
118 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
138 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

Manual validation:

- Reset `/Users/alissonvale/Code/sandbox-pet-store` with `--full`.
- Set cadence to `accelerated`.
- Ran the lifecycle from Pull through Done.
- Confirmed accelerated cadence did not cross hard gates.
- Confirmed final Coherence/Done continuation behaved as expected.

## Result

Coherent. The story can be marked Done.
