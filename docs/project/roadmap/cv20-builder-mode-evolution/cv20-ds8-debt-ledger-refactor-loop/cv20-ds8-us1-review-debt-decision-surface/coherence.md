[< Story](index.md)

# Coherence — CV20.DS8.US1 Review Debt Decision Surface

## Process

This story adds the first runtime form of Ariad Debt Review. It does not attempt to solve the full debt ledger/refactor loop; it establishes the checkpoint surface and transition boundary so validated work cannot silently move to Coherence or Done without facing debt.

## Project

The lifecycle now has a coherent validated-to-review transition:

```text
Validation Passed -> Debt Review -> Review Complete -> Coherence
```

For the validated no-debt path, the runtime cursor moves to:

```text
last_delivery_event: review_complete
pending_confirmation: none
active_checkpoint: none
```

For unresolved debt decisions, Builder stops at:

```text
pending_confirmation: navigator_debt_decision
active_checkpoint: review_decision
```

## Product

The Navigator sees debt findings and an explicit decision instead of an implicit “looks fine”. This preserves Ariad’s promise that closure requires reviewing debt, not merely passing tests.

## Validation Evidence

Automated validation:

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_lifecycle_ribbon.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
109 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
138 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

Manual validation:

- Ran Debt Review in `/Users/alissonvale/Code/sandbox-pet-store` after Validation passed.
- Confirmed deterministic surface transport.
- Confirmed no-action decision completed the checkpoint and allowed Coherence.

## Result

Coherent. The story can be marked Done.
