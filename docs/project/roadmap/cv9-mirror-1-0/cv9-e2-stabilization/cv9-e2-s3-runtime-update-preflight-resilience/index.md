[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S3 — Runtime Update Preflight Resilience

**Status:** Done  
**Outcome:** Production Mirror updates can move from an older runtime to a newer stable release even when the current database already contains migration rows introduced by the target version.

## Problem

The safe updater used the current checkout's full `runtime status` as a hard pre-update gate. That made the update path fragile when the database was ahead of the installed code. In production, Mirror `0.15.0` detected stable `0.16.0`, but `runtime update` stopped before fetching or fast-forwarding because the database contained the newer `012_create_operation_run_events` migration row.

That state is exactly what an update should be able to resolve. The old code cannot recognize the future migration, but the target code can.

A second fragility appeared in the same diagnosis: strict SQLite read-only inspection can fail on WAL databases before sidecar files exist, surfacing `unable to open database file` as a false status blocker.

## Scope

- Add a narrow update-safe preflight lane for core migration drift when git, mirror home, database existence, and extension health are otherwise safe.
- Keep backup before migration and keep post-update status as the final hard gate.
- Recover WAL read-only inspection by opening the existing database in bounded read-write mode when strict read-only open fails because sidecars need to be created.
- Add regression coverage for the production-shaped failure.

## Out of Scope

- Automatic repair for dirty git trees, diverged branches, checksum drift, invalid extension manifests, or missing databases.
- Silent mutation of migration ledgers.
- Changing the public update command contract.

## Validation

See [test-guide.md](test-guide.md).
