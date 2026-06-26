[< Story](index.md)

# Coherence — CV20.DS4.US6 Coherence And Done Gate

## Process

US6 closes the dogfooded lifecycle path after Debt Review. The story was validated manually in the sandbox journey with deterministic surfaces preserved verbatim and interpretation placed after the surface blocks.

## Project

The Builder runtime now supports the complete happy path:

```text
Pull -> Prepare -> Expand -> Plan -> Approve -> Implement -> Validate -> Debt Review -> Coherence -> Done
```

The final cursor transitions validated manually were:

```text
review_complete -> coherence_complete -> done_complete
```

## Product

The Navigator receives a Coherence checkpoint that verifies:

- process alignment;
- project/docs/artifacts alignment;
- product behavior alignment;
- local guide differences;
- missing coherence evidence.

The Navigator then receives a Done checkpoint that names:

- history action;
- roadmap/story package update;
- next recommendation;
- missing Done evidence;
- closure boundary.

## Validation Evidence

Automated validation:

```text
uv run pytest tests/unit/memory/builder/test_method_definition.py tests/unit/memory/builder/test_ariad_method.py tests/unit/memory/builder/test_lifecycle_ribbon.py tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/builder/test_pull_candidates.py tests/unit/memory/builder/test_resume_surface.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
112 passed

uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
All checks passed

uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
138 files already formatted

uv run mypy src/memory/builder src/memory/cli/build.py
Success
```

Manual validation:

- Ran Coherence in `/Users/alissonvale/Code/sandbox-pet-store` after Debt Review.
- Confirmed `COHERENCE_CHECKPOINT` with `status=coherent` and `missing coherence=✓ none`.
- Ran Done after Coherence.
- Confirmed `DONE_CHECKPOINT` with `status=done` and `missing done=✓ none`.
- Confirmed `coherence.md` and `done.md` artifacts were materialized.

## Result

Coherent. The story can be marked Done.
