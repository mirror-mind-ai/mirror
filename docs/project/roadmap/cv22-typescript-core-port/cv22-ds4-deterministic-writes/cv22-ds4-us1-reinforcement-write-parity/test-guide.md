[< Story](index.md)

# Test Guide — CV22.DS4.US1

## Automated Validation

- **Harness extension:** unit tests prove multi-table, insert-aware snapshots —
  a `memory_access_log` INSERT is captured by `WHERE memory_id = ?` (not by known
  id), and `memories` + `memory_access_log` are snapshotted together.
- **Reinforcement probe:** identical two-table state across Python and TS → PASS;
  a divergent `last_accessed_at`, `access_context`, new-row id, or `use_count` →
  FAIL (the diff is not a rubber stamp).
- Full TS suite green (`node:test`), `tsc --noEmit` clean, `biome` clean, `ruff`
  clean.

## E2E Decision

Fixture-level (demo-DB copy) validation, the same posture as TS1 — broader E2E is
waived. The reinforcement port is proven through the harness on the portable demo
DB.

## Navigator Validation

- **Route:**
  1. `uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db`
  2. `uv run python ts/parity/write_parity.py --source-db tmp/parity/demo-memory.db`
     (exercising the reinforcement probe)
- **Expected observation:** `overall_match: true` across both `memories` and
  `memory_access_log`; driver exit 0.
- **Pass condition:** two-table state-diff PASS under the frozen `now`,
  reproducible across runs.
- **Fail condition:** either table diverges (timestamp, `access_context`, new-row
  id, or `use_count`), non-zero exit, or an abort from the copy-only guard or
  backup gate.

## Validation Evidence

Pending implementation and validation.
