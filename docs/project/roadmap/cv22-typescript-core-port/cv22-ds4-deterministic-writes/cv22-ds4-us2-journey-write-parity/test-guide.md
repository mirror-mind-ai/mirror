[< Story](index.md)

# Test Guide — CV22.DS4.US2

## Automated Validation

- **pyJsonDumps:** matches Python `json.dumps` for representative inputs — spaced
  `", "` / `": "` separators, non-ASCII escaping under `ensure_ascii`, and sorted
  vs insertion-order keys; both call-site configurations
  (`create_journey` and `set_project_path`).
- **upsertIdentity / updateIdentityMetadata:** the INSERT and UPDATE paths produce
  the expected `identity` row and metadata under an injected `id` + `now`.
- **Journey probe:** the identity-table state (including the metadata JSON string)
  is identical Python vs TS → PASS; a divergent metadata string, timestamp, id, or
  version → FAIL.
- TS suite green (`node:test`), `tsc` / `biome` clean, `ruff` clean.

## E2E Decision

Fixture-level (demo-DB copy) validation, the same posture as TS1/US1; broader E2E
is waived.

## Navigator Validation

- **Route:** generate the demo DB, then run `write_parity.py` with the journey
  probe.
- **Expected observation:** `overall_match: true` across the identity row
  including its metadata JSON; exit 0.
- **Pass condition:** identity-table state-diff PASS under the injected `id` and
  frozen `now`, reproducible across runs.
- **Fail condition:** the metadata JSON string diverges, the timestamp / id /
  version diverges, non-zero exit, or an abort from the copy or backup guard.

## Validation Evidence

Pending implementation and validation.
