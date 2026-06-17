[< CV20.DS8](../index.md)

# CV20.DS8.US1 — Review Debt Decision Surface

**Status:** ✅ Done
**Type:** User Story

---

## Outcome

After Validation passes, Builder renders a deterministic Debt Review checkpoint that names debt findings, asks for a Navigator debt decision, and blocks Coherence/Done until the decision is resolved.

---

## Context

Ariad requires stories to face debt before closure. The method already declares a `review` lifecycle event, a `review_decision` checkpoint, and a `debt_review_contract`, but Builder did not yet have a runtime operation or surface for this phase.

---

## Acceptance Behavior

```text
Given Validation has passed
When Builder reaches Debt Review
Then Builder renders a DEBT_REVIEW_CHECKPOINT surface
And shows debt findings
And shows the debt review contract
And asks for a Navigator debt decision
And blocks Coherence/Done while the decision is pending
```

```text
Given the Navigator chooses no_action
When Builder records Debt Review
Then Builder clears pending confirmation
And records last delivery event review_complete
And allows the story to proceed to Coherence
```

```text
Given the Navigator defers debt
When defer reason or revisit trigger is missing
Then Builder keeps the checkpoint pending
And names the missing decision evidence
```

```text
Given the Navigator chooses pay_now
When Builder records Debt Review
Then Builder blocks Coherence
And names that pay-now debt must route through Refactor before Coherence
```

---

## Scope

- Add `review-item` CLI command.
- Add `review_lifecycle_item` runtime operation.
- Add deterministic `DEBT_REVIEW_CHECKPOINT` surface.
- Materialize `review.md` when an active story package path exists.
- Update Builder skill routing for Debt Review.

---

## Out Of Scope

- Durable versioned debt ledger entries.
- Refactor loop implementation.
- Coherence and Done closure.

---

## Validation

Focused unit/CLI tests plus Pi/Mirror dogfooding against `sandbox-pet-store`.

Manual validation confirmed the no-action path:

```text
status
reviewed

debt decision
no_action

missing decision
✓ none
```
