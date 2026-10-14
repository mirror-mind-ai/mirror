[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR137 — The updater smoke's package lane fails on a machine that exports `MIRROR_USER`

## Problem

`scripts/smoke_runtime_update.sh` never clears `MIRROR_USER`, so it inherits the one
the machine exports. The Navigator's shell exports `MIRROR_USER=vinicius-dev`, because
the launcher sets the home per target.

Section 6, the package lane, runs its commands with `MIRROR_HOME` set to a scratch home
named `pkg-mirror-home`. `resolveMirrorHome` (`ts/src/frontDoor/dbPath.ts`) refuses a
`MIRROR_HOME` whose last segment is not the `MIRROR_USER` name: "MIRROR_HOME
(.../pkg-mirror-home) conflicts with MIRROR_USER (vinicius-dev)." So 24 of the
section's checks fail, and the smoke exits 1. Sections 1 to 5 pass on the same machine.
Why they escape the rule was not traced.

CI exports no `MIRROR_USER`, so CI passes and the failures show only on a maintainer's
machine.

## Expected Behavior

- The smoke gives the same result on any machine. Before it builds its scratch homes,
  it clears every variable that chooses a Mirror home, user, or database: the ones
  `DbPathEnv` names (`MEMORY_ENV`, `DB_PATH`, `MEMORY_PROD_DIR`, `MEMORY_DIR`,
  `MIRROR_HOME`, `MIRROR_USER`).
- Run with `MIRROR_USER` exported, the smoke passes as it does in CI.

## Impact

Low for the product, real for the route. On the Navigator's machine the smoke reports
26 failures where two were real (CR132's red phase), so a real failure hides among
false ones. CR132's validation route had to run the smoke with `env -u MIRROR_USER`.
Siblings: CR123 and CR128, smokes whose result depends on the machine they run on.

## Plan Or Decision

Captured, unassigned, 2026-10-14, from CR132's validation, at the Navigator's request.
Current Focus unchanged.

## Evidence

- 2026-10-14, CR132's red phase at `dcddb33e`, run with the shell's
  `MIRROR_USER=vinicius-dev`: `smoke exit=1`, 63 passed, 26 failed. Two failures were
  step 2b's, the defect CR132 fixes. The other 24 were section 6's, beginning with
  `status not ready` and `dry run capture: MIRROR_HOME
  (/tmp/cr132-smoke-red/pkg-mirror-home) conflicts with MIRROR_USER (vinicius-dev).`
- The same smoke at `3b16a510` with `env -u MIRROR_USER`, by the Driver and then by
  the Navigator: 89 passed, 0 failed.
- `grep -c MIRROR_USER scripts/smoke_runtime_update.sh`: 0.

## Outcome

Pending.
