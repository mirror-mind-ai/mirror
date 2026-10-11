[< Story](index.md)

# Test Guide — CV22.DS6.TS5 — Migration-016 Legacy Fixture Coverage

## Automated Validation

`ts/test/db/migrationFixtures.test.ts`, with `"016"` added to `STEMS`:

- **Seed → migrate:** exec `migration-016-pre-state.sql` (old-015 shape, NULL-display_code
  RS/CR rows), then `runMigrations`.
- **Schema parity:** `buildSchemaInventory` vs the committed `migration-016-expected.json`
  through `diffTsInventoryAgainstSnapshot` (tolerates only the enumerated TS-only `017`
  additions). Proves `016` created the `display_code` columns and the two
  `ux_…_display_code` unique indexes.
- **Ledger parity:** `_migrations` == oracle `001–016` + TS-authored `017`.
- **Backfill-value parity (the point of this story):** assert the per-journey backfilled
  `display_code` values on both builder-workbench tables equal the Python oracle's — proving
  the real ADD-COLUMN + backfill-against-NULL branches executed, not merely that the shape
  is modern. Includes the multi-journey reset, intra-journey tiebreaks, and the interleaved
  preset/NULL case (COALESCE + position numbering); asserts codes are actually assigned.

## Determinism (corrected)

The generator is **not** byte-deterministic: `_migrations.applied_at` is stamped with
wall-clock `_now()`, so a regeneration diffs on timestamps. These fixtures are therefore
commit-once artifacts (not in the CI determinism gate) and the **parity test is the gate**,
not regeneration. The generator must remain able to reproduce the `016` fixture on demand.

## E2E Decision

**Fixture-level accepted (pending Navigator acceptance).** This is inherently a
migration-parity fixture with no runtime surface; the automated fixture test *is* the
end-to-end proof. No separate runtime E2E is meaningful.

## Navigator Validation Route

```
cd ts && node --test test/db/migrationFixtures.test.ts     # expect: 016 fixture + all stems green
```

- **Expected observation:** the `016` fixture test passes, including the backfilled
  `display_code` value assertions (multi-journey reset + interleaved preset/NULL case).
- **Pass condition:** all `migrationFixtures` tests green.
- **Fail condition:** a `016` schema/ledger/backfill-value mismatch.

## Validation Evidence

Pending implementation and validation.
