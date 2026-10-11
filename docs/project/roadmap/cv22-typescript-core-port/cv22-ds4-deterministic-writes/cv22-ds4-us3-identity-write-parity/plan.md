# Plan — CV22.DS4.US3

## Objective

Port the identity write **surface** — `set_identity` (create or update an identity
prompt) and `update_identity_metadata` — to the TS core, proving it byte-for-byte
against the real Python oracle (`IdentityService.set_identity`,
`IdentityStore.update_identity_metadata`) through the DS4.TS1 write-parity harness,
for a non-`journey` layer, under an injected `id` and a frozen `now`.

## What already exists (the answer to the serialization question)

- `pyJsonDumps` (`ts/src/util/pyJson.ts`) — general `json.dumps` parity
  (`", "` / `": "` separators, `ensure_ascii`, `sort_keys`). **No new serializer
  needed.**
- `upsertIdentity` / `updateIdentityMetadata` (`ts/src/identity/identityStore.ts`)
  — the row-level INSERT/UPDATE primitives, already parity-proven by the US2
  journey probe.

`set_identity`'s `metadata` argument is an **opaque pre-serialized string**
(`str | None`), so the identity write path never calls `json.dumps` itself — the
metadata bytes pass straight through to the row. There is therefore **no
identity-specific serialization parity risk** in the core write path. The new work
is the orchestration and the probe.

## Scope

- **`setIdentity` orchestration** (new, `ts/src/identity/setIdentity.ts`),
  mirroring `IdentityService.set_identity`:
  - `metadata is None` → read the existing `(layer, key)` row's metadata and reuse
    it (read-before-write inheritance); an absent row inherits `null`.
  - `version` defaults to `"1.0.0"`.
  - `id` and `now` injected; compose the `IdentityRow`; delegate to `upsertIdentity`.
- **`identity` probe** (the parity subject) added to the harness:
  - Python `_identity_probe` in `ts/parity/write_parity.py` driving the real
    `IdentityService.set_identity` + `IdentityStore.update_identity_metadata` on a
    copy with `identity_mod.datetime` and `models_mod.datetime` frozen (the same
    freeze pattern the journey probe uses), plus `"identity"` in the `--probe`
    choices.
  - TS `WRITE_PROBE_FACTORIES.identity` in `ts/src/parity/writeParityFixture.ts`
    replaying `setIdentity` / `updateIdentityMetadata` on the parallel copy,
    snapshotting the `identity` row via the existing `IDENTITY_COLUMNS` spec.
- **Cases** (branch-covering; detailed in the test guide): INSERT a new identity,
  UPDATE an existing identity (content + explicit metadata), UPDATE with
  `metadata=None` (inheritance), standalone `update_identity_metadata`.

## Non-Goals

- Live front-door write routing (deferred as in US1/US2; DS4 collapse reconciles
  routing for reinforcement, journey, and identity writes together).
- Porting the `mm-seed` command's metadata composition (YAML load →
  `load_persona_content` → metadata string); US3 ports the write surface, not the
  seed command's serialization.
- External-API writes, memory creation, embeddings (CV22.DS5).
- Schema change; `identity_integrations` / descriptor writes.

## Acceptance Behavior

```text
Given a seeded memory.db copy, an injected identity id, and a frozen now
When IdentityService.set_identity(...) / update_identity_metadata(...) run through
     the Python core, and TS setIdentity / updateIdentityMetadata run on a parallel
     copy with the same id + now
Then the identity row is byte-for-byte equal across both copies for every case
     (INSERT, UPDATE, metadata-None inheritance, metadata-only):
     id, layer, key, content, version, created_at, updated_at, and the metadata string
And no other row or column changes
```

## Validation Route

- **Automated:** `setIdentity` unit tests (INSERT, UPDATE, metadata-None
  inheritance incl. absent-row → `null`, `version` default); an `identity` probe
  PASS/FAIL over the four cases; TS suite green; `tsc` / `biome` / `ruff` clean.
- **Navigator-visible:** generate the demo DB, run `write_parity.py --probe
  identity` → `overall_match: true`, exit 0.
- **E2E decision:** fixture-level demo-DB route (same posture as TS1/US1/US2).
  (Navigator to accept.)

## Implementation Contract

- TDD: `setIdentity` orchestration first (the metadata-None inheritance branch is
  the riskiest logic), then the identity probe + real Python oracle.
- Reuse the existing primitives and serializer; do not duplicate `upsertIdentity`
  or `pyJsonDumps`.
- Keep scoped to `CV22.DS4.US3`; no live routing, no seed-command composition.
- Use `uv run` for Python; commit only story-scoped files with descriptive English
  messages.

## Resolved Decision — story-package path (option b)

The runtime materialized this package at
`docs/project/roadmap/cv22/cv22-ds4/cv22-ds4-us3/`, which diverged from the
established CV22 convention
(`cv22-typescript-core-port/cv22-ds4-deterministic-writes/cv22-ds4-usN-*/`) that
US1/US2/TS1 and the DS4 index links use. The Navigator chose **option (b)**: the
package was relocated to `cv22-ds4-us3-identity-write-parity/` as the first
implementation step and linked from the DS4 index. No cursor edit was needed —
`_canonical_package_path` stores only the item code and re-resolves the package by
the `cv22-ds4-us3-` directory prefix, which the relocation preserves.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
