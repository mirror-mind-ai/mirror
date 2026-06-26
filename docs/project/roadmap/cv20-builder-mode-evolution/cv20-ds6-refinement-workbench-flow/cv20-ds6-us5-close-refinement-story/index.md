[< Parent](../index.md)

# CV20.DS6.US5 — Close A Refinement Story

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Make the RS-level close path coherent: review completed CR outcomes, check coherence without mutation, close the RS with summary preserved, clear active Refinement cursor, and keep Delivery Work untouched.

## Story Statement

As a user,
I want to Close A Refinement Story,
So that I can receive the value of this story.

## Acceptance Behavior

```text
Given the starting state needed for Close A Refinement Story
When the Navigator exercises Close A Refinement Story
Then the planned observable behavior is visible
And out-of-scope sibling roadmap items remain untouched
```

## Scope

- Deliver Close A Refinement Story as an observable slice.
- Keep the implementation narrow enough to validate at the Plan-defined checkpoint.

## Out Of Scope

- Do not implement sibling roadmap item: Builder Documentation And Migration.
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
