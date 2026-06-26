[< Story](index.md)

# Review — CV20.DS2.TS1 Runtime Method State Sync

## Changed Surface

- Added `/Users/alissonvale/Code/mirror-dev/src/memory/builder/method_adoption.py` with runtime state helpers for Builder method adoption.
- Added `/Users/alissonvale/Code/mirror-dev/tests/unit/memory/builder/test_method_adoption.py` with focused tests for empty state, write/read, idempotency, validation, clearing, and journey separation.
- Reorganized `/Users/alissonvale/Code/mirror-dev/docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds2-ariad-adoption/index.md` so runtime state sync is TS1, adoption behavior is US1, and template generation is US2.

## Refactoring Done

- Kept adoption state separate from operating-mode state so adopted method does not depend on whether Builder Mode is currently active.
- Used a stable runtime-session key per journey instead of adding a database migration in this first slice.
- Kept this slice state-only. No CLI adoption command, Pi route, template generation, cursor sync, or lifecycle execution was introduced.

## Refactoring Considered But Not Done

- Dedicated database table for adopted methods. Deferred until adoption state grows beyond a single method marker or needs richer querying.
- Integrating adopted method into method inspection immediately. Deferred to `CV20.DS2.US1`, where the Navigator-visible adoption behavior is implemented.

## Debt Paid

None.

## New Debt Introduced

None identified during review.

## Debt Carried Forward

None.

## Review Decision

No debt action required.
