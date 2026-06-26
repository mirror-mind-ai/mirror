# Validation — CV20.DS6.US4

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

Evidence: Navigator validated US4 through natural-language Mirror/Builder interaction on sandbox-pet-store. The CR traversal route worked: create RS, capture CR, pull RS, select CR, confirm CR, plan CR, explicitly implement/record implementation evidence, validate CR, and mark CR done. Surfaces rendered at each step and no Delivery Work was pulled.

## Navigator Validation

Route: Natural language in Mirror Builder Mode: Ative a jornada sandbox pet store; Create a refinement story for checkout candidate language; Capture a CR in that RS: checkout docs should describe CV2.DS1 as a candidate until pulled; Pull that refinement story; Select the CR; Confirm the CR; Plan the CR: align the docs language without changing runtime behavior; Implement this CR; Validate this CR: inspect docs and Builder Home; Mark this CR done: documentation language is consistent and no Delivery work was pulled.

Navigator accepted: yes

Expected observation: Navigator can traverse one CR through the full lightweight Refinement cycle using natural language, with visible phase/evidence/next-move surfaces and no Delivery Work execution.

Pass condition: Each step renders a marked Ariad surface, no phase is skipped silently, implementation is explicit, active CR clears after done, and Delivery Work remains unpulled.

Fail condition: Driver jumps to implementation, hides surfaces, omits phase/next-move guidance, mutates during confirm/plan/validate/done note, leaves active CR after done, or pulls Delivery Work.

## Missing Evidence

- none
