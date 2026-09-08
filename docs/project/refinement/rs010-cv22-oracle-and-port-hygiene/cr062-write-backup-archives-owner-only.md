[< RS010](index.md)

# CR062 — Write backup archives owner-only

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`backup` writes `memory_<stamp>.zip` with the process umask, which on the
Navigator's install yields `-rw-r--r--` (0644): every dated archive of the
identity documents and conversation text is group- and world-readable. The
front door's own pre-write snapshot in the same directory is 0600 and the
directory is created 0700 (`liveBackup.ts`). CV22.DS7.TS1 reproduced the
umask behavior for parity (`ts/src/backup/zipBackup.ts` does not chmod).
Relatedly, `runtime diagnose` reports the mirror home itself as 0755 on that
install (`loose_permissions`), which is a separate, existing finding with its
own repair route.

## Expected Behavior

The staging file is created 0600 and the rename preserves it; the backups
directory is created 0700 when `backup` creates it. Both cores. Windows is
unaffected (no POSIX mode bits), and the golden is unaffected (it grades
members, not the container's mode) — a unit test pins the mode on POSIX.

## Impact

Security posture, not correctness: the RS005 secure-default rule already
covers the front door's snapshot; the dated archive is the larger and
longer-lived copy of the same data.

## Plan Or Decision

TS first, Python second, one commit: `writeFileSync(staging, bytes, { mode:
0o600 })` and `mkdirSync(dir, { recursive: true, mode: 0o700 })` in
`zipBackup.ts`; `os.open`/`os.chmod` equivalents in `backup.py`; a POSIX-only
test on each side. No oracle behavior graded by the goldens changes, but the
Python file changes, so the baseline advances.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Security lens in CV22.DS7.TS1's plan; the 0644 mode was observed on the
Navigator's validation archive on 2026-09-08. Captured at that story's Debt
Review.
