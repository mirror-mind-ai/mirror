[< CV20.DS4](../index.md)

# CV20.DS4.TS2 — Lifecycle Contract Definitions

**Status:** ✅ Done
**Type:** Technical Story

---

## Outcome

Ariad method data declares phase-specific lifecycle contracts that Plan and later runtime gates can render and enforce.

---

## Scope

- Add `ContractDefinition` to the Builder method DSL.
- Validate contract ids, lifecycle event references, rules, stop conditions, and required outputs.
- Declare Ariad contracts for Pull, Prepare, Plan, Implement, Validation, Debt Review, Coherence, and Done.
- Include E2E rules across Plan, Implement, and Validation.
- Render contracts during method inspection.
- Sync Ariad docs with lifecycle contract language.

---

## Validation

Automated validation covers method model validation, Ariad fixture contracts, and method inspection output.
