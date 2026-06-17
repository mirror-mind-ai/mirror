# Plan — CV20.DS7.US1

## Objective

Introduce Delivery Story release intent as explicit planning state. The Navigator may define, decline, or defer release intent for a DS early in its lifecycle, and Builder must keep that intent separate from release authorization.

## Scope

- Model the minimal DS-level release intent vocabulary:
  - `planned`: this DS is expected to create a release boundary if completed coherently;
  - `none`: this DS is not expected to create a release boundary;
  - `undecided`: release intent is intentionally unresolved for now.
- Provide the smallest Builder-facing route to record or reveal release intent for the active Delivery Story.
- Ensure the active DS context can display release intent when present.
- Make the boundary explicit in surfaced text: release intent does not authorize push, tag creation, stable promotion, release publication, or any remote mutation.
- Keep the implementation ready for later DS6 stories to consume release intent in progress and collapse surfaces.

## Non-Goals

- Do not implement the release progress surface after child story Done events; that is CV20.DS7.US2.
- Do not implement the DS collapse release decision surface; that is CV20.DS7.US3.
- Do not implement a generic commit/push/release policy resolver; that is CV20.DS7.TS1.
- Do not implement push checkpoint/autopush behavior; that is CV20.DS7.US4.
- Do not implement release authorization, tag creation, stable promotion, publication, or release automation.
- Do not implement DS8 preferences/config overrides.
- Do not push or release as part of this story without separate explicit Navigator authorization.

## Acceptance Behavior

```text
Given an active Delivery Story
When the Navigator sets release intent to planned
Then Builder records the DS-level intent
And displays that the DS may produce a release boundary
And states that no release action is authorized
```

```text
Given an active Delivery Story
When the Navigator sets release intent to none or undecided
Then Builder records that explicit state
And later release progress/collapse surfaces can distinguish it from planned intent
```

```text
Given release intent exists for a Delivery Story
When Builder resumes or inspects the active delivery context
Then the release intent is visible
And commit, push, and release authorization remain separate gates
```

## Validation Route

- Add focused unit tests for any new release intent model, storage, rendering, or CLI route.
- If this is documentation-only after implementation discovery, run `git diff --check` and document why no runtime tests apply.
- Expected focused validation if Builder runtime/CLI changes:
  - `uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py`
  - `uv run ruff check src/memory tests/unit/memory`
  - `uv run ruff format --check src/memory tests/unit/memory`
  - `uv run mypy src/memory/builder src/memory/cli/build.py`
  - `git diff --check`
- Navigator-visible validation:
  - define `planned` release intent for a DS and verify it is displayed without authorizing release;
  - define `none` or `undecided` release intent and verify it is displayed distinctly;
  - ask whether release/push is authorized and verify Builder says no without explicit authorization.

E2E decision: browser/UI E2E is not required; Builder CLI/Pi-visible behavior is the validation surface.

## Implementation Contract

- Keep changes scoped to `CV20.DS7.US1`.
- Use TDD or characterization tests for behavior changes when testable.
- Use uv run for Python commands and tests.
- Do not use git add .; stage only story-scoped files.
- Local commit requires Navigator approval after validation.
- Push requires explicit Navigator authorization.
- Release requires explicit Navigator authorization.
- Use descriptive English commit messages explaining why.

## Stop Conditions

- The change starts implementing progress bars, collapse decisions, policy resolver, autopush, or DS8 preferences.
- The release intent storage location would require a broader architecture decision.
- The policy boundary between intent and authorization becomes ambiguous.
- Navigator decision is needed for commit, push, or release authority.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
