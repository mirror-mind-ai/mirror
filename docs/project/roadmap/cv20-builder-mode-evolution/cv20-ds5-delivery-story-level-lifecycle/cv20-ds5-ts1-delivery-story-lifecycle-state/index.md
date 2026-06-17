[< Parent](../index.md)

# CV20.DS5.TS1 — Delivery Story Lifecycle State

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Builder persists and resumes the minimal Delivery Story lifecycle state needed for aggregate DS flow: Navigator flow unit, child work packages, and aggregate checkpoint status.

## Technical Story Statement

In order to support Delivery Story-level lifecycle,
As Builder runtime,
I want durable DS lifecycle state for flow unit, child work packages, and aggregate checkpoint status,
So that later DS-level Plan and Validation stories can operate without losing child-story traceability.

## Acceptance Behavior

```text
Given an Ariad delivery cursor exists
When Builder records Delivery Story lifecycle state
Then the cursor can persist child work package ids and aggregate checkpoint status
And resume can read them without changing the default story-by-story behavior
```

```text
Given no Delivery Story lifecycle state has been recorded
When Builder inspects the active cursor
Then child work packages are empty
And aggregate checkpoint status is empty
And the effective flow unit remains story_by_story
```

## Scope

- Extend Builder delivery cursor state with child work package identifiers.
- Extend Builder delivery cursor state with aggregate Delivery Story checkpoint status.
- Preserve existing cursor fields and lifecycle behavior.
- Add focused tests for persistence, default behavior, and rendering/inspection.
- Keep the state model narrow enough for later DS5 stories to consume.

## Out Of Scope

- Implementing DS-level Plan approval; this belongs to CV20.DS5.US2.
- Implementing DS-level Validation/Debt Review/Coherence/Done; this belongs to CV20.DS5.US3.
- Implementing release intent, push policy, or release authorization from CV20.DS7.
- Implementing DS8 preferences/config overrides.
- Changing non-Ariad Builder behavior.

## Validation

- Unit tests verify cursor persistence and default values.
- Focused Builder/CLI tests remain green.
- No Navigator external behavior validation is required beyond CLI/runtime inspection because this is internal state substrate.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
