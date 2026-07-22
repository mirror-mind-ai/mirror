# Validation — CV22.DS6.US3

## Status

Passed

## Automated Checks

- TS suite node --test = 349 green; CI run 29925605073 green across ts(ubuntu+macos), test 3.10, test 3.12, parity (real-DB-copy); golden determinism + oracle-drift tripwire green

Checks status: passed

## E2E

Decision: required

Evidence: migrate_on_open_smoke.ts vs a Python-generated demo DB (genuine pre-017 legacy): RESULT: PASS — 017 applied on open, parent_journey created + backfilled from JSON (count matches), pre-migration backup taken, journeys served, migrate_on_open logged naming 017

## Navigator Validation

Route: uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db && node ts/parity/migrate_on_open_smoke.ts --source-db tmp/parity/demo-memory.db

Navigator accepted: yes

Expected observation: RESULT: PASS — 017 applied, column backfilled from JSON (column count == JSON-parent count), pre-migration backup taken, journeys still served, migrate_on_open event names 017 in the front-door log

Pass condition: RESULT: PASS (exit 0); every check green; backfill count equals JSON-parent count; no journeys ordering change

Fail condition: any check FAIL (exit 1): backfill mismatch, a backup on an already-migrated re-open, or journey/identity content in the log

## Missing Evidence

- none
