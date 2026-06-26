[< Story](index.md)

# Plan — CV20.DS4.US2 Plan Checkpoint Gate

## Pull

Pulled item: `CV20.DS4.US2 — Plan Checkpoint Gate`.

Why this level now: DS4.US1 implemented Pull and Prepare. The next Ariad lifecycle stage is Plan, and it is the first hard checkpoint that must block implementation until Navigator approval.

## Prepare

Context read/used:

- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds4-story-lifecycle-runtime/index.md`
- `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds4-story-lifecycle-runtime/cv20-ds4-us1-pull-and-prepare/index.md`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/lifecycle.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/lifecycle_ribbon.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/builder/delivery_cursor.py`
- `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`
- `/Users/alissonvale/Code/ariad/docs/delivery/visual-grammar.md`

Story shape assessment: User Story. The observable behavior is a Navigator-facing Plan Checkpoint surface and a runtime gate that blocks implementation.

Risks:

- Plan may become implementation. It must stop at approval.
- Plan may be generated without Prepare. It should require `last_delivery_event=prepare`.
- Plan checkpoint state may be only prose. It must persist in runtime cursor and produce a visible Plan artifact.
- Approval/implementation flow can grow too large. This story should create the gate and block implementation, not execute implementation.

Applicable Ariad contracts:

- `plan_contract`: define scope, non-goals, acceptance behavior, validation route, documentation impact, implementation contract, E2E decision, and approval gate.
- `implement_contract`: follow approved Plan, use TDD/characterization tests for testable behavior changes, keep changes scoped to the active story, add/update E2E when required, stop on scope change or Navigator decision.
- `validation_contract`: run required checks, run E2E when required by Plan/local guide, provide Navigator validation route, record evidence.

Applicable Mirror local rules:

- Use `uv run` for Python commands and tests.
- Do not use `git add .`; commit only story-scoped files.
- Use descriptive English commit messages explaining why.
- Preserve Ariad visual grammar.
- Keep runtime state in SQLite cursor.
- Do not mutate project files for the pulled item during Plan.

## Dependency

This story depends on:

- `CV20.DS4.TS2 — Lifecycle Contract Definitions`: Plan should render method-declared contracts rather than hardcoding implementation rules.
- `CV20.DS4.TS3 — Deterministic Ariad Surface Delivery`: Plan Checkpoint output must be wrapped as a deterministic Ariad surface block so the agent returns runtime output instead of summarizing it.

## Scope

Add lifecycle operation in:

`/Users/alissonvale/Code/mirror-dev/src/memory/builder/lifecycle.py`

Likely additions:

- `BuilderPlanReport`
- `plan_lifecycle_item(store, journey, method, objective=None) -> BuilderPlanReport`
- `render_plan_checkpoint(report) -> str`
- `assert_implementation_allowed(store, journey) -> None` or equivalent guard helper

Plan behavior:

- reads Ariad `plan_contract`, `implement_contract`, and `validation_contract` from the method definition;
- combines method contract rules with Mirror local implementation rules in the rendered surface;
- requires delivery cursor;
- requires `active_item`;
- requires `last_delivery_event == "prepare"`;
- updates cursor:
  - `active_checkpoint="after_plan"`;
  - `pending_confirmation="navigator_approval"`;
  - `last_delivery_event="plan"`;
- renders Plan Checkpoint with:
  - lifecycle ribbon at Plan;
  - active item;
  - plan artifact path;
  - objective;
  - scope stance;
  - non-goals;
  - acceptance behavior section using Given/When/Then/And when practical;
  - validation route section with automated checks, Navigator route, expected observation, pass/fail condition, and E2E decision;
  - method-declared Plan/Implement/Validation contract rules;
  - Mirror local implementation rules;
  - explicit stop conditions from `implement_contract`;
  - implementation blocked;
  - Navigator decision prompt.

Add CLI commands:

```bash
uv run python -m memory build plan-item --method ariad
```

and guard/smoke command:

```bash
uv run python -m memory build check-implementation --method ariad
```

Both support `--journey <slug>` or active Builder journey resolution.

Update skill:

`/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md`

Route natural-language requests like `planeje o item puxado` to `plan-item` only for Ariad-adopted journeys.

## Non-Goals

- No implementation file mutation.
- No mutation beyond the Plan-stage `plan.md` artifact.
- No approval command.
- No implementation execution.
- No validation/review/coherence/done.
- No full roadmap status transition.

## Implementation Approach

TDD first:

1. Add failing lifecycle tests in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_lifecycle.py`:
   - Plan requires active item and previous Prepare.
   - Plan persists `active_checkpoint=after_plan`, `pending_confirmation=navigator_approval`, and `last_delivery_event=plan`.
   - Plan renderer includes lifecycle ribbon, active item, contract sections, E2E decision, stop conditions, and blocked implementation language.
   - Implementation guard refuses while pending confirmation exists.
2. Add failing CLI tests in `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/cli/test_build.py`:
   - `memory build plan-item --method ariad` renders Plan Checkpoint.
   - `memory build check-implementation --method ariad` refuses when approval is pending.
   - non-Ariad/default journeys do not receive Ariad-specific behavior.
3. Implement lifecycle plan operation and renderer in `/Users/alissonvale/Code/mirror-dev/src/memory/builder/lifecycle.py`.
4. Wire CLI commands in `/Users/alissonvale/Code/mirror-dev/src/memory/cli/build.py`.
5. Update Pi skill routing in `/Users/alissonvale/Code/mirror-dev/.pi/skills/mm-build/SKILL.md` for Ariad-only Plan requests.
6. Validate automated checks.
7. Stop for Navigator validation through Pi/Mirror.

## Test Strategy

Automated:

```bash
uv run pytest tests/unit/memory/builder/test_lifecycle.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_cursor.py tests/unit/memory/builder/test_method_adoption.py
uv run ruff check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
```

Navigator validation:

```text
planeje o item puxado
```

Expected:

- Plan Checkpoint surface appears.
- Ribbon shows Pull and Prepare complete, Plan current.
- Cursor records `active_checkpoint=after_plan`.
- Cursor records `pending_confirmation=navigator_approval`.
- Implementation is explicitly blocked.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
