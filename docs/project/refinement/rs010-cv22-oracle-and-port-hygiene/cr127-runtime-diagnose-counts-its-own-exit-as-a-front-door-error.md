[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR127 — `runtime diagnose` counts its own exit as a front-door error, so any finding keeps the warning alive

## Problem

`mirror runtime diagnose` returns exit 1 whenever it reports a finding
(`ts/src/frontDoor/runtimeRoute.ts:277`). The front door logs every non-zero exit
as `ERROR` (`ts/src/frontDoor/frontDoorLog.ts:43`). The `front_door_errors`
check (`frontDoorErrorFindings`, `ts/src/runtime/diagnose.ts`) counts `ERROR`
lines from the last 24 hours. So every diagnosis that finds anything writes the
`ERROR` line that the next diagnosis reports. Once a home has any finding,
`front_door_errors` stays on until 24 hours after the last diagnose run, and it
keeps itself on even after the original finding is fixed. The person ends up
being asked to inspect the log for a failure the diagnosis created.

The log entry does not separate the cases. A diagnosis line reads
`runtime ts exit=1` with no leaf detail, the same as a failed `runtime status`
or `runtime update` would. Unlike `build`, which records `leaf=load`, the line
does not say which `runtime` subcommand ran.

A related weakness: usage errors count too. A mistyped command
(`(none) usage exit=1 usage=top-level`) or a subcommand's argument refusal
(`journey ts exit=2`) is recorded as an `ERROR`. The recommendation then sends
the person looking for "routing, schema-guard, and backup failures" that never
happened.

## Expected Behavior

A diagnosis does not count itself. `front_door_errors` reports failures of the
front door's work (routing, schema guard, backup, a command that broke). It does
not report the diagnosis's own verdict or a person's typo. After the real
findings are repaired, the next `runtime diagnose` exits 0.

## Impact

Low severity. The finding is noisy, not harmful. But it wears down trust in the
signal: the check that exists so backup and guard failures don't go unnoticed
(CR026) gets dismissed as noise, so a real failure hiding among
self-inflicted lines is the one that gets missed. It came up on the
first `runtime diagnose` after v0.32.1 on the production home, next to two
genuine permission findings.

## Plan Or Decision

Pending. Options, not exclusive:

- Log a findings-only diagnosis exit as `INFO` with a detail
  (`leaf=diagnose findings=N`), or as its own level. The exit code stays 1
  for scripts.
- Have `frontDoorErrorFindings` skip `route=usage` lines and the diagnose
  leaf. That needs the `runtime` route to record its leaf, as `build` does.
- Split the count in the finding's detail (failures vs. usage errors), so the
  recommendation matches what was counted.

Captured without selecting; Current Focus unchanged.

## Evidence

- Production `front-door.log`, 2026-10-12. A diagnosis at 19:01:21Z reported 3
  errors in the last 24h:
  - `2026-10-11T20:32:39Z ERROR runtime ts exit=1`, an earlier `runtime`
    non-zero exit, most likely a previous diagnosis;
  - `2026-10-12T17:31:17Z ERROR journey ts exit=2`, an argument refusal followed
    by a successful `journey` call 1.5 s later;
  - `2026-10-12T18:54:12Z ERROR (none) usage exit=1 usage=top-level`, an agent
    running `mirror --version`, which is not a command.

  That diagnosis then appended `2026-10-12T19:01:21Z ERROR runtime ts exit=1`,
  which the next run counts.
- `ts/src/frontDoor/runtimeRoute.ts:277`:
  `return findings.length === 0 ? 0 : 1;`
- `ts/src/frontDoor/frontDoorLog.ts:43`:
  `const level = entry.exitCode === 0 ? "INFO" : "ERROR";`
- `ts/src/runtime/diagnose.ts` (`frontDoorErrorFindings`,
  `FRONT_DOOR_WINDOW_MS`).

## Outcome

**Rejected 2026-10-22**, by the Navigator's decision: a duplicate, not declined.
[CR139](cr139-a-verdict-that-exits-1-is-logged-as-a-front-door-error.md), captured three
days later at CR138's selection, describes the general case: every verdict that exits 1 is
logged as an `ERROR`, not only `diagnose`'s. CR139 carries the work. Several parts of this
CR moved into it:

- the problem points: the loop outliving its cause, the `runtime` line that names no
  subcommand, and the typo that counts;
- the expected exit 0 once the real findings are repaired;
- the three plan options.

This CR's evidence stays here, and CR139 links to it.
