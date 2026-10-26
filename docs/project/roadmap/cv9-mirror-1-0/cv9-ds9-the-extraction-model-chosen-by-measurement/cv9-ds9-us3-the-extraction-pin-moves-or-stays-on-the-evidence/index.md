[< Parent](../index.md)

# CV9.DS9.US3 — The extraction pin moves, or stays, on the evidence

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

As a user,
I want to The extraction pin moves, or stays, on the evidence,
So that I can receive the value of this story.

## Outcome

Navigator can validate The extraction pin moves, or stays, on the evidence as an observable behavior.

## Acceptance Behavior

```text
Given the user is ready for The extraction pin moves, or stays, on the evidence
When the user performs the planned action
Then the expected observable behavior is visible
And unrelated Delivery Story scope remains untouched
```

## Scope

- The extraction pin moves, or stays, on the evidence

## Out Of Scope

- Sibling Delivery Story scope.

## Carried From TS1

TS1's Debt Review (2026-10-26) deferred two items to this story's Plan:

- **D2, the ledger.** `llm_calls` cannot tell which calls ran with which reasoning
  setting. That matters once the default changes here.
- **D3, Flash Lite's rate limits.** Flash Lite drew HTTP 429 on 31% of its eval
  attempts across TS1's runs, and the development home logged one rate-limited
  reception on 2026-10-25. The production home's log shows none. If the pin stays, capture this as a Change Request.

## Validation

Navigator-visible validation route plus automated checks.
