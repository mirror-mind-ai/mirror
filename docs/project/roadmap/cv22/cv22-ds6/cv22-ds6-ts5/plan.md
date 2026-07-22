# Plan — CV22.DS6.TS5 — Migration-016 Legacy Fixture Coverage

> Package path reflects the known **CR048** Ariad-scaffolder path divergence (siblings
> live under `cv22-typescript-core-port/cv22-ds6-schema-custody-transfer/`); normalization
> is CR048's job, not this story's.

## Objective

Prove migration `016`'s real **ADD-COLUMN-if-missing + backfill-against-NULL-rows**
logic against the Python oracle, via a hand-authored pre-`016` legacy fixture — closing
DS6's last Done-Condition gap (compatibility proven over real legacy copies at multiple
historical migration states).

## Context (the debt)

Migration `016` (`builder_workbench_display_codes`) adds `display_code` to
`builder_refinement_stories` / `builder_change_requests` and backfills `RS001/CR001…`
for pre-existing rows. But the cascade generator can never reach that logic: the current
migration `015` inlines `display_code TEXT NOT NULL` from genesis, so by checkpoint `016`
there are no NULL rows to backfill. Only "runs without error against the modern shape" is
proven — the exact false-confidence TS2 exists to disprove. The real branches only fire
against a DB created by an **older `015`** (before `display_code` existed there).

## Scope

1. **Generator** (`ts/parity/generate_migration_fixtures.py`): a dedicated `016` path that
   - runs genesis → migrations `001–014` for real (Python oracle),
   - hand-authors the **old-`015` shape**, **derived from migration `016`'s own operations**
     (db-architect): `016` ADDs `display_code` and creates the two `ux_…_display_code`
     indexes, so old-015 = current `015` **minus exactly those** — tables without
     `display_code` and without the `ux` indexes, keeping the non-`display_code` status
     indexes and `builder_refinement_cursors`. Marks `015` applied in `_migrations`.
   - seeds RS/CR rows across **two journeys** with distinct `position`/`created_at`, **plus
     one journey where a pre-set `display_code` row is interleaved with NULL rows** — because
     the backfill numbers by position among *all* rows but writes via
     `COALESCE(display_code, ?)`, so a preset row shifts the NULL rows' codes (QA); this is
     the case that distinguishes the real branch from a naïve "number the NULLs",
   - respects FK order (`builder_change_requests.refinement_story_id → builder_refinement_stories(id)`),
   - dumps the portable pre-state SQL.
2. **Capture the backfill result, not just the shape.** Extend `_capture_expected` to
   record the builder-workbench `(journey, display_code)` values Python's real `016`
   produces, as **optional** fixture-specific fields (populated only when those rows exist).
3. **Fixtures**: commit `migration-016-pre-state.sql` + `migration-016-expected.json`.
4. **Test** (`ts/test/db/migrationFixtures.test.ts`): add `"016"` to `STEMS`; extend
   `ExpectedFixture` + assertions so the backfilled `display_code` values are graded against
   the oracle — the real ADD-COLUMN + backfill branches genuinely execute.

## Non-Goals

- Changing migration `015`/`016` engine code (this is coverage, not a behavior change).
- Touching the other eight cascade fixtures.
- Normalizing the CR048 scaffolder path.
- Marking CV22.DS6 Done (separate closure step after this lands).

## Acceptance Behavior

```text
A1  The pre-016 seed is a valid old-015 DB: builder-workbench tables have no
      display_code column and no ux_…_display_code index, hold RS/CR rows with no
      display_code, and _migrations shows 001–015 applied (016 pending).
A2  TS runMigrations applies 016: the display_code columns + ux unique indexes exist,
      and the backfilled codes (RS001/RS002…, CR001/CR002…, per-journey, in the
      migration's ORDER BY) match the Python oracle exactly.
A3  Schema inventory + _migrations (001–016, plus TS-only 017) match the oracle via the
      enumerated TS ⊇ Python divergence; the other eight fixtures are unchanged; and
      regenerating the fixtures is a no-op diff (deterministic).
```

## Validation Route

- **Automated (CI-covered):** `cd ts && node --test test/db/migrationFixtures.test.ts` — the
  `016` fixture proves schema, ledger, and **backfilled-value** parity against the committed
  Python-oracle expected state (incl. the multi-journey reset, intra-journey tiebreaks, and
  the interleaved preset/NULL case). Assertions are non-vacuous (codes actually assigned).
- **Determinism — corrected (devops):** ~~regenerate = no-op diff~~ does **not** hold: the
  generator stamps `_migrations.applied_at` with wall-clock `_now()`, so the committed
  fixtures carry baked timestamps and regeneration diffs (this is why these fixtures are
  *not* in the CI determinism gate). The gate is the **parity test**, not regeneration. The
  generator must remain able to reproduce the `016` fixture on demand (deterministic modulo
  the timestamp column).
- **E2E decision: fixture-level accepted.** This story *is* a parity fixture; it has no
  runtime path to exercise end to end. Requesting Navigator acceptance of the narrower
  fixture-level route in lieu of a runtime E2E.

## Panel Findings Carried

- **Reachability (db-architect):** git history is squashed (`66dee28`), so the old-`015`
  state can't be confirmed from history; `016`'s branch may be defensive code no fresh DB
  ever reaches. The fixture is a **regression guard for a defensive/never-on-fresh branch** —
  stated honestly, not implying a live migration path.
- **Fresh-vs-migrated divergence (db-architect):** fresh `015` makes `display_code` **NOT
  NULL**; `016`'s `ADD COLUMN` makes it **nullable** — a real product schema-drift on the
  same column. Out of scope to fix here; **noted as an observation** for a future item.
- **Harness compatibility (QA):** confirm the shared assertions
  (`memory_legacy_row`/`attachment`/`task`/FTS) tolerate a workbench-only seed (expected
  JSON carries the right nulls).

## Implementation Contract

- TDD: add the `016` fixture + failing assertions, then the generator, until green.
- `uv run` for Python; the node test runner for TS. Story-scoped commits, descriptive
  English messages. No `git add .`.
- Never assert against the live DB — fixtures are synthetic and committed.

## Stop Conditions

- scope_change_detected (e.g. the fixture reveals a real `016` engine bug — that becomes its own item)
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
