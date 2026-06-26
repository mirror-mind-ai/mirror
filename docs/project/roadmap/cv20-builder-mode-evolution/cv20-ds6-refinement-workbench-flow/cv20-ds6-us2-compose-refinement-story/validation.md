# Validation — CV20.DS6.US2

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

Evidence: Manual smoke used sandbox-pet-store through direct CLI and Navigator-accepted natural-language Mirror/Builder interaction. Natural-language sequence: activated Builder Mode; requested creation of a refinement story; requested CR capture in that story; requested overview; reloaded Builder Mode. Observed REFINEMENT_STORY_OVERVIEW, CHANGE_REQUEST_CAPTURED, updated overview with one CR, and Builder Home durable counts increasing to stored RSs 2 and stored CRs 2. No RS was pulled and no CR lifecycle or Delivery work was executed.

## Navigator Validation

Route: Natural language in Mirror Builder Mode: `/mm-build sandbox-pet-store`; `Create a refinement story for sandbox checkout refinements`; `Capture a CR in that refinement story: the sandbox docs disagree about whether CV2.DS1 is in progress or not`; `Show me that refinement story`; `Load sandbox-pet-store Builder Mode`. Direct CLI route also passed: refinement-story create, change-request capture, refinement-story overview, then build load for sandbox-pet-store.

Navigator accepted: yes

Expected observation: Navigator can compose a Refinement Story and capture a Change Request through conversation, with the Driver routing to runtime commands and rendering marked Ariad surfaces before commentary.

Pass condition: Natural-language prompts create durable RS/CR records, surfaces render visibly, overview lists the CR, Builder Home counts increase, and no lifecycle work starts.

Fail condition: Driver requires direct CLI-only use, invents missing details unsafely, hides or summarizes surfaces, fails to persist RS/CR records, or starts RS/CR/Delivery lifecycle execution.

## Missing Evidence

- none
