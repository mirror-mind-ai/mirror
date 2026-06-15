# Plan — CV20.DS5.US2

## Objective

Route natural Builder Mode/Pi requests for aggregate Delivery Story planning and approval through the DS-level Plan runtime substrate, returning deterministic Ariad surfaces verbatim.

## Scope

- Update Builder Mode instructions so the Driver recognizes natural Navigator intents such as:
  - "planeje a DS" / "plan the Delivery Story";
  - "aprovo o plano da DS" / "approve the DS plan";
  - equivalent wording when `navigator_flow_unit=delivery_story`.
- Route those intents to the existing runtime commands:
  - `uv run python -m memory build plan-delivery-story ...`;
  - `uv run python -m memory build approve-delivery-story-plan ...`.
- Preserve the Ariad surface transport contract:
  - return `<<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>>` blocks verbatim;
  - interpret only after the block.
- Make the behavior conditional on Ariad adoption and `navigator_flow_unit=delivery_story`.
- Keep `story_by_story` as the default behavior.

## Non-Goals

- Do not change the DS-level Plan runtime substrate; covered by `CV20.DS5.TS2`.
- Do not implement DS-level Validation/Debt Review/Coherence/Done; covered by `CV20.DS5.US3`.
- Do not implement release/push policy behavior from `CV20.DS6`.
- Do not implement DS8 preferences/config overrides.
- Do not route non-Ariad Builder journeys through Ariad surfaces.

## Acceptance Behavior

```text
Given Builder Mode is active for an Ariad journey
And the active Delivery Story has `navigator_flow_unit=delivery_story`
When the Navigator asks to plan the Delivery Story in natural language
Then the Driver calls the DS-level Plan runtime operation
And returns the Ariad DS Plan surface verbatim
And explains that implementation remains blocked until approval
```

```text
Given a DS-level Plan is pending approval
When the Navigator approves the DS plan in natural language
Then the Driver calls the DS-level Plan approval runtime operation
And returns the approved Ariad surface verbatim
```

```text
Given the effective flow unit is `story_by_story`
When the Navigator asks to plan work
Then Builder keeps using existing child-story Plan behavior
And does not silently use DS-level Plan
```

## Validation Route

Automated/static validation:

```bash
uv run pytest tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_story_plan.py -q
uv run ruff check .pi/skills/mm-build/SKILL.md src/memory/builder src/memory/cli/build.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_story_plan.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/cli/test_build.py tests/unit/memory/builder/test_delivery_story_plan.py
git diff --check
```

Navigator-facing validation in Pi/Builder:

1. Activate Builder for an Ariad journey with `navigator_flow_unit=delivery_story`.
2. Ask naturally: "planeje a Delivery Story".
3. Confirm Builder returns the `DELIVERY_STORY_PLAN_CHECKPOINT` surface verbatim.
4. Approve naturally: "aprovo o plano da DS".
5. Confirm Builder returns the approved surface verbatim.
6. Confirm no implementation, push, or release occurs from planning/approval alone.

E2E decision: Pi/Builder natural interaction is required; browser/UI E2E is not required.

## Implementation Contract

- Keep changes scoped to `CV20.DS5.US2`.
- Prefer skill/instruction routing changes over duplicating runtime logic.
- Use uv run for Python commands and tests.
- Do not use git add .; stage only story-scoped files.
- Commit validated changes locally.
- Do not push without explicit Navigator authorization.

## Stop Conditions

- The change starts implementing DS-level Validation/Closure.
- The change makes DS-level planning apply by default in `story_by_story` flow.
- The change violates Ariad surface transport.
- Non-Ariad Builder behavior changes.
- Navigator decision is needed for push, release, or scope change.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
