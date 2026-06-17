[< Parent](../index.md)

# CV20.DS5.US3 — Delivery Story Validation And Closure

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

A Navigator operating Builder Mode through Pi can validate the aggregate Delivery Story result and proceed through DS-level Debt Review, Coherence, and Done while child work packages remain traceable evidence units.

## Story Statement

As a Navigator using Builder Mode in Pi,
I want to validate and close a Delivery Story as one aggregate lifecycle unit,
So that cohesive Delivery Stories can finish without forcing separate Navigator-facing closure for every child story.

## Acceptance Behavior

```text
Given a Delivery Story is active with `navigator_flow_unit=delivery_story`
And its aggregate DS Plan has been approved
When the Navigator validates the Delivery Story result in natural language
Then Builder records DS-level Validation
And returns a deterministic Ariad surface verbatim
And keeps child work packages visible as evidence units
```

```text
Given DS-level Validation has passed
When the Navigator proceeds through debt review, coherence, and done
Then Builder records DS-level Review, Coherence, and Done
And does not require child-story Navigator checkpoints for closure
```

## Scope

- Add or route DS-level Validation behavior for `delivery_story` flow.
- Add or route DS-level Debt Review, Coherence, and Done behavior for aggregate flow.
- Preserve child work package traceability in surfaces and state.
- Preserve existing story-by-story closure behavior as default.
- Validate through Pi/Builder natural interaction.

## Out Of Scope

- Implementing release intent/push/release policy from `CV20.DS7`.
- Implementing DS8 preferences/config overrides.
- Removing child story artifacts or evidence requirements.
- Changing non-Ariad Builder behavior.

## Validation

- Automated tests for any changed runtime/CLI behavior.
- Pi/Builder natural-language validation is required because this is a User Story.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
