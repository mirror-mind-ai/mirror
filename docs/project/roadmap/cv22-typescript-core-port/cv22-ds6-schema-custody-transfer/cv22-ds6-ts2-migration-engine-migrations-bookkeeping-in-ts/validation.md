# Validation — CV22.DS6.TS2

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test (317/317 passed, incl. migrations.test.ts [Track A + resumability] and migrationFixtures.test.ts [Track B, 8 fixtures + idempotency]); uv run pytest (full Python suite green, exit 0, incl. new migration_fixtures_snapshot drift guard [9 tests] and migration_resumability [2 tests]); uv run mypy ts/parity/generate_migration_fixtures.py (clean); uv run ruff check + format --check (clean on touched files); node ts/parity/migration_structural_parity.ts (PASS, all 8 fixtures)

Checks status: passed

## E2E

Decision: not_required

Evidence: Same reasoning as TS1: deterministic, data-free. Track B fixtures prove genuine legacy-transition logic (not just fresh-DB shape) via a cascading generator: one hand-authored genesis seed run forward through Python's real engine, checkpointed at 001,002,003,004,005,008,009 plus the multi-hop full chain -- 8 fixtures, each proven bidirectionally (Python drift-guard + TS hermetic consumer).

## Navigator Validation

Route: node ts/parity/migration_structural_parity.ts -- seeds each of the 8 committed legacy-transition fixtures, runs the TS runMigrations(), and compares schema shape, the _migrations ledger, row-level renamed/backfilled values, and FTS findability against Python's real committed end-state. Ends in one MIGRATION PARITY: PASS/FAIL line, pinpointing which fixture and which field diverged on failure.

Navigator accepted: yes

Expected observation: 8/8 fixtures report PASS (001,002,003,004,005,008,009,chain-multi-hop); final line MIGRATION PARITY: PASS; exit code 0. KNOWN INCOMPLETE SCOPE: migration 016 (builder_workbench_display_codes) is NOT covered -- its real ADD-COLUMN/backfill logic cannot fire via this cascade since migration 015 already creates display_code NOT NULL inline from genesis forward; only 'runs without error on an already-modern shape' is proven for 016, the same false-confidence problem this story exists to fix, just for one migration. Flagged as a Debt Review finding, not hidden.

Pass condition: All 8 covered fixtures report PASS; exit code 0. Does NOT certify migration 016's real transition logic.

Fail condition: Any covered fixture reports FAIL with the diverging field named; exit code 1.

## Missing Evidence

- none
