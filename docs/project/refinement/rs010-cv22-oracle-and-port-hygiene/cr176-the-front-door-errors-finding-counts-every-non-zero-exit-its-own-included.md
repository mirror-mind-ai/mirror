[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR176 — The front-door-errors finding counts every non-zero exit, its own included, so it cannot settle

## Problem

`runtime diagnose` reports `front_door_errors` when the last 24 hours of a home's
`front-door.log` hold any `ERROR` line (`frontDoorErrorFindings` in
`ts/src/runtime/diagnose.ts`, the port of the check CR026 added in the CV22 refinement
campaign), and recommends ruling out routing, schema-guard, and backup failures. The
front door writes `ERROR` for every non-zero exit: a usage error such as `mirror runtime`
with no subcommand, a Builder lifecycle command that exits non-zero, and `runtime
diagnose`'s own exit 1 whenever it reports something needing attention, this finding
included. Once one such line is in the window, every diagnose run adds another and the
next run counts it: the finding cannot settle until a full day passes with no check, and
it grows with every check.

Measured on the production home on 2026-10-25: 6 errors, all from the evening before
(three Builder lifecycle commands that exited non-zero, two `coherence-item` and one
`validate-item`; two usage errors; one `inspect` that exited 1). Three minutes and a few
`runtime` commands later, 9: the three new lines were the first diagnose's own exit, another
`runtime` command's exit 1, and a bare `mirror runtime`. None was a routing, schema-guard,
or backup failure.

## Expected Behavior

A diagnose run that reports findings does not make the next run report a new error;
usage errors are not counted as failures, and a lifecycle refusal can be told apart from
one; and the finding names what it counted, by command family and exit, so a failure
can be told from a typo.

## Impact

Low to medium: a finding that never clears teaches the operator to ignore the one check
meant to keep backup, guard, and routing failures visible.

## Plan Or Decision

Captured, unassigned, 2026-10-25, from the v0.37.0 production update, at the Navigator's
direction. Each log line already carries the command family, the kind (`ts` or `usage`),
the exit code, and for Builder the leaf, so the distinction can be drawn from the line
alone, content-free as the log is. **Revisit:** the next change to `runtime diagnose` or
to the front-door log.

## Evidence

The production home's `front-door.log` from 2026-10-24T22:22Z to 2026-10-25T22:03Z,
metadata only; `frontDoorErrorFindings`, which counts every line whose level is `ERROR`
with no other test; the two diagnose runs of 2026-10-25, reporting 6 and then 9.

## Outcome

Pending: captured, not planned.
