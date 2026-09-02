[< Parent](../index.md)

# CV20.DS15.US1 — One-Turn Conditional Plan Orchestration

**Status:** ✅ Done
**Type:** User Story

---

## User Story

As the Navigator,
I want to preauthorize one exact Delivery Story Plan through natural language,
so that the Driver can materialize and complete the Plan, consume my authority,
and begin local implementation without asking me to repeat approval.

## Outcome

The Pi Builder skill recognizes only explicit exact-scope intent. It routes Plan
creation with `--preauthorize-approval --stop-after navigator_validation`, requires
the Driver to complete the preserved Plan, then uses `--use-preauthorization` in
the same turn. Matching authority starts local implementation once; mismatch
returns to ordinary approval; cancellation is explicit.

## Acceptance Behavior

```text
Given explicit authority for the active Delivery Story and exact child set
And the fixed next stop is Navigator Validation
When the Driver completes a matching Plan in the same turn
Then approval and implementation start without another Navigator message
And work stops at Navigator Validation
```

```text
Given vague continuation, cadence, or unrestricted-autonomy language
When Builder interprets the request
Then no receipt is created
And the ordinary Plan gate remains
```

## Scope

- Pi natural-language routing contract.
- Deterministic receipt, mismatch, approval, and implementation-start surfaces.
- Explicit cancellation command.

## Out Of Scope

- Story-by-story preauthorization.
- Claude/Gemini natural-language parity in this first slice.
- Push, release, deploy, purchase, validation acceptance, Debt Review, or Done.

## Validation

CLI/parser and Pi skill-contract tests in `tests/unit/memory/cli/test_build.py`.
Navigator-visible aggregate validation was accepted at the parent checkpoint.
