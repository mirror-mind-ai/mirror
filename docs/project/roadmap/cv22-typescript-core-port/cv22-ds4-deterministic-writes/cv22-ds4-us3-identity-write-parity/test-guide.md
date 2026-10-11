[< Story](index.md)

# Test Guide — CV22.DS4.US3

## Automated Validation

- **setIdentity orchestration:**
  - **INSERT:** a new `(layer, key)` with an explicit metadata string produces the
    expected `identity` row under an injected `id` + `now`
    (`created_at == updated_at == now`).
  - **UPDATE (explicit metadata):** an existing `(layer, key)` updates content,
    version, `updated_at`, and metadata; `id` and `created_at` are preserved.
  - **UPDATE (metadata=None inheritance):** an existing row keeps its stored
    metadata while content / version / `updated_at` change; an absent row inherits
    `null`.
  - **version default:** `version` is `"1.0.0"` when omitted.
- **identity probe:** the identity-table state (including the metadata string) is
  identical Python vs TS → PASS across all four cases; a divergent metadata string,
  content, timestamp, id, or version → FAIL.
- TS suite green (`node:test`), `tsc` / `biome` clean, `ruff` clean.

## E2E Decision

Fixture-level (demo-DB copy) validation, the same posture as TS1/US1/US2; broader
E2E is waived.

## Navigator Validation

- **Route:** generate the demo DB, then run `write_parity.py --probe identity`.
- **Expected observation:** `overall_match: true` across the identity row(s)
  including the metadata string, for every case; exit 0.
- **Pass condition:** identity-table state-diff PASS under the injected `id` and
  frozen `now`, reproducible across runs; the metadata-None case inherits the
  stored value with no spurious change.
- **Fail condition:** the metadata string diverges, content / timestamp / id /
  version diverges, non-zero exit, or an abort from the copy or backup guard.

## Validation Evidence

Pending implementation and validation.
