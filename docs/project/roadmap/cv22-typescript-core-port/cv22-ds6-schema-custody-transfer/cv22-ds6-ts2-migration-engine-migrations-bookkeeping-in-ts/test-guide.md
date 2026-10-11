[< Story](index.md)

# Test Guide — CV22.DS6.TS2

**Drafted by:** quality-assurance. Revised after six-persona Plan review.

## Shared Seed-Builder Helper (build first)

Before writing fixture #1, extract a small shared helper (mirroring
`test_english_schema_migration.py`'s `_old_schema_conn()` shape) that
constructs a "database at state N" connection from a declared shape + seed
rows. Fixtures #2–9 compose this helper rather than duplicating boilerplate
(engineer condition).

## Track A — Fresh-DB Ledger Completeness (extends TS1)

- Run TS `createSchema()` + the ported migration engine against an empty file.
- Assert `_migrations` contains exactly the 16 ids in `KNOWN_MIGRATION_IDS`
  (`schemaState.ts`) — no more, no fewer — including ids whose bodies no-op on
  a fresh DB (008, 009) and the id whose ADD-COLUMN branch is dead there (016).
- Assert the resulting schema still matches TS1's committed
  `SCHEMA_INVENTORY_SNAPSHOT` (regression guard — migrations must not silently
  alter the shape TS1 already proved).
- Idempotency: run the engine twice; `_migrations` row count per id stays 1,
  no error, no schema change.

## Track B — Legacy-Transition State-Diff (the genuine custody proof)

**Primary proof: the multi-hop fixture.** Seeded at the oldest pre-001 state,
run Python's real `run_migrations` and the TS port each through the full
16-step chain forward on parallel copies of the same seed. This is the proof
that matters most — a real upgrade is one long-lived database walking forward
through all 16 steps, not 9 independent scenarios (database-architect).

**Secondary/diagnostic: per-migration fixtures**, purely synthetic, never
derived from a real captured database (security-engineer) — for the
migrations with non-trivial transition logic: **001, 002, 003, 004, 005, 008,
009, 015, 016**. Named `migration-{NNN}-pre-state.*`; the multi-hop fixture is
`migration-chain-multi-hop-pre-state.*` (devops-engineer naming convention).
These isolate *which* step is at fault if the multi-hop fails.

Per fixture (multi-hop and per-step alike), compare:

- **Schema shape** — via TS1's `buildSchemaInventory` contract (tables,
  columns, indexes, triggers) — must match exactly.
- **`_migrations` ledger** — same id set "applied" after the run (exact
  timestamps are expected to differ; only presence/absence is compared).
- **Row-level values**, for migrations that move data, not just shape:
  - 001/005: renamed `travessia`/`caminho` values become `journey`/
    `journey_path` — **including `identity.layer` values**, proving they land
    on the exact modern taxonomy strings TS1's `schema.ts` comments already
    commit to verbatim (prompt-engineer condition). Pre-existing row content
    is preserved.
  - 002/003: rows created under the old shape are still present and
    correctly renamed after 005 runs forward.
  - 015/016: `display_code` backfill against **pre-existing rows** (not
    just an empty table) produces the same `RS###`/`CR###` sequence, in the
    same order, as Python's backfill — collation is `BINARY` on both
    runtimes (verified, no explicit `COLLATE` anywhere in schema/migrations).
  - 008/009: applying to a database that has `memories` but not yet
    `memories_fts`/reinforcement columns produces identical DDL.
  - **008 specifically also requires a functional assertion** (ai-engineer
    condition): after migration, a pre-existing `memories` row must be
    **findable via `memories_fts`** — not merely that the virtual table
    exists. A silent bug in the repopulation `INSERT ... SELECT` would
    otherwise degrade retrieval on a real upgraded install without any test
    catching it.
- **FK-enforcement consideration** (database-architect): every connection
  runs with `foreign_keys=ON`; at least one fixture should include a
  legitimate-but-non-trivial FK relationship to confirm renames/backfills
  don't trip enforcement unexpectedly.

## Idempotency And Resumability

- Full-chain idempotency (Track A) extended to the multi-hop mid-transition
  seed: apply once, apply again, assert no duplication/error.
- **Partial-failure resumability — in scope** (resolved; security-engineer's
  integrity argument): simulate a migration that throws partway through;
  assert migrations before it remain committed/recorded, the failing one is
  not recorded, and a subsequent run resumes and completes correctly from
  exactly that point.

## CI Pattern (explicit, not implied — devops-engineer condition)

Mirrors TS1's pattern exactly, extended to multiple fixtures:

1. A Python step generates each fixture's expected end-state (schema shape,
   `_migrations` rows, migrated row values) and **commits** it.
2. A Python test **drift-guards** each committed expectation against a live
   re-run of Python's real `run_migrations`.
3. The TS test consumes the committed seed + expected state **hermetically**
   — zero live Python calls at Node-test runtime (the Node CI job has no
   `uv`/Python available).

## E2E Decision

**Not required** — deterministic, data-free; the larger surface area is
addressed by the multi-hop-as-primary structure, not by a runtime E2E.

## Navigator Validation

Extend the TS1 parity script (or add a sibling) to report per-migration-
checkpoint pass/fail, the `_migrations` ledger comparison, and the multi-hop
result, ending in one summary line (finalized during implementation).

## Validation Evidence

Pending implementation and validation.
