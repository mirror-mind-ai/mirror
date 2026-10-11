[< Parent](../index.md)

# CV22.DS6.TS2 — Migration Engine & `_migrations` Bookkeeping in TS

**Status:** ✅ Done — with one carried-debt gap (migration 016; see Findings)
**Type:** Technical Story
**Drafted by:** quality-assurance (Navigator request); reviewed by engineer, database-architect, security-engineer, devops-engineer, ai-engineer, prompt-engineer.
**Depends on:** [CV22.DS6.TS1 Schema Bootstrap & DDL Ownership in TS](../cv22-ds6-ts1-schema-bootstrap-ddl-ownership-in-ts/index.md) (done) for the `node:sqlite` seam and `buildSchemaInventory` contract; the [database-seam strangler decision](../../../../decisions.md).

---

## Technical Story

Ports the migration engine (`src/memory/db/migrations.py`'s `MIGRATIONS` list +
`run_migrations`) to `ts/src/db/migrations.ts`, function-for-function, and
proves — not assumes — that it reproduces Python's real behavior across the
full range of states an installed database can actually be in. TS1 proved the
end-state schema shape; TS2 proves the **engine that gets databases to that
shape**, including transition logic that is dead code on a from-scratch fresh
database and only fires against a genuinely older, already-existing one
(migrations `001`, `005`, `008`, `009`, `016`).

## Outcome

- `ts/src/db/migrations.ts` — all 16 migrations ported faithfully, every
  early-return guard preserved exactly; `runMigrations(db)` commits each
  migration individually via the existing `withTransaction` helper, matching
  Python's per-migration commit/rollback discipline.
- **Track A** (fresh-DB ledger completeness, extends TS1's deferred scope): a
  fresh database's `_migrations` table contains exactly the 16
  `KNOWN_MIGRATION_IDS`, and the resulting schema still matches TS1's
  committed snapshot.
- **Track B** (legacy-transition state-diff — the genuine custody proof): a
  **cascading fixture generator** (`ts/parity/generate_migration_fixtures.py`)
  — one hand-authored genesis seed (pre-`001`, `project`-era shape) run
  forward through Python's real migration functions, checkpointed along the
  way — produces 8 committed fixtures
  (`ts/test/fixtures/migrations/`): `001, 002, 003, 004, 005, 008, 009`, plus
  the full `chain-multi-hop`. Each fixture is proven bidirectionally: a Python
  drift guard (`test_migration_fixtures_snapshot.py`) regenerates from the
  committed seed and asserts no drift; a hermetic TS test
  (`migrationFixtures.test.ts`) runs the ported engine against the same seed
  and asserts it matches Python's real captured end-state — schema shape,
  the `_migrations` ledger, renamed/backfilled row values, and (migration
  `008`) a **functional** FTS-findability assertion, not merely structural.
- Idempotency (fresh and mid-transition legacy seeds) and **partial-failure
  resumability** — both proven in Python (a monkeypatched failing migration
  leaves the correct prefix committed and resumes correctly on retry); the
  resumability half proven directly in TS, with the rollback half guaranteed
  by construction (`runMigrations` is built from the already-independently-
  proven `withTransaction`).
- `ts/parity/migration_structural_parity.ts` — the Navigator-visible route
  (`MIGRATION PARITY: PASS/FAIL`, pinpointing the diverging fixture/field).

## Findings

- **The existing Python test suite barely exercised transition logic before
  this story.** `test_migrations.py` runs against an already-modern fixture
  (every migration no-ops); only `test_english_schema_migration.py` covered
  real transition logic, for migrations `001`/`005` only. This story's
  fixtures are new test infrastructure, not just new assertions.
- **Carried debt (deferred, not silently dropped): migration `016`
  (`builder_workbench_display_codes`) has no legacy-transition coverage.**
  Its real `ADD COLUMN`-if-missing + backfill-against-pre-existing-`NULL`-rows
  logic cannot fire via this cascade, because migration `015` already creates
  `display_code TEXT NOT NULL` inline from genesis forward — there are no
  pre-existing `NULL` rows left by the time the cascade reaches `016`. Only
  "runs without error against an already-modern shape" is proven for it, the
  exact false-confidence problem this story exists to fix, scoped to one
  migration. Fixing it needs a separately hand-authored fixture (a database
  shape matching an *older* version of migration `015`, before `display_code`
  existed there). **Deferred — revisit before CV22.DS6 (the parent Delivery
  Story) is marked Done**, since DS6's own Done Condition requires
  compatibility "proven over real legacy database copies at multiple
  historical migration states," which migration `016` does not yet satisfy.
  See [Review](review.md) for the full debt-review record.
- An Ariad runtime defect was found and worked around (not patched — frozen
  Python; re-homing to TS is CV22.DS7 scope): `review_lifecycle_item`'s entry
  guards don't distinguish "blocked by a different prior checkpoint" from
  "blocked by this same function's own prior `pending` call," making a
  `decision=pending` debt-review call permanently unable to ever resolve
  itself without direct cursor manipulation. Filed as CR047.

## Acceptance Behavior

```text
Given a fresh SQLite database
When the TS migration engine + createSchema() run against it
Then `_migrations` contains exactly the 16 KNOWN_MIGRATION_IDS
And the resulting schema is structurally identical to TS1's committed snapshot

Given each of the 8 committed legacy-transition fixtures (001-005, 008, 009,
  chain-multi-hop)
When Python's real engine and the TS port each run forward from the same seed
Then the resulting schema, `_migrations` ledger, and all migrated row-level
  values (renamed columns, identity.layer values) are identical
And a pre-existing memories row is findable via memories_fts after migration 008

Given the full migration set has already been applied
When it is run again
Then it is a no-op: no error, no duplicate `_migrations` rows, no schema change

Given a migration fails partway through
When the engine is invoked again
Then migrations before the failure remain committed and recorded, and the
  retry resumes from exactly that point
```

Proven by 14 new TS tests + 11 new Python tests, all green. Full regression:
317/317 TS tests, full Python suite green, typecheck/lint/mypy/ruff clean.

## Scope

Port `MIGRATIONS` + `run_migrations` to TS; prove structural and row-level
parity over both fresh-DB and legacy-transition states; idempotency;
partial-failure resumability.

## Out Of Scope

- Cross-process bootstrap locking / connection pragma discipline — CV22.DS6.TS3.
- Front-door new-DB delegation flip — still deferred.
- Any new schema change — `identity.metadata` canonicalization (US1),
  `parent_journey` column (US2).
- Migration `016`'s real transition logic — carried as deferred debt (see
  Findings above), not in this story's delivered scope.

## Validation

- **Automated (CI-safe, data-free, release-blocking):** 14 new TS tests (Track
  A + Track B + idempotency + resumability) + 11 new Python tests (drift guard
  + resumability) — 25 new tests total, all green.
- **Navigator-run:** `node ts/parity/migration_structural_parity.ts` —
  `MIGRATION PARITY: PASS`, 8/8 fixtures. Navigator-validated and accepted,
  with the migration-`016` scope gap explicitly named in the validation
  evidence, not hidden behind an unqualified pass.
- **E2E:** not required — deterministic, data-free.
- Reviewed by the same six-persona panel as TS1 (roles rotated: quality-
  assurance drafted, engineer joined the review).

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
- [Validation](validation.md)
- [Review](review.md)
- [Done](done.md)
