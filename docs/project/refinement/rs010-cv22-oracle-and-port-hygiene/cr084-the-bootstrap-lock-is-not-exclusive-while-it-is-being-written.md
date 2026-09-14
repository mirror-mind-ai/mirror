[< RS010](index.md)

# CR084 — The bootstrap lock is not exclusive during the window between creating it and writing it

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`acquireBootstrapLock` creates the lock file with `O_CREAT | O_EXCL` and writes
its `{pid, createdAt}` record **afterwards**, as a second syscall. Between the
two, the lock file exists and is empty.

A concurrent acquirer that looks at the lock in that window reads empty content,
`readLockRecord` returns `null`, and `isStale` treats unreadable content as
abandonment — by its own comment: *"a live holder always writes a well-formed
record right after creating the file"*. That assumption is exactly what is false
in the window. The waiter unlinks the live holder's lock, creates its own, and
returns. **Two processes then hold the same bootstrap lock.**

Measured, not inferred. Staging the window by hand — create the lock, do not yet
write it — and calling the real `acquireBootstrapLock`:

```text
holder created the lock, not yet written. exists: true content: ""
second acquirer returned in 1ms -> TWO holders at once
after the second acquirer released, the holder's lock file exists: false
```

Two further consequences follow from the same trace:

* the first holder's `writeSync` lands in an inode that is already unlinked, so
  its record is never visible to anyone;
* `release()` unlinks **by path**, so the first holder's release removes whatever
  lock file is at that path by then — which can be a third process's freshly
  acquired lock. One lost window cascades.

The symptom that surfaced it is a failure of
`test/db/migrateOnOpenConcurrency.test.ts` — "N concurrent processes
migrate-on-open the same legacy DB" — with a worker exiting non-zero:

```text
worker failed: Error: disk I/O error
    at snapshotDatabaseTo (src/db/database.ts:221)
    at takeBackup (src/db/migrateOnOpen.ts:105)
    at ensureMigratedOnOpen (src/db/migrateOnOpen.ts:151)
```

That is consistent with two holders inside `takeBackup` at once: it does
`rmSync(backupPath, { force: true })` and then `VACUUM INTO backupPath`, so the
second holder deletes the file the first one is writing and SQLite reports
`SQLITE_IOERR`. Roughly one run in thirteen of the full suite on a loaded
machine; CI has not shown it yet.

## Expected Behavior

A lock file never exists in a state that a competing acquirer can read as
abandoned:

* the record is written **before** the file becomes visible at the lock path —
  write a uniquely named temporary file, then `link()` it into place, which fails
  with `EEXIST` when a holder already exists and therefore keeps the exclusive
  semantics `O_EXCL` provides today, but with content;
* stale reclamation keeps its current, deliberate rules: a dead pid or an aged
  record. Empty or corrupt content stops being evidence of abandonment, because
  it is no longer reachable for a live holder;
* `release()` unlinks only a lock it still owns — read the record and compare
  `pid` and `createdAt` before removing — so a stale-reclaim race cannot make one
  process free another's lock.

The concurrency test should also fail with a message that names the invariant
rather than forwarding `disk I/O error`, which reads as an environment problem
and trains the reader to retry.

## Impact

This is not confined to the test. The bootstrap lock is the cross-process
mutual exclusion for migrate-on-open, and Mirror is opened concurrently in
normal use: several runtimes (Pi, Gemini CLI, Codex, Claude Code), the MCP
server, session hooks, and the web process can all open the same `memory.db`
within the same second — most likely right after an update, which is exactly
when a migration is pending and the slow path runs.

Two simultaneous holders mean two `takeBackup` calls racing on one path (one
destroys the other's snapshot) and two `runMigrations` calls on one database.
The observed failure was the backup; the migration is the part with no
second chance, and a corrupted migration backup is precisely the artifact a
Navigator would reach for afterwards.

## Plan Or Decision

Not fixed inside CV22.DS7.US8: it belongs to the DS6 schema-custody seam, not
to the Builder port, and the story that found it is graded by byte-equality
against Python. Sequencing is a Navigator decision; the window is old, the
exposure is real, and the fix is small and local to `bootstrapLock.ts`.

## Evidence

* Probe staging the create-before-write window against the real
  `acquireBootstrapLock` (output above): a second acquirer succeeds in 1 ms and
  its release removes the first holder's lock file.
* One full-suite failure in thirteen consecutive runs on 2026-09-14, with the
  stack above; the remaining twelve runs were green.
* Source: `ts/src/db/bootstrapLock.ts` (`tryCreateExclusive`, `isStale`,
  `readLockRecord`, `release`), `ts/src/db/migrateOnOpen.ts` (`takeBackup`).

## Outcome

_Pending._

## Provenance

Observed during CV22.DS7.US8 plateau 7 (2026-09-14) while running the full
TypeScript suite for the `build load` degraded-path work, which is unrelated to
this seam. The mechanism was then reproduced deterministically rather than left
as a suspected environment flake.
