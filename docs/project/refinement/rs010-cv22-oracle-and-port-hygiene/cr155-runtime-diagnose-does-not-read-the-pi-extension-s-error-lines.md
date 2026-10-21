[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR155 — `runtime diagnose` does not read the Pi extension's error lines, so a session that never reached the core goes unreported

## Problem

The Pi extension runs every Mirror call as a child process and swallows its failures so
Pi is never blocked. A call that fails is written to `<mirror-home>/mirror-logger.log`
— `runMirror failed […]`, or `<label> failed: …` for a detached one — and nowhere
else. `runtime diagnose` reads `front-door.log`, so it sees a core that ran and failed;
it does not see a call that never reached the core, which only the extension's log
records.

Until [CR153](cr153-a-home-s-pi-backfill-imports-another-home-s-sessions.md), a Pi
session whose live logging never bound a turn was later imported by session
maintenance. CR153 retires that import: on the maintainer's machine it filled such a
gap once in three months (2026-10-12). Without it, such a session is simply missing
from the home, and nothing says so.

## Expected Behavior

`runtime diagnose` reads the Pi extension's ERROR lines from the home's
`mirror-logger.log` — those since the last session that logged cleanly, or within a
bounded window — and reports them as one finding: how many, the latest, and the log's
path. With none, it says nothing. The finding names what may be missing (the turns of
the sessions those calls belonged to), not a repair it cannot perform.

## Impact

Low frequency, silent loss: a whole Pi session absent from the home, with the reason
only in a log nobody reads. Observability, not data integrity: the session's file stays
in Pi's own directory.

## Plan Or Decision

Captured, unassigned, 2026-10-21, from CR153's review (finding O2), at the Navigator's
direction. Current Focus unchanged.

## Evidence

`.pi/extensions/mirror-logger.ts`: `runMirror` and `runMirrorBackground` catch, then
`log("ERROR", …)` into `mirror-logger.log`. `ts/src/runtime/diagnose.ts` reads
`front-door.log` beside the database and no other log. CR153's measurement: the
development home's extension closed a session on 2026-10-12 without having logged a
turn, and only the import, now retired, brought it into a home.

## Outcome

Open.
