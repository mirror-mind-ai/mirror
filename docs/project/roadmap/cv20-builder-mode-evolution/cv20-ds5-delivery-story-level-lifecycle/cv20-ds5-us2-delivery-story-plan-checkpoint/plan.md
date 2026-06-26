# Plan — CV20.DS5.US2

## Objective

Route natural Builder Mode/Pi requests for Delivery Story-level flow choice, aggregate Delivery Story planning, and DS Plan approval through the existing runtime substrate, returning deterministic Ariad surfaces verbatim.

## Scope

- Update Builder Mode instructions so the Driver recognizes natural Navigator intents such as:
  - "seguir no nível da DS" / "use Delivery Story flow";
  - "não preciso validar cada US";
  - "planeje a DS" / "plan the Delivery Story";
  - "aprovo o plano da DS" / "approve the DS plan".
- Route those intents to the existing runtime commands:
  - `uv run python -m memory build set-flow-unit ... --unit delivery_story`;
  - `uv run python -m memory build plan-delivery-story ...`;
  - `uv run python -m memory build approve-delivery-story-plan ...`.
- If the Navigator asks to plan the DS before selecting a flow unit, Builder should first surface or request the flow-unit choice instead of silently using DS-level Plan.
- Preserve the Ariad surface transport contract:
  - return `<<<ARIAD:DELIVERY_STORY_PLAN_CHECKPOINT>>>` blocks verbatim;
  - interpret only after the block.
- Make the behavior conditional on Ariad adoption and `navigator_flow_unit=delivery_story`.
- Keep `story_by_story` as the default behavior.

## Non-Goals

- Do not change the DS-level Plan runtime substrate; covered by `CV20.DS5.TS2`.
- Do not implement DS-level Validation/Debt Review/Coherence/Done; covered by `CV20.DS5.US3`.
- Do not implement release/push policy behavior from `CV20.DS7`.
- Do not implement DS8 preferences/config overrides.
- Do not route non-Ariad Builder journeys through Ariad surfaces.

## Acceptance Behavior

```text
Given Builder Mode is active for an Ariad journey
And a Delivery Story is active or in focus
When the Navigator says they want to follow the work at Delivery Story level
Then the Driver calls the flow-unit runtime operation with `delivery_story`
And returns the `NAVIGATOR_FLOW_UNIT` surface verbatim
And explains that child stories remain traceable work packages
```

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

1. Activate Builder for an Ariad journey with an active/focused Delivery Story.
2. Say naturally: "quero seguir no nível da DS".
3. Confirm Builder returns the `NAVIGATOR_FLOW_UNIT` surface verbatim with `delivery_story` selected.
4. Ask naturally: "planeje a Delivery Story".
5. Confirm Builder returns the `DELIVERY_STORY_PLAN_CHECKPOINT` surface verbatim.
6. Approve naturally: "aprovo o plano da DS".
7. Confirm Builder returns the approved surface verbatim.
8. Confirm no implementation, push, or release occurs from flow choice/planning/approval alone.

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
