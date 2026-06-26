[< Story](index.md)

# Test Guide — CV20.DS5.TS3

## Automated Validation

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

## Sandbox Validation

1. Use `sandbox-pet-store` with an aggregate Delivery Story lifecycle.
2. Close the DS through Validation, Debt Review, Coherence, and Done.
3. Inspect the canonical DS package and confirm these files exist:
   - `validation.md`
   - `review.md`
   - `coherence.md`
   - `done.md`
4. Confirm no synthetic fallback package was created for checkpoint artifacts.

## E2E Decision

Browser/UI E2E is not required. Filesystem/runtime artifact validation is sufficient.

## Validation Evidence

Pending implementation and validation.
