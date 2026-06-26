# Plan — CV20.DS6.TS2 Refinement Flow Runtime

## Objective

Add stateful Refinement runtime transitions for an active Refinement Story (RS) and its Change Requests (CRs), so Builder can safely select a CR, move it through confirmation/planning/validation/done-note states, and record RS review/coherence/close state without mutating files from review/coherence.

This is runtime substrate for `CV20.DS6.US4 Traverse Change Request Cycles` and `CV20.DS6.US5 Close A Refinement Story`.

## Runtime Transition Model

CR cycle states:

```text
captured → active → planned → implemented → validated → done
                 ↘ parked | rejected | promoted
```

RS-level states:

```text
draft/open → active → review → coherence → closed
```

TS2 should extend runtime/storage enough to record these transitions, enforce order, keep active cursor state coherent, and render marked Ariad surfaces.

## Product Behavior

Add deterministic runtime commands:

```bash
uv run python -m memory build change-request select --journey <slug> --change-request-id <cr-id>
uv run python -m memory build change-request confirm --journey <slug> --change-request-id <cr-id>
uv run python -m memory build change-request plan --journey <slug> --change-request-id <cr-id> --summary "<plan>"
uv run python -m memory build change-request mark-implemented --journey <slug> --change-request-id <cr-id> --evidence "<evidence>"
uv run python -m memory build change-request validate --journey <slug> --change-request-id <cr-id> --evidence "<evidence>"
uv run python -m memory build change-request done --journey <slug> --change-request-id <cr-id> --notes "<done note>"

uv run python -m memory build refinement-story review --journey <slug> --refinement-story-id <rs-id> --summary "<review>"
uv run python -m memory build refinement-story coherence --journey <slug> --refinement-story-id <rs-id> --summary "<coherence>"
uv run python -m memory build refinement-story close --journey <slug> --refinement-story-id <rs-id> --summary "<close summary>"
```

Every command renders a marked Ariad transition surface before commentary.

## Surface Requirements

Every transition surface shows journey, RS, CR when relevant, previous/new status, evidence/summary/notes, next movement, and a boundary that no file mutation or Delivery Work was performed.

RS review/coherence surfaces must explicitly state that review/coherence does not mutate files and required changes must become CRs or future work.

## API Strategy

Extend `memory.storage.builder_workbench` with CR update helpers and RS status/event updates. Extend `memory.builder.workbench` with intent-level helpers for CR select/confirm/plan/implemented/validate/done and RS review/coherence/close.

Helpers must validate:

- active RS exists before CR cycle transitions
- CR belongs to active RS
- transitions happen in valid order
- active CR is set/cleared correctly
- Delivery cursor is untouched

## Implementation Scope

- Add migration/schema support if RS statuses need `review` and `coherence`.
- Add storage update methods for CR status/outcome notes and RS status.
- Add domain transition helpers with validation.
- Add transition surface renderer(s).
- Add CLI commands for transition helpers.
- Update Builder Home to show active CR when cursor has one.
- Update `/mm-build` natural-language guidance for CR cycle and RS review/coherence/close routing.
- Add focused tests for valid transitions, invalid transitions, cursor behavior, surfaces, and non-mutation of Delivery cursor.

## Out Of Scope

- Do not implement actual code/file changes for a CR.
- Do not make Review or Coherence mutate files.
- Do not implement rich planning documents per CR beyond stored summaries/notes.
- Do not implement release/push policy, full debt ledger, or web UI.

## Acceptance Criteria

- Active RS can select a CR and set active CR.
- CR transitions are ordered and invalid moves are rejected.
- CR done note stores outcome notes and clears active CR.
- RS review/coherence/close are explicit runtime transitions.
- Review/coherence surfaces state no direct mutation.
- Delivery cursor is not mutated by Refinement flow commands.
- Builder Home can show active RS and active CR.
- Natural-language routing guidance exists for the transition commands.

## Validation Plan

Automated checks:

```bash
uv run pytest tests/unit/memory/storage/test_builder_workbench_store.py tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/db src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/db src/memory/storage src/memory/builder src/memory/cli/build.py tests/unit/memory/storage tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/db src/memory/storage src/memory/builder src/memory/cli/build.py
git diff --check
```

Manual/Navigator validation should use natural language after reset:

```text
Ative a jornada sandbox pet store.
Create a refinement story for checkout documentation consistency.
Capture a CR in that RS: CV2.DS1 should remain described as a candidate until explicitly pulled.
Pull that refinement story.
Select the CR.
Confirm the CR.
Plan the CR: update docs later so CV2.DS1 is consistently a candidate.
Mark the CR implemented with evidence: no file changes in this TS2 validation, runtime state only.
Validate the CR with evidence: status transition was recorded.
Mark the CR done with note: runtime cycle completed.
Review the refinement story: no direct mutations from review.
Check coherence for the refinement story: state is coherent for runtime validation.
Close the refinement story.
Load sandbox-pet-store Builder Mode.
```

Expected: visible Refinement flow surfaces for each transition; active CR becomes none after done; RS closes at end; Delivery field remains unpulled.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
