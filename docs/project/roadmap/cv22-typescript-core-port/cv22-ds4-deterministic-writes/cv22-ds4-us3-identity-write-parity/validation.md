# Validation — CV22.DS4.US3

## Status

Passed

## Automated Checks

- ts: npm run typecheck + biome check (exit 0) + node:test 106 pass; uv run ruff check ts/parity/write_parity.py

Checks status: passed

## E2E

Decision: waived

Evidence: Fixture-level demo-DB E2E ran and passed: write_parity.py --probe identity -> overall_match: true (4 rows, equal hashes); reinforcement+journey regressions also true. Broader/live-DB write E2E waived (same posture as TS1/US1/US2), Navigator-accepted.

## Navigator Validation

Route: uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db; uv run python ts/parity/write_parity.py --source-db tmp/parity/demo-memory.db --probe identity

Navigator accepted: yes

Expected observation: overall_match: true across the identity row incl. metadata string for INSERT, UPDATE, metadata-None inheritance, and metadata-only; exit 0

Pass condition: identity-table state-diff PASS under injected id and frozen now, reproducible; metadata-None case inherits stored metadata with no spurious change

Fail condition: metadata string / content / timestamp / id / version diverges, non-zero exit, or copy/backup guard abort

## Missing Evidence

- none
