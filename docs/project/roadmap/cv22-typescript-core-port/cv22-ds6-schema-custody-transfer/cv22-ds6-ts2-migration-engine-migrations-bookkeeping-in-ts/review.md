# Review — CV22.DS6.TS2

## Status

Reviewed

## Debt Findings

- Migration 016 (builder_workbench_display_codes) has no legacy-transition coverage. Its real ADD-COLUMN-if-missing + backfill-against-pre-existing-NULL-rows logic cannot fire via the cascading fixture generator built for this story, because migration 015 already creates display_code TEXT NOT NULL inline from genesis forward -- there are no pre-existing NULL rows left to backfill by the time the cascade reaches 016. Only 'runs without error against an already-modern shape' is proven, which is the exact false-confidence problem CV22.DS6.TS2 exists to fix, scoped down to one migration. Fixing this requires a separately hand-authored fixture: a database shape matching an OLDER version of migration 015 (display_code missing or nullable, no unique index yet), seeded with pre-existing rows that have NULL display_code, so the real ADD COLUMN + backfill branches genuinely execute.

## Debt Decision

defer

## Defer Reason

The fixture needs a separately hand-authored legacy shape (pre-015-without-NOT-NULL), a meaningfully different effort than the cascading generator built for the other 8 migrations (001-005, 008, 009, multi-hop). TS2 already delivers a complete, working, extensively-validated migration engine (all 16 migrations ported, 317/317 TS tests, full Python suite green) without it; the gap is narrow and precisely named, not silently absorbed.

## Revisit Trigger

Before CV22.DS6 (the parent Delivery Story) is marked Done -- DS6's own Done Condition requires compatibility proven over real legacy database copies at multiple historical migration states, which is not honestly satisfiable while migration 016 is uncovered, even though TS2 itself is complete.

## Missing Decision

- none
