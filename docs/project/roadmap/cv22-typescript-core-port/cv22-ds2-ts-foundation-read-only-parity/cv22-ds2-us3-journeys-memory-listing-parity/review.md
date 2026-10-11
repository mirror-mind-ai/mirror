# Review — CV22.DS2.US3

## Status

Reviewed

## Debt Findings

- Per the agreed option B, memory-listing *ordering* parity is proven in the real-DB-copy harness (against a copied DB through the seam), not in the CI `node:test` suite. CI covers the query builder and row mapper without a database. So a regression in SQLite-ordering behavior would be caught by the portable/manual route, not by CI.
- The `count_by_type` cross-check compares a sorted set of `type=count` tokens because SQLite leaves `GROUP BY` order unspecified; it does not assert a specific group order (matching the Python CLI, which sorts before display).

## Debt Decision

defer

## Defer Reason

Pushing the sort down to SQLite is the database-seam contract, and the harness proves the ordering against a real copied DB with redacted evidence; adding a CI-gated ordering test would require building a throwaway DB and duplicating schema in the test tier, which was explicitly weighed and declined (option B). The `count_by_type` set comparison matches the observable CLI behavior.

## Revisit Trigger

When journeys/memory listing are routed through the Pi TS front door (CV22.DS3), decide whether front-door dogfooding plus the harness is sufficient, or whether a CI-gated listing-order fixture (test-time DB built from a committed synthetic seed) is worth the added machinery.

## Missing Decision

- none
