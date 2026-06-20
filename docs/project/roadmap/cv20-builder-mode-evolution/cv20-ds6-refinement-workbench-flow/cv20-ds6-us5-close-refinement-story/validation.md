# Validation — CV20.DS6.US5

## Status

Blocked

## Automated Checks

- uv run pytest tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
- uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
- uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
- uv run mypy src/memory/builder src/memory/cli/build.py
- git diff --check

Checks status: passed

## E2E

Decision: required

Evidence: Direct sandbox smoke reset sandbox-pet-store, created an RS and CR, pulled the RS, traversed the CR through select/confirm/plan/mark-implemented/validate/done, then reviewed, coherence-checked, and closed the RS. Nine REFINEMENT_FLOW_EVENT surfaces rendered; RS close surfaces included current RS phase and closure record fields. Natural-language Navigator validation remains required.

## Navigator Validation

Route: Natural language in Mirror Builder Mode: Ative a jornada sandbox pet store; Create a refinement story for checkout closure validation; Capture a CR in that RS: checkout docs should describe CV2.DS1 as a candidate until pulled; Pull that refinement story; Select the CR; Confirm the CR; Plan the CR: align closure validation wording without changing runtime behavior; Implement this CR; Validate this CR: inspect the resulting refinement flow surfaces; Mark this CR done: closure precondition satisfied; Review this refinement story: one CR completed with validation evidence; Check coherence for this refinement story: CR outcome is preserved and no Delivery Work was pulled; Close this refinement story: checkout closure validation is complete; Show Builder Home.

Navigator accepted: no

Expected observation: Navigator can close an RS after completed CR outcomes through review, coherence, and close surfaces; active RS/CR clear after close and Delivery Work remains untouched.

Pass condition: RS close refuses unfinished CRs, review/coherence do not mutate files, close records a summary surface, active cursor clears, CR done notes remain stored, and Builder Home shows no active RS.

Fail condition: RS closes with unfinished CRs, review/coherence mutate files, surfaces are hidden, CR outcomes are lost, active cursor remains stuck, or Delivery Work is pulled/executed.

## Missing Evidence

- Navigator validation has not been accepted
