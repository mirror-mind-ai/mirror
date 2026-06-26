# Plan — CV20.DS6.US4 Traverse Change Request Cycles

## Objective

Turn the TS2 runtime transition substrate into a coherent Navigator-facing CR traversal experience. Builder should guide one active Change Request at a time through confirm, short plan, implementation, validation evidence, and done note, using natural-language prompts and marked Ariad surfaces.

## User Outcome

As Navigator, I can work a refinement request without promoting it into roadmap Delivery Work. Builder keeps the cycle lightweight but explicit: it confirms the requested change, records a short plan, performs or records implementation only when authorized, captures validation evidence, and records a done note.

## Current State

- TS1 persists RS/CR/cursor state.
- US2 composes RSs and CRs.
- US3 pulls an RS into active Refinement Work.
- TS2 adds runtime state transitions and `REFINEMENT_FLOW_EVENT` surfaces for CR and RS lifecycle state.
- The experience is still command-shaped; US4 should make the natural-language Driver/Navigator flow legible and safe.

## Product Behavior

When a Refinement Story is active and contains CRs, Builder should support a conversational CR cycle:

```text
select CR
confirm requested change
short plan
implement or record implementation evidence
validate
record done note
return to RS overview / next CR choice
```

The Driver must work one CR at a time, ask when the CR target is ambiguous, avoid file mutation during confirm/plan/validate/done note, mutate implementation files only when explicitly authorized, render marked Ariad surfaces before commentary, and preserve the boundary between Refinement Work and Delivery Work.

## Natural-Language Expectations

Examples:

```text
Select the checkout documentation CR.
Confirm this CR.
Plan this CR: align the docs so CV2.DS1 remains a candidate until pulled.
Implement this CR.
Validate this CR: Builder Home still shows CV2.DS1 as candidate.
Mark this CR done: docs are consistent and runtime state is validated.
Show the RS overview.
```

If the Navigator says “fix this” before confirm/plan, Driver should route through the CR cycle rather than jumping directly to implementation.

## Runtime Commands

US4 may reuse TS2 commands directly, but should add any missing convenience behavior needed for the conversational path:

```bash
uv run python -m memory build change-request select --journey <slug> --change-request-id <cr-id>
uv run python -m memory build change-request confirm --journey <slug> --change-request-id <cr-id>
uv run python -m memory build change-request plan --journey <slug> --change-request-id <cr-id> --summary "<plan>"
uv run python -m memory build change-request mark-implemented --journey <slug> --change-request-id <cr-id> --evidence "<evidence>"
uv run python -m memory build change-request validate --journey <slug> --change-request-id <cr-id> --evidence "<evidence>"
uv run python -m memory build change-request done --journey <slug> --change-request-id <cr-id> --notes "<done note>"
```

## Surface Requirements

The existing `REFINEMENT_FLOW_EVENT` surface may be used, but US4 should improve or wrap it if needed so the Navigator can clearly see current CR phase, what happened, what evidence/plan/done note was recorded, what the next conversational move is, whether implementation files were changed, and that no Delivery Work was pulled/executed.

## Implementation Scope

- Update `/mm-build` guidance for the full natural-language CR traversal loop.
- Improve CR flow surface wording if needed for Navigator clarity.
- Add convenience runtime helpers only if the command-shaped TS2 substrate is insufficient.
- Add tests for natural-language routing guidance, surface clarity, and no skipped phase behavior where testable.
- Validate through a pet-store contextual CR that actually traverses the full cycle.

## Out Of Scope

- Do not implement RS close UX beyond what TS2 already provides.
- Do not add rich event-log persistence unless required to make the user-facing cycle coherent.
- Do not implement release/push/debt ledger behavior.
- Do not promote CRs to Delivery Work automatically.

## Acceptance Criteria

- Navigator can traverse one CR through select, confirm, plan, implementation evidence, validation evidence, and done note using natural language.
- Driver does not skip confirm/plan before implementation unless the current state already passed them.
- Surfaces are visible and understandable at each step.
- Active CR clears after done.
- RS remains active for next CR or later RS-level review/close.
- Delivery Work remains untouched.

## Validation Plan

Automated checks:

```bash
uv run pytest tests/unit/memory/builder/test_workbench.py tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

Manual/Navigator validation in Mirror Builder Mode:

```text
Ative a jornada sandbox pet store.
Create a refinement story for checkout candidate language.
Capture a CR in that RS: checkout docs should describe CV2.DS1 as a candidate until pulled.
Pull that refinement story.
Select the CR.
Confirm the CR.
Plan the CR: align the docs language without changing runtime behavior.
Implement this CR.
Validate this CR: inspect docs and Builder Home.
Mark this CR done: documentation language is consistent and no Delivery work was pulled.
```

Expected: one CR traverses the full cycle visibly, active CR becomes none, RS remains available for review/coherence/close, and Delivery field remains unpulled.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
