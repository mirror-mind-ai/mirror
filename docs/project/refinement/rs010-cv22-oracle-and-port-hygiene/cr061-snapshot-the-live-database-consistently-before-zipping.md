[< RS010](index.md)

# CR061 — Snapshot the live database consistently before zipping

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`backup` archives `memory.db` plus its `-wal`/`-shm` sidecars by raw file
copy, with no read lock. The Pi extension runs it at session shutdown while a
detached `session-maintenance` process (spawned by `runPyBackground` at
session start) may still be writing: extraction inserts memories,
embeddings, and ledger rows. A torn snapshot — main file and WAL captured at
different instants — is a plausible restore image that SQLite may refuse or
silently roll back. The Navigator's 2026-09-08 validation archive carried a
210 KB live WAL, which is the situation in question. CV22.DS7.TS1 reproduced
the raw copy for parity (`ts/src/backup/zipBackup.ts`, `collectEntries`).

The front door's own pre-write snapshot already does this correctly:
`liveBackup.ts` uses `VACUUM INTO` (see `snapshotDatabaseTo`), which is
WAL-correct.

## Expected Behavior

The archive member `memory.db` is a consistent snapshot produced through
SQLite (`VACUUM INTO` or the online backup API) and the `-wal`/`-shm`
members disappear, because a vacuumed snapshot has no sidecars. The restore
contract ("the member is named `memory.db`") is unchanged. The backup golden
changes shape: members become `["memory.db"]` and the member's CRC is that
of the snapshot, so the golden must be regenerated against the new oracle
and the smoke's both-engine comparison must keep passing.

## Impact

Medium-high consequence, low-to-medium frequency: the race exists on every
shutdown that overlaps maintenance. This is the database-architect finding
from TS1's plan review.

## Plan Or Decision

TS first (it owns the command), Python second, baseline advanced in the same
commit. Reuse `snapshotDatabaseTo` for the snapshot into the staging area,
zip the snapshot, keep staging + rename. Decide explicitly whether Python's
`backup()` — still called in-process by `runtime backup`, `web/operations.py`,
and its own `repair-journeys --apply` — changes too (it should: same restore
image from both engines) or is left as compatibility-only with a documented
difference.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Database-architect finding in CV22.DS7.TS1's plan review; captured at that
story's Debt Review on 2026-09-08.
