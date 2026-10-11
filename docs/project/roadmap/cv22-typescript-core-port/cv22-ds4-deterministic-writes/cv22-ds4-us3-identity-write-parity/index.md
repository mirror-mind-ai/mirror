[< Parent](../index.md)

# CV22.DS4.US3 — Identity Write Parity

**Status:** ✅ Done
**Type:** User Story
**Depends on:** CV22.DS4.TS1 (write-parity harness & backup gate), CV22.DS4.US2
(identity write primitives `upsertIdentity` / `updateIdentityMetadata` and
`pyJsonDumps`, already in `ts/src/identity/identityStore.ts` and
`ts/src/util/pyJson.ts`)

---

## User Story

As Mirror, I want identity writes — `set_identity` (create or update an identity
prompt) and `update_identity_metadata` — to run through the TS core exactly as the
Python core does, so the deterministic `mm-identity` / `mm-seed` write paths can
move to TS with the `identity` table byte-for-byte identical across all layers.

## Outcome

The identity write **surface** (`set_identity` orchestration) is ported to the TS
core over the writable seam and proven byte-for-byte against the real Python
`IdentityService.set_identity` / `IdentityStore.update_identity_metadata` oracle —
for a non-`journey` layer — under an injected `id` and a frozen `now`. This closes
DS4's deterministic write scope.

## Key finding (from the code)

The heavy lifting already shipped in US2:

- `pyJsonDumps` (`ts/src/util/pyJson.ts`) — general `json.dumps` parity.
- `upsertIdentity` / `updateIdentityMetadata` (`ts/src/identity/identityStore.ts`)
  — the row-level INSERT/UPDATE primitives, already parity-proven by the journey
  probe.

`set_identity` takes `metadata` as an **opaque pre-serialized string** (`str |
None`), so — unlike journeys — the identity write path does **not** serialize JSON
itself; the string passes straight through. US3's genuinely new logic is the
**service-level orchestration** (the `metadata is None` read-before-write
inheritance branch and the `version` default) plus wiring an `identity` probe into
the harness.

## Scope

- `setIdentity` orchestration in TS mirroring `IdentityService.set_identity`:
  metadata-None inheritance, `version` default, `id` / `now` injection →
  `upsertIdentity`.
- An `identity` probe in the DS4 harness (Python `_identity_probe` + TS
  `WRITE_PROBE_FACTORIES.identity`) covering INSERT, UPDATE-with-metadata,
  UPDATE-inherit-None, and standalone `update_identity_metadata`.

## Out Of Scope

- Live front-door write routing (deferred, as in US1/US2; reconciled at DS4 collapse).
- The `mm-seed` command's own metadata composition (YAML → metadata string).
- External-API writes, memory creation, embeddings (CV22.DS5).
- Schema change; `identity_integrations` / descriptor writes.

## Validation

Harness `identity` probe (identity-table state-diff including the metadata string)
PASS/FAIL across all four cases; demo-DB e2e; fixture-level route (same posture as
TS1/US1/US2).
