# Validation — CV20.DS6.US5

## Status

Passed

## Automated Checks

- uv run pytest tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
- uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
- uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
- uv run mypy src/memory/builder src/memory/cli/build.py
- git diff --check

Checks status: passed

## E2E

Decision: required

Evidence: Navigator validated US5 through natural-language Mirror/Builder interaction on sandbox-pet-store. The RS closure route worked: create RS, capture CR, pull RS, traverse CR through done, review RS, check coherence, close RS, and show Builder Home. Surfaces rendered at each step, active RS/CR cleared after close, CR outcome remained preserved, and no Delivery Work was pulled.

## Navigator Validation

Route: Natural language in Mirror Builder Mode: Ative a jornada sandbox pet store; Create a refinement story for checkout closure validation; Capture a CR in that RS: checkout docs should describe CV2.DS1 as a candidate until pulled; Pull that refinement story; Select the CR; Confirm the CR; Plan the CR: align closure validation wording without changing runtime behavior; Implement this CR; Validate this CR: inspect the resulting refinement flow surfaces; Mark this CR done: closure precondition satisfied; Review this refinement story: one CR completed with validation evidence; Check coherence for this refinement story: CR outcome is preserved and no Delivery Work was pulled; Close this refinement story: checkout closure validation is complete; Show Builder Home.

Navigator accepted: yes

Expected observation: Navigator can close an RS after completed CR outcomes through review, coherence, and close surfaces; active RS/CR clear after close and Delivery Work remains untouched.

Pass condition: RS close refuses unfinished CRs, review/coherence do not mutate files, close records a summary surface, active cursor clears, CR done notes remain stored, and Builder Home shows no active RS.

Fail condition: RS closes with unfinished CRs, review/coherence mutate files, surfaces are hidden, CR outcomes are lost, active cursor remains stuck, or Delivery Work is pulled/executed.

## Missing Evidence

- none
