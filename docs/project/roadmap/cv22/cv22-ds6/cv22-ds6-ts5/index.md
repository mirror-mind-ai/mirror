# CV22.DS6.TS5 — Migration-016 Legacy Fixture Coverage

**Status:** ✅ Done
**Type:** Technical Story

> **Path note:** this package sits under `roadmap/cv22/cv22-ds6/` rather than the sibling
> convention `roadmap/cv22-typescript-core-port/cv22-ds6-schema-custody-transfer/` because of
> the known **CR048** Ariad-scaffolder path divergence. Normalization is CR048's job.

---

## Outcome

Close DS6's last Done-Condition gap: prove migration `016`'s real
ADD-COLUMN-if-missing + backfill-against-NULL-rows logic against the Python oracle, via a
hand-authored pre-`016` legacy fixture. Today only `016`'s no-op behavior on the modern
shape is proven, because migration `015` inlines `display_code TEXT NOT NULL` from genesis,
so the cascade generator never produces NULL rows for `016` to backfill.

## Scope

- A dedicated `016` path in `generate_migration_fixtures.py`: genesis → `001–014` real, then
  a hand-authored **old-`015` shape** (workbench tables without `display_code`/`ux` indexes),
  seeded with NULL-`display_code` RS/CR rows in deterministic order.
- Extend `_capture_expected` to record the backfilled `(journey, display_code)` values.
- Commit `migration-016-pre-state.sql` + `migration-016-expected.json`.
- Add `"016"` to `migrationFixtures.test.ts` `STEMS` and grade the backfilled codes.

## Out Of Scope

- Migration `015`/`016` engine changes; the other eight fixtures; the CR048 path fix;
  marking CV22.DS6 Done (a separate closure step after this lands).

## Depends On

- [CV22.DS6.TS2](../../cv22-typescript-core-port/cv22-ds6-schema-custody-transfer/cv22-ds6-ts2-migration-engine-migrations-bookkeeping-in-ts/index.md)
  — the migration engine, cascade fixtures, and the deferred `016` debt this story closes.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
