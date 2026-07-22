# Review — CV22.DS6.US2

## Status

Reviewed

## Debt Findings

- US2-core code carries no pay-now debt: migration 017 is guarded + idempotent + backfills journey rows only; the TS-superset-of-Python divergence lives in one shared comparator (schemaTsDivergence.ts) reused by all three renegotiated guards; the softened schema-state guard is explicit and tested. Not debt, tracked elsewhere: (1) runtime activation (migrate-on-open + dual-read/write + integrity) is CV22.DS6.US3 with a recorded split decision; the interim dormant-column/JSON-read state is that story's boundary. (2) Deliberate documented relaxation: the comparator asserts identity.sql CONTAINS the added column rather than reproducing SQLite's exact stored text (structured columns list is still compared exactly). Separate DS6 close blockers: US3 and the carried TS2 migration-016 fixture debt.

## Debt Decision

no_action

## Defer Reason

none

## Revisit Trigger

none

## Missing Decision

- none
