[< CV20.DS4](../index.md)

# CV20.DS4.US2 — Plan Package And Granularity Gate

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Navigator can pull a Delivery Story, see it prepared and expanded into implementable stories, confirm the recommended child story, and then receive a complete Plan checkpoint package for that User/Technical Story.

---

## Context

The initial Plan gate proved the runtime cursor and deterministic surface delivery, but it surfaced two methodological gaps:

- Plan materialized only `plan.md`; Ariad story work needs a package with `index.md`, `plan.md`, and `test-guide.md`.
- A pulled Delivery Story was allowed to behave like an implementable unit. Ariad now treats Delivery Stories as never directly implementable.

This story replaces the narrower Plan checkpoint gate as the required Plan Done target.

---

## Manual Validation

Validated through Pi/Mirror using `sandbox-pet-store`: Pull of `CV2.DS1` produced Pull/Prepare/Expand, recommended `CV2.DS1.US1`, and Plan for the child User Story materialized `index.md`, `plan.md`, and `test-guide.md` while keeping implementation blocked until approval.

---

## Acceptance Behavior

```text
Given Builder Mode is active for an Ariad-adopted journey
And an implementable User Story or Technical Story has been pulled and prepared
When the Navigator asks Builder to plan the active item
Then Mirror renders the Ariad Plan Checkpoint surface
And materializes index.md, plan.md, and test-guide.md in the Ariad roadmap path
And runtime cursor records active checkpoint after_plan
And runtime cursor records pending confirmation navigator_approval
And implementation remains blocked until approval
```

```text
Given a Delivery Story has been pulled
When Builder executes the Pull cadence
Then Builder prepares the Delivery Story
And expands it into implementable User/Technical Stories
And recommends the next child story to plan
And implementation remains blocked
```

```text
Given the Navigator confirms the recommended child User/Technical Story
When Builder plans that implementable story
Then Builder materializes index.md, plan.md, and test-guide.md
And Plan/test-guide show the validation route appropriate to the approved scope
```

---

## Scope

- Replace single `plan.md` artifact with a story package:
  - `index.md`
  - `plan.md`
  - `test-guide.md`
- Render materialized artifact paths in the Plan surface.
- Use work item level metadata to decide whether the item is implementable by default.
- For Delivery Stories, always expand into User/Technical Stories.
- Recommend the next implementable child story and stop for Navigator confirmation.
- Preserve deterministic Ariad surface wrapping.
- Keep implementation blocked until Plan approval exists.

---

## Out Of Scope

- Implementing sophisticated multi-child expansion heuristics beyond the initial recommended child story.
- Running implementation.
- Running validation checks.
- Closing Review/Coherence/Done.

---

## Validation

Automated evidence recorded during implementation:

```text
98 passed
ruff ok
format ok
mypy ok
```

Navigator validation should be performed in both cadences:

- `stepwise`: manually observe Pull, Prepare, and Plan/Granularity surfaces.
- `checkpoint`: pull a candidate and verify Builder reaches the next true checkpoint without requiring a separate Prepare instruction.

Manual validation routes:

```text
# Stepwise
set cadence to stepwise
pull CV2.DS1
prepare the pulled item
# Expected: Delivery Story expands and recommends a child User Story; no Plan package yet.

# Confirm child story and plan
pull/confirm the recommended User Story
plan the recommended User Story
# Expected: index.md, plan.md, and test-guide.md are materialized for the child story; Plan approval remains pending.

# Approval guard
approve the Plan
check implementation
# Expected: implementation guard allows the next phase.

# Checkpoint cadence
reset sandbox, set cadence to checkpoint, pull CV2.DS1
# Expected: Pull + Prepare + Plan/Granularity surfaces appear in one cadence bundle, stopping before implementation.
```
