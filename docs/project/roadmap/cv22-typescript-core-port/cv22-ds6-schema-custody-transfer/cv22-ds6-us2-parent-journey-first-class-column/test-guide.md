# Test Guide — CV22.DS6.US2

The headline is a real schema migration, so coverage is migration-over-legacy-
copies plus dual-source read/write and the renegotiated seam contracts. Copies
only, backup-gated, redacted by default — never the live DB.

## Automated — migration 017 (`ts/test/db/…`)

1. **Forward over legacy copies.** Extend the TS2 cascading fixture set (or add a
   pinned pre-017 seed): run the TS engine forward; assert the `identity` table
   gains `parent_journey`, each `layer=journey` row's column equals its JSON
   `parent_journey`, `_migrations` records `017` exactly once, and the end schema
   equals a fresh TS-created DB.
2. **Fresh-DB guarded no-op.** On a `createSchema`-built DB (column already
   present), migration 017 does not throw and does not double-apply; `identity`
   has exactly one `parent_journey` column.
3. **Table-existence guard.** Simulate the fresh-bootstrap order (migrations run
   before `createSchema` creates `identity`): 017 is a no-op when `identity` does
   not yet exist, and `createSchema` then creates it with the column + index.
4. **Backfill fidelity.** Rows with JSON parent, without parent, and with
   non-string/absent metadata backfill to the correct column value or NULL.

## Automated — dual-write / read-tolerance (`ts/test/journey/…`)

5. **Dual-write.** `createJourney` / `setProjectPath` set both the column and the
   JSON `parent_journey` to the same value.
6. **Read-tolerance.** Journey listing resolves the same hierarchy from: column
   set + JSON set; column set + JSON absent; column NULL + JSON set (Python-
   written / un-backfilled). Output byte-identical to today's golden.
7. **Integrity (ported `_validate_parent_journey`).** Reject a missing parent, a
   self-parent, and a >1-level nesting; accept a valid parent.

## Automated — renegotiated seam contracts

8. **`tests/unit/test_ts_schema_contract.py` (Python).** Change `==` to a
   subset/prefix assertion (`python_ids` is a prefix of `ts_ids`). It must still
   FAIL if TS drops below Python or reorders shared ids — add a guard case.
9. **TS1 structural-parity snapshot.** Regenerate to record the intentional
   `parent_journey` column + index divergence from Python's fresh schema; assert
   the snapshot diff is exactly that one column + index, nothing else.

## Regression

- Full `ts/` suite (`node --test`) + full Python suite green; typecheck + lint +
  mypy + ruff clean. Journey-listing goldens unchanged.

## Navigator smoke (E2E) — copied real DB

```bash
cp <source>/memory.db tmp/us2/memory.db            # copy, never the live DB
# run the TS migration path over the copy, then:
node ts/src/frontDoor/cli.ts journey set-path <slug> /tmp/x --db-path tmp/us2/memory.db
node ts/src/frontDoor/cli.ts journeys --db-path tmp/us2/memory.db
# inspect: identity.parent_journey column populated; metadata JSON still carries it
```

- Expected: legacy copy migrates to the fresh-schema shape; `parent_journey`
  column present, indexed, backfilled; listing identical to pre-change; JSON
  still mirrors the value for Python.
- Pass: schema + ledger + backfilled values match the Python-equivalent seed;
  listing unchanged; dual-source intact.
- Fail: schema/ledger mismatch, listing differs, a Python surface loses
  `parent_journey`, or a renegotiated contract test passes when it should fail.

## Gate

- `ts/` + Python suites green; both renegotiated contracts green in both
  directions; migration clean on committed legacy fixtures.
- Navigator smoke observed and accepted.
