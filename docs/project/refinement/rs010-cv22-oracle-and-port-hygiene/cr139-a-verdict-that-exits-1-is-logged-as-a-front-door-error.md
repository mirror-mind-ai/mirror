[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR139 — A verdict that exits 1 is logged as a front-door `ERROR`, and `diagnose` counts it as a failure

## Problem

The front door logs every command with a level taken from its exit code alone:
`level = exitCode === 0 ? "INFO" : "ERROR"` (`ts/src/frontDoor/frontDoorLog.ts`). Several
commands exit 1 to report a verdict, not a failure: `runtime status` on `attention
needed`, `runtime diagnose` when it has findings, `runtime update --check` on
`unresolved`, and since CR134 `release-notes pending` on `unknown`. A usage refusal exits
2 and is logged the same way. All of them land in `front-door.log` as `ERROR`.

`runtime diagnose` then reads that log: `frontDoorErrorFindings` (`ts/src/runtime/diagnose.ts`,
the port of CR026's `_front_door_error_findings`) counts the `ERROR` lines of the last
24 hours and reports them as `front_door_errors`, "attention needed", with the
recommendation to "rule out routing, schema-guard, and backup failures". A `diagnose` that
finds something therefore exits 1, is logged as an `ERROR`, and feeds its own next count.

## Expected Behavior

- A command that answered with a verdict is not logged as an error. Which exit codes are
  verdicts, and whether the log gains a level or a field for them, is the plan's
  decision.
- `diagnose`'s `front_door_errors` counts failures: a crash, a refused write, a guard
  that fired, a backup that failed. Not verdicts, and not its own previous findings.
- CR026's purpose holds: a real failure in the last 24 hours is still a finding.

## Impact

Low. The finding is advisory, and the recommendation it prints sends the person to the
log, where the lines say `runtime` and nothing more. But it is a false alarm that a
healthy install can raise on itself, and CR138's false `attention needed` from outside
a checkout fed it on this machine: of the `vinicius-dev` home's 36 `ERROR` lines in the
24 hours before 2026-10-15 19:20Z, 17 were `runtime` commands, most of them verdicts.
CR138 removes those false verdicts; the true ones, and the loop, remain.

## Plan Or Decision

Captured, unassigned, 2026-10-15, at CR138's selection, which found it. Current Focus
unchanged (CR138).

## Evidence

```text
$ grep -n 'level = ' ts/src/frontDoor/frontDoorLog.ts
43:    const level = entry.exitCode === 0 ? "INFO" : "ERROR";

$ tail -3 ~/.mirror-minds/vinicius-dev/front-door.log      # after three status/diagnose runs from /tmp
2026-10-15T19:19:06.846Z	ERROR	runtime	ts	exit=1
2026-10-15T19:19:17.566Z	ERROR	runtime	ts	exit=1
2026-10-15T19:19:17.928Z	ERROR	runtime	ts	exit=1

$ mirror runtime diagnose       # from /tmp, then from the checkout, a minute apart
[attention] front_door_errors: 33 front-door error(s) in the last 24h (...)
[attention] front_door_errors: 34 front-door error(s) in the last 24h (...)
```

The count rose by one between the two runs: the first `diagnose`'s own exit 1.

## Outcome

Pending.
