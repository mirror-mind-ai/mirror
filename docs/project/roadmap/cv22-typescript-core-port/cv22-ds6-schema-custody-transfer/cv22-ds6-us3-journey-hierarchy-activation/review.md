# Review — CV22.DS6.US3

## Status

Reviewed

## Debt Findings

- Three carried items, all deferred (none block closure): (1) atomic dual-write of the parent_journey column, deferred to DS7 by Navigator decision — under D1 the column is a non-authoritative shadow, no live TS route creates parented journeys, existing rows covered by the migrate-on-open backfill; (2) single-level-nesting invariant is application-enforced only — no DB CHECK/self-FK; (3) bootstrapLock (DS6.TS3) has a create-then-write-record window where a concurrent opener can read an empty lock file and reclaim it, risking a rare double-winner — the SQLITE_BUSY crash symptom is already mitigated by this story's backup busy_timeout fix, residual is at worst a redundant backup, never a double-apply (runMigrations is idempotent).

## Debt Decision

defer

## Defer Reason

All three are DS7-preparatory (1,2) or pre-existing robustness hardening whose observable symptom is already mitigated (3); none block US3 closure. Recorded so no future plan checkpoint can claim they were unknown.

## Revisit Trigger

DS7 column-authority flip + create/update route port for (1) and (2); bootstrap-lock hardening or any recurrence of lock contention for (3).

## Missing Decision

- none
