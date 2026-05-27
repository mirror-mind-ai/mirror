[< Story](index.md)

# Plan — Runtime Update Preflight Resilience

## Diagnosis

Production update failed because pre-update status was evaluated by the old installed code. The old code saw a core migration row from a newer release and reported status as not ready:

```text
Core migrations: attention needed (11/11 applied; unknown 012_create_operation_run_events)
```

The updater stopped before fetching and fast-forwarding, even though the newer stable release is the thing that can recognize that migration. This creates a paradox: the database being slightly ahead of code blocks the code update that would restore coherence.

The same session also reproduced a WAL sidecar issue. A strict `mode=ro` SQLite connection can fail with `unable to open database file` when the database is in WAL mode and sidecars are absent or need refresh. Opening the database through `MemoryClient` recreated sidecars and made status progress to the real blocker.

## Design

Introduce a narrow distinction between full runtime readiness and update-safe preflight readiness.

`runtime status` remains strict. It should still report attention when the installed code sees unknown or pending migrations.

`runtime update` may proceed past the initial status gate only when all non-migration safety boundaries are green:

- mirror home resolved;
- git repository is readable;
- git tree is clean;
- database exists;
- extension health is ready;
- core migration health is non-ready only because of missing or unknown core migration ids, with no unreadable ledger note.

The updater still fetches, plans, backs up, verifies backup, fast-forwards, applies migrations, and requires post-update status to be ready. If no code update is available, or if post-update status remains non-ready, the command still fails with recovery evidence.

For SQLite inspection, keep strict read-only as the first attempt. If it fails specifically with `unable to open database file`, retry with `mode=rw` against the existing database path. This allows SQLite to create WAL sidecars without creating a missing database file or changing semantic data.

## Risks

The main risk is making the updater too permissive. The implementation avoids that by only relaxing core migration drift and preserving all existing hard blockers for git, database absence, extension drift, checksum drift, and post-update status.

The SQLite fallback does touch sidecar files. This is acceptable because it is bounded to an existing database and mirrors the safe bootstrap behavior the updater already performs through `MemoryClient`.

## Verification

- Regression test: non-ready status with unknown future core migration can proceed through a normal pull update and finish when post-update status is ready.
- Regression test: WAL database without sidecars can be inspected through the read-only helper without surfacing false database-unavailable status.
- Existing runtime update tests remain green.
