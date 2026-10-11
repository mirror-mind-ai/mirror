# Validation — CV22.DS4.TS1

## Status

Passed

## Automated Checks

- cd ts && npm test -> node:test 79/79; tsc --noEmit clean; biome check clean; uv run ruff check ts/parity/write_parity.py clean

Checks status: passed

## E2E

Decision: waived

Evidence: TS1 is itself the write-parity validation mechanism; fixture-level demo-DB route accepted at plan approval. US1-US3 will E2E their real ported writes through this harness.

## Navigator Validation

Route: uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db && uv run python ts/parity/write_parity.py --source-db tmp/parity/demo-memory.db

Navigator accepted: yes

Expected observation: == write-parity == report shows match: true and overall_match: true; driver exit 0

Pass condition: overall_match true and exit 0 (python_state_hash == ts_state_hash across target rows)

Fail condition: any probe match: false, overall_match false, non-zero exit, or an abort from the copy guard or backup gate

## Missing Evidence

- none
