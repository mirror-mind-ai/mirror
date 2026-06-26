[< Story](index.md)

# Coherence — CV20.DS4.US4 Validation Checkpoint

## Process

US4 was validated through dogfooding against `/Users/alissonvale/Code/sandbox-pet-store`. The first manual validation correctly produced a pending Navigator validation checkpoint. The acceptance path initially exposed a runtime bug: `navigator_validation` was created as a pending confirmation, but rerunning validation with acceptance was blocked by the generic pending-confirmation guard.

That bug was fixed in commit `ef6b3c5`, allowing explicit Navigator acceptance to complete Validation.

A second dogfooding pass exposed a broader issue: successful acceptance was summarized conversationally instead of returning the deterministic surface. That was addressed by `CV20.DS4.TS6 — Surface Transport Contract`, making Ariad surface transport a phase-independent method contract.

## Project

The Builder runtime now supports this coherent sequence:

```text
Plan Approved -> Implement -> Validate Pending -> Navigator Accepted -> Validation Passed
```

The cursor transitions validated manually:

```text
pending_confirmation: navigator_validation
last_delivery_event: validate
```

then, after explicit Navigator acceptance:

```text
pending_confirmation: none
active_checkpoint: none
last_delivery_event: validation_passed
```

## Product

The Navigator sees a deterministic boxed `VALIDATION_CHECKPOINT` surface that names:

- active item;
- automated checks and status;
- E2E decision/evidence;
- Navigator route;
- Navigator acceptance state;
- expected observation;
- pass/fail conditions;
- missing evidence;
- validation contract;
- validation artifact path;
- boundary.

The accepted validation surface reports:

```text
status
passed

navigator accepted
yes

missing evidence
✓ none

boundary
Validation is complete; Builder may proceed to Debt Review.
```

## Validation Evidence

Automated validation:

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_lifecycle_ribbon.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
106 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
138 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

Manual validation:

- Reset `/Users/alissonvale/Code/sandbox-pet-store` with `--full`.
- Ran the Ariad lifecycle through implementation.
- Confirmed pending validation without Navigator acceptance.
- Confirmed accepted validation after Navigator approval.
- Confirmed deterministic surface transport after acceptance.

## Result

Coherent. The story can be marked Done.
