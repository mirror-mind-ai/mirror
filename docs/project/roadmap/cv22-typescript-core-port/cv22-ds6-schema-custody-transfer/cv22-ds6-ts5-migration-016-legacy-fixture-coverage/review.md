# Review — CV22.DS6.TS5

## Status

Reviewed

## Debt Findings

- No pay-now debt in TS5's own code. One observation carried: the fresh-vs-migrated display_code NOT NULL divergence — a fresh DB's migration 015 creates display_code TEXT NOT NULL, while a DB migrated old-015->016 receives it via ADD COLUMN (nullable), so the same column carries two constraint shapes in the wild. Surfaced by this fixture, not introduced by it. Also noted (pre-existing, unchanged): the eight cascade fixtures still stamp wall-clock applied_at, so only the new 016 fixture is frozen/deterministic.

## Debt Decision

defer

## Defer Reason

The NOT NULL divergence is a product-schema question beyond TS5's fixture-coverage scope; the cascade non-determinism is pre-existing and out of scope. Neither blocks TS5 closure. Recorded so a future schema/plan checkpoint cannot claim they were unknown.

## Revisit Trigger

Next time the builder_workbench schema is touched (or DS7/DS10 schema consolidation) for the NOT NULL divergence; if the cascade fixtures ever need determinism (e.g. joining the CI determinism gate) for the timestamp issue.

## Missing Decision

- none
