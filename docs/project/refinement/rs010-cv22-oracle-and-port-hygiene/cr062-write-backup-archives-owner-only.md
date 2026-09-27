[< RS010](index.md)

# CR062 — Write backup archives owner-only

**Status:** in_progress
**RS:** RS010
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

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

**2026-09-27: added to the CV22 release gate** by the Navigator's decision after the Workbench inspection that followed the Ariad trust floor ([amendment](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)). It is not Ariad, so US3 does not validate it, and the release waits for it. The plan above is single-engine now. TS5 deleted the Python core and the parity harness, so its Python half and the baseline advance fall away.

**2026-09-27: carried by [CR061](cr061-snapshot-the-live-database-consistently-before-zipping.md#plan-or-decision)**, one delivery with one plan and one validation route, by the Navigator's decision. The plan lives there, where design 3 and decision D2 cover this CR. This CR closes with CR061.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Security lens in CV22.DS7.TS1's plan; the 0644 mode was observed on the
Navigator's validation archive on 2026-09-08. Captured at that story's Debt
Review.
