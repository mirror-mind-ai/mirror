# Validation — CV22.DS6.US2

## Status

Passed

## Automated Checks

- ts: typecheck + lint clean; npm run test = 330 pass / 0 fail / 0 skipped (incl. 017 backfill + softened-guard tolerance + all renegotiated guards). Python: contract + db + journey suites green.

Checks status: passed

## E2E

Decision: required

Evidence: TS engine runs migration 017 forward over the 8 committed legacy-DB-copy fixtures: schema, _migrations ledger (+017), and row values match Python's captured end-state PLUS exactly the enumerated TS-superset-of-Python divergence (identity.parent_journey column + idx_identity_parent_journey). Direct backfill test (journey rows only) + softened-guard tolerance test green. Structural parity script PASS; Python schema-contract + db suites green with Python untouched.

## Navigator Validation

Route: node ts/parity/schema_structural_parity.ts (STRUCTURAL PARITY: PASS, TS superset of Python) + uv run pytest tests/unit/test_ts_schema_contract.py

Navigator accepted: yes

Expected observation: structural parity PASS with identity.parent_journey + index as the enumerated divergence; Python prefix contract green; 330/330 TS green

Pass condition: all guards green as TS superset of Python; migration 017 backfills journey rows only; existing DBs missing only 017 are served

Fail condition: a guard fails outside the enumerated divergence, backfill is wrong, or an existing DB is refused for missing only a TS-authored migration

## Missing Evidence

- none
