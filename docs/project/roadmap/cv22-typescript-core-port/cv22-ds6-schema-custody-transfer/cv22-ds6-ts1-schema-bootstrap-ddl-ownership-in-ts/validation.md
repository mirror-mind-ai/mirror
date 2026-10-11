# Validation — CV22.DS6.TS1

## Status

Passed

## Automated Checks

- cd ts && npm run typecheck && npm run lint && npm test (303/303 passed, incl. schema.test.ts + schemaInventory.test.ts); uv run pytest (full suite green, exit 0, incl. new schema_inventory tests + drift guard); uv run mypy src/memory/db/schema_inventory.py (clean); uv run ruff check (clean on touched files); node ts/parity/schema_structural_parity.ts (PASS)

Checks status: passed

## E2E

Decision: not_required

Evidence: Plan-checkpoint approval accepted the narrower structural-parity + FTS-probe route (schema creation is deterministic and data-free); no runtime E2E performed. The DB-architect's blocking premise (SCHEMA-only must equal migrations-then-SCHEMA) was empirically tested, not just asserted: it initially found ONE real divergence (tasks column order, caused by migration 004's ALTER TABLE ADD COLUMN appending columns that schema.py's inline text shows in an earlier position) plus a second-order SQLite ALTER-TABLE text-splice whitespace artifact; both are now fixed (TS DDL reordered; normalize_sql extended in both languages) and proven equal.

## Navigator Validation

Route: node ts/parity/schema_structural_parity.ts — builds a fresh TS-created database via createSchema(), compares its structural inventory against the committed Python snapshot (tables/indexes/triggers, incl. CHECK constraints and partial-index predicates via normalized SQL), and runs an FTS5 functional probe (insert/update/delete with accented Portuguese content). Ends in one STRUCTURAL PARITY: PASS/FAIL line with a matching process exit code; any mismatch is pinpointed by table/index/trigger name.

Navigator accepted: yes

Expected observation: tables: 22 expected, match / indexes: 54 expected, match / triggers: 3 expected, match; FTS probe PASS; final line STRUCTURAL PARITY: PASS; exit code 0.

Pass condition: All three categories report 'match' (zero added/missing/differing objects) and the FTS probe reports PASS; exit code 0.

Fail condition: Any category reports MISMATCH with the specific diverging object name(s) listed, or the FTS probe reports FAIL; exit code 1.

## Missing Evidence

- none
