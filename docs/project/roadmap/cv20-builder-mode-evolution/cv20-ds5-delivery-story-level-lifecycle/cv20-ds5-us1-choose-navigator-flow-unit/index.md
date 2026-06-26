[< Parent](../index.md)

# CV20.DS5.US1 — Choose Navigator Flow Unit

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

Builder can surface a Navigator decision after Delivery Story expansion: follow lifecycle checkpoints story-by-story or use the Delivery Story as the Navigator-facing flow unit.

The choice changes checkpoint cadence and visibility, not traceability. Delivery Stories still expand into child User/Technical Stories, and child artifacts remain available to the Driver.

## Story Statement

As a Navigator,
I want to choose whether a Delivery Story is governed story-by-story or as one aggregate Delivery Story flow,
So that I can match the checkpoint cadence to the shape and risk of the work.

## Acceptance Behavior

```text
Given a Delivery Story has been expanded into child work items
When Builder renders the next decision surface
Then the Navigator can choose `story_by_story` or `delivery_story` as the flow unit
And Builder explains the consequences of each choice
```

```text
Given the Navigator chooses `story_by_story`
When Builder continues lifecycle work
Then child User/Technical Stories remain the Navigator-facing Plan, Validation, Review, Coherence, and Done units
```

```text
Given the Navigator chooses `delivery_story`
When Builder continues lifecycle work
Then the Delivery Story becomes the Navigator-facing lifecycle unit
And child User/Technical Stories remain internal Driver work packages with traceable artifacts
```

## Scope

- Define the Navigator flow unit vocabulary:
  - `story_by_story`
  - `delivery_story`
- Add a deterministic Builder/Ariad surface for choosing the flow unit after DS expansion.
- Make the surface explain when each mode is appropriate.
- Persist or expose the selected flow unit sufficiently for resume/inspection if implementation touches runtime state.
- Preserve the current `story_by_story` behavior as the default.

## Out Of Scope

- Implementing the full Delivery Story plan checkpoint; this belongs to CV20.DS5.US2.
- Implementing DS-level validation, debt review, coherence, and done; this belongs to CV20.DS5.US3.
- Implementing the full runtime state model for aggregate lifecycle if it requires a larger slice than the decision surface; this belongs to CV20.DS5.TS1.
- Removing child story artifacts or making Delivery Stories opaque implementation units.
- Changing non-Ariad Builder behavior.

## Validation

- Automated tests cover the flow-unit decision model/surface and default behavior.
- CLI or runtime inspection shows the chosen/default flow unit.
- Navigator-visible validation demonstrates that the two choices are presented distinctly and do not execute implementation work.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
