# Plan — CV20.DS5.TS3

## Objective

Materialize Validation, Debt Review, Coherence, and Done artifacts at canonical lifecycle package paths for Delivery Story, User Story, and Technical Story units, avoiding fallback roadmap paths and worklog-only closure.

## Scope

- Define canonical lifecycle package path resolution for:
  - Delivery Story packages;
  - User Story packages;
  - Technical Story packages.
- Materialize checkpoint artifacts at the checkpoint moment:
  - `validation.md` during Validation;
  - `review.md` during Debt Review;
  - `coherence.md` during Coherence;
  - `done.md` during Done.
- Explicitly document that `implement.md` is not a canonical lifecycle artifact by default.
- Apply canonical artifact paths to both:
  - existing child-story lifecycle commands;
  - aggregate Delivery Story closure commands.
- Preserve existing artifact content and only change destination/path resolution where needed.
- Prevent synthetic fallback packages such as `docs/project/roadmap/cv20-...` when a canonical package exists under the roadmap tree.

## Implementation Artifact Rationale

No `implement.md` artifact is created by default.

Implementation evidence lives in the changed project files, automated tests,
validation evidence, and local history. A canonical `implement.md` would usually
duplicate the actual source-of-truth diff and commit history.

When implementation notes are needed, record them in the checkpoint where they
matter:

- `validation.md`, when they affect validation evidence;
- `review.md`, when they introduce or pay down debt;
- `coherence.md`, when they affect process/project/product alignment;
- `done.md`, when they affect history, release, or next-step boundaries.

An optional future `implementation-notes.md` may be introduced if a concrete use
case appears, but it is not part of the canonical Ariad artifact set in this
story.

## Non-Goals

- Do not create `implement.md` as a canonical artifact by default.
- Do not change checkpoint semantics or approval/validation gates.
- Do not implement DS-level Validation/Closure user behavior beyond artifact materialization; that remains `CV20.DS5.US3`.
- Do not implement release intent, push, or release policy behavior from `CV20.DS7`.
- Do not implement method preferences/config overrides from `CV20.DS9`.
- Do not rewrite historical artifact packages unless touched by active work.

## Acceptance Behavior

```text
Given an active User Story or Technical Story has a canonical story package
When Builder records Validation, Review, Coherence, or Done
Then the corresponding artifact is created in that story package
And the runtime surface reports that canonical path
```

```text
Given an active Delivery Story uses aggregate `delivery_story` flow
When Builder records DS-level Validation, Review, Coherence, or Done
Then the corresponding artifact is created in the Delivery Story package
And child work packages remain visible as evidence units
```

```text
Given a canonical package exists for the active item
When Builder records a lifecycle checkpoint
Then Builder does not create a synthetic fallback roadmap package for that checkpoint
```

## Validation Route

```bash
uv run pytest tests/unit/memory/builder tests/unit/memory/cli/test_build.py -q
uv run ruff check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run ruff format --check src/memory/builder src/memory/cli/build.py tests/unit/memory/builder tests/unit/memory/cli/test_build.py
uv run mypy src/memory/builder src/memory/cli/build.py
git diff --check
```

Sandbox validation:

1. Run an aggregate DS closure in `sandbox-pet-store`.
2. Confirm `validation.md`, `review.md`, `coherence.md`, and `done.md` exist under the canonical DS package.
3. Confirm no synthetic fallback checkpoint package is created for the closed DS.

E2E decision: browser/UI E2E is not required; filesystem/runtime artifact validation is sufficient.

## Implementation Contract

- Use TDD or characterization tests for behavior changes.
- Keep changes scoped to `CV20.DS5.TS3`.
- Use uv run for Python commands and tests.
- Do not use git add .; stage only story-scoped files.
- Commit validated changes locally.
- Do not push without explicit Navigator authorization.

## Stop Conditions

- The change starts altering checkpoint gates or lifecycle semantics.
- Canonical package resolution cannot be determined without a broader roadmap index model.
- Existing story-by-story artifact materialization breaks.
- Non-Ariad Builder behavior changes.

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
