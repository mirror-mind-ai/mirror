[< Parent](../index.md)

# CV22.DS5.US3 — Consult Command Parity

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Port the consult command core to TS behind replayable provider/credits/cost seams and Python-compatible rendering, without front-door routing or live-provider CI dependency.

## Story Statement

As a user,
I want to Consult Command Parity,
So that I can receive the value of this story.

## Acceptance Behavior

```text
Given the starting state needed for Consult Command Parity
When the Navigator exercises Consult Command Parity
Then the planned observable behavior is visible
And out-of-scope sibling roadmap items remain untouched
```

## Scope

- Deliver Consult Command Parity as an observable slice.
- Keep the implementation narrow enough to validate at the Plan-defined checkpoint.

## Out Of Scope

- Do not implement sibling roadmap item: Front-Door External-API Routing And Dogfood.
- Do not implement sibling roadmap item: External-API Commands.

## Validation

- Run automated tests that cover the planned behavior.
- Provide a Navigator-visible route with expected observation, pass condition, and fail condition.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
