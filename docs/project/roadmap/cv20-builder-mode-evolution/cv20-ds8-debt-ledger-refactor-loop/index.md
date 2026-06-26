[< CV20](../index.md)

# CV20.DS8 — Debt Ledger And Refactor Loop

**Status:** 🟡 Planned

---

## Outcome

Review creates a durable technical-debt ledger and routes pay-now debt through an explicit Refactor loop.

Debt deferred by the Navigator records a reason and revisit trigger. Debt paid now returns to Validation and Review before Done.

---

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV20.DS8.US1](cv20-ds8-us1-review-debt-decision-surface/index.md) | Review debt decision surface | User Story | Navigator sees debt findings and confirms pay-now, defer, or no-action decisions | ✅ Done |
| CV20.DS8.TS1 | Versioned debt ledger | Technical Story | Debt items are stored in a versioned ledger and indexed for runtime lookup | 🟡 Planned |
| CV20.DS8.US2 | Refactor loop | User Story | Pay-now debt routes through Refactor and returns to Validation before closure | 🟡 Planned |

---

## Done Condition

DS8 is done when no story can close with invisible debt or deferred debt without rationale.
