[< Parent](../index.md)

# CV20.DS6.US1 — Builder Home Work Fields

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Builder activation for an Ariad-adopted journey with no active item becomes a situated Builder Home orientation surface. The Navigator can see the current Delivery field and the initial Refinement field before choosing what to pull or organize.

## Story Statement

As Navigator,
I want Builder activation to show current Delivery and Refinement work fields,
So that I can choose the next movement from real project state without confusing orientation with execution.

## Acceptance Behavior

```text
Given a journey has adopted Ariad
And its delivery cursor has no active item or pending confirmation
When Builder Mode is activated for that journey
Then Builder renders a Builder Home orientation surface
And the surface includes a Delivery field with current roadmap focus and recommended pull
And the surface includes a Refinement field that honestly states Workbench storage is not implemented yet
And no lifecycle work is pulled or executed automatically
```

## Scope

- Render Delivery and Refinement work fields during no-active-item Builder activation.
- Keep Refinement read-only and honest before Workbench storage exists.
- Preserve existing resume behavior when an active item or pending confirmation exists.
- Harden `/mm-build` guidance so marked Ariad surfaces are rendered visibly before commentary.

## Out Of Scope

- Do not implement sibling roadmap item: Builder Documentation And Migration.
- Do not implement sibling roadmap item: Workbench Storage Model.
- Do not implement sibling roadmap item: Refinement Flow Runtime.
- Do not implement sibling roadmap item: Compose A Refinement Story.
- Do not implement sibling roadmap item: Pull A Refinement Story.
- Do not implement sibling roadmap item: Traverse Change Request Cycles.
- Do not implement sibling roadmap item: Close A Refinement Story.
- Do not implement sibling roadmap item: Refinement Workbench And Flow.
- Do not implement sibling roadmap item: Define Delivery Story Release Intent.
- Do not implement sibling roadmap item: Release And Push Policies.
- Do not implement sibling roadmap item: Debt Ledger And Refactor Loop.
- Do not implement sibling roadmap item: Method Preferences And Overrides.

## Validation

- Run automated tests that cover the planned behavior.
- Provide a Navigator-visible route with expected observation, pass condition, and fail condition.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Debt Review](review.md)
- [Coherence](coherence.md)
- [Done](done.md)
