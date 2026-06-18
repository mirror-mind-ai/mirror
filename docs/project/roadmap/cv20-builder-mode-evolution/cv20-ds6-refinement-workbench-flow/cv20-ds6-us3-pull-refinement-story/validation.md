# Validation — CV20.DS6.US3

## Status

Blocked

## Automated Checks

- uv run pytest tests/unit/memory/storage/test_builder_workbench_store.py tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
- uv run ruff check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
- uv run ruff format --check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
- uv run mypy src/memory/storage src/memory/builder src/memory/cli/build.py
- git diff --check

Checks status: passed

## E2E

Decision: required

Evidence: Direct CLI smoke created RS-002 in sandbox-pet-store, captured a CR into it, pulled the RS, rendered REFINEMENT_STORY_PULLED, and Builder Home showed the active RS with active CR none and no lifecycle execution. Natural-language Navigator validation is still required.

## Navigator Validation

Route: Natural language in Mirror Builder Mode: /mm-build sandbox-pet-store; Create a refinement story for validating RS pull; Capture a CR in that RS: the RS should become active without starting a CR cycle; Pull that refinement story; Load sandbox-pet-store Builder Mode. Expected surfaces: REFINEMENT_STORY_OVERVIEW, CHANGE_REQUEST_CAPTURED, REFINEMENT_STORY_PULLED, then BUILDER_HOME with active RS and active CR none.

Navigator accepted: no

Expected observation: Navigator can pull a composed Refinement Story through conversation, with Builder rendering REFINEMENT_STORY_PULLED and later activation showing active RS without selecting a CR.

Pass condition: Natural-language pull sets active RS, leaves active CR none, preserves Delivery cursor, renders surfaces visibly, and does not start CR or Delivery lifecycle work.

Fail condition: Driver requires CLI-only pull, cannot resolve or ask for RS target, hides surfaces, selects a CR automatically, mutates Delivery cursor, or starts lifecycle execution.

## Missing Evidence

- Navigator validation has not been accepted
