# Validation — CV20.DS6.US3

## Status

Passed

## Automated Checks

- uv run pytest tests/unit/memory/storage/test_builder_workbench_store.py tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
- uv run ruff check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
- uv run ruff format --check src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
- uv run mypy src/memory/storage src/memory/builder src/memory/cli/build.py
- git diff --check

Checks status: passed

## E2E

Decision: required

Evidence: Navigator validated through natural-language Mirror/Builder interaction on sandbox-pet-store after resetting the sandbox Workbench state. Sequence: activated Builder Mode; created a pet-store-contextual refinement story for checkout documentation consistency; captured a CR about CV2.DS1 remaining a candidate until explicitly pulled; pulled that refinement story; reloaded Builder Mode. Observed REFINEMENT_STORY_OVERVIEW, CHANGE_REQUEST_CAPTURED, REFINEMENT_STORY_PULLED, and Builder Home with active RS, stored RSs 1, stored CRs 1, active CR none, and Delivery candidate not pulled.

## Navigator Validation

Route: Natural language: Ative a jornada sandbox pet store; Create a refinement story for checkout documentation consistency in the sandbox pet store; Capture a CR in that refinement story: the sandbox pet store docs should consistently describe CV2.DS1 as a candidate checkout story until the Navigator explicitly pulls it; Pull that refinement story; Load sandbox-pet-store Builder Mode.

Navigator accepted: yes

Expected observation: Navigator can pull a composed Refinement Story through conversation, with Builder rendering REFINEMENT_STORY_PULLED and later activation showing active RS without selecting a CR.

Pass condition: Natural-language pull sets active RS, leaves active CR none, preserves Delivery cursor, renders surfaces visibly, and does not start CR or Delivery lifecycle work.

Fail condition: Driver requires CLI-only pull, cannot resolve or ask for RS target, hides surfaces, selects a CR automatically, mutates Delivery cursor, or starts lifecycle execution.

## Missing Evidence

- none
