[< CV9.DS7](../index.md)

# CV9.DS7.TS2 — Extract Metadata Lifecycle Policy Boundary

**Type:** Technical Story  
**Status:** Done  
**Parent:** [CV9.DS7 Conversation Metadata Lifecycle](../index.md)

---

## Intent

Extract the metadata lifecycle decision policy out of `ConversationService` into
a clearer internal boundary before US2 adds apply/mutation behavior.

Implemented boundary: `memory.services.metadata_lifecycle`.

---

## Why Now

D-001 was carried after US1/TS1 because the behavior was dry-run-only. US2 adds
mutation behavior, which would grow the debt at its revisit trigger.

TS2 pays the debt before writes are added.

---

## Verification Seed

Dry-run output and existing behavior remain unchanged after policy extraction:

- manual title locks are preserved;
- provisional/weak titles still report repair;
- later-specific summary evidence still reports `refine_candidate`;
- summary/tag readiness decisions remain unchanged;
- CLI dry-run still works.

---

## Plan and Validation

- [Plan](plan.md)
- [Test Guide](test-guide.md)
