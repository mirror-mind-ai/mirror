[< CV20.DS4](../index.md)

# CV20.DS4.TS4 — Work Item Levels And Expand Contract

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Ariad method data declares roadmap work item levels, which levels are implementable by default, and that Delivery Stories must always expand into User/Technical Stories before Plan or implementation.

---

## Context

Current runtime can pull `delivery_story`, `user_story`, and `technical_story`, but the implementability rule still lives implicitly in the engine and conversation. That risks normalizing an inconsistent flow where a Delivery Story goes directly from Pull to Plan to Implement without an explicit granularity decision.

---

## Scope

- Add work item level definitions to the Builder method DSL.
- Declare Ariad levels:
  - `delivery_story`: not implementable by default; may expand to `user_story` and `technical_story`.
  - `user_story`: implementable by default.
  - `technical_story`: implementable by default.
- Add `expand` to the Ariad lifecycle definition and lifecycle ribbon.
- Add/adjust contracts:
  - Prepare identifies implementability and expansion need.
  - Expand materializes child User/Technical Stories.
  - Plan requires an implementable User Story or Technical Story.
- Update method inspection to show work item levels and expand contract.

---

## Acceptance Behavior

```text
Given Ariad method data is inspected
When Builder renders the method definition
Then Delivery Story is shown as not implementable by default
And User Story and Technical Story are shown as implementable by default
And Expand is shown as a lifecycle phase between Prepare and Plan
And Delivery Story is never shown as directly plannable
```

```text
Given a Delivery Story has been pulled
When Prepare assesses it
Then Builder can determine that a granularity decision is required before implementation
```

---

## Validation

Focused unit tests for method definition validation, Ariad fixture levels/contracts, lifecycle ribbon, and method inspection.

Evidence recorded during implementation:

```text
98 passed
ruff ok
format ok
mypy ok
```
