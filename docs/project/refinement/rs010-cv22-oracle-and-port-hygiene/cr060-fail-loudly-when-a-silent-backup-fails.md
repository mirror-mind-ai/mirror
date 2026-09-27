[< RS010](index.md)

# CR060 — Fail loudly when a silent backup fails

**Status:** done
**RS:** RS010
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

## Problem

`backup --silent` exits 0 when the backup did not happen. Python's `main()`
ends with `if result is None and not args.silent: sys.exit(1)`, so a missing
database, an unconfigured home, or any refusal inside `backup()` is invisible
under `--silent` — which is exactly how the session-shutdown backup is
invoked from the Pi extension and the Gemini hook. A shutdown backup can fail
every day and nothing reports it. CV22.DS7.TS1 reproduced this for parity
(`ts/src/frontDoor/dbSafetyToolsRoute.ts`, `runBackupRoute`) and pinned it in
the backup golden (`missing_db_silent`: exit 0).

## Expected Behavior

`--silent` suppresses progress output, not failure. A backup that did not
produce an archive exits non-zero and writes one line to stderr, so the
extension's `runFrontDoor` logs it as a WARN and a future health surface can
count it. The golden's `missing_db_silent` scenario changes to exit 1 with a
stderr line, in both cores.

## Impact

Medium. The dated zip is the only archive of the user's identity and
conversation data that survives a bad write; a failure mode that hides
itself defeats the purpose. Low likelihood on a healthy install, high
consequence when it happens.

## Plan Or Decision

TS owns `backup` since the 2026-09-07 flip, so the change lands in TS first
and Python follows as compatibility-only: change `runBackupRoute`'s silent
exit, add the stderr line, update the golden generator's expectation and
`backup.py` in the same commit, advance the oracle baseline, and add a smoke
check that a shutdown with a missing database leaves a WARN in
`mirror-logger.log`.

**2026-09-27: added to the CV22 release gate** by the Navigator's decision after the Workbench inspection that followed the Ariad trust floor ([amendment](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)). It is not Ariad, so US3 does not validate it, and the release waits for it. The plan above is single-engine now. TS5 deleted the Python core and the parity harness, so its Python half and the baseline advance fall away.

**2026-09-27: carried by [CR061](cr061-snapshot-the-live-database-consistently-before-zipping.md#plan-or-decision)**, one delivery with one plan and one validation route, by the Navigator's decision. The plan lives there, where design 5 covers this CR. This CR closes with CR061.

## Evidence

_Pending._

## Outcome

Done 2026-09-27 with
[CR061](cr061-snapshot-the-live-database-consistently-before-zipping.md#outcome),
which carries its record. A backup that wrote no archive exits 1 with one line,
`backup: no archive was written: <why>`, under `--silent` too, and the
front-door log records a content-free category. `/mm-backup` reports that line
as a failure.

## Provenance

Recorded in CV22.DS7.TS1's plan (Non-Goals and Debt) and captured at that
story's Debt Review on 2026-09-08.
