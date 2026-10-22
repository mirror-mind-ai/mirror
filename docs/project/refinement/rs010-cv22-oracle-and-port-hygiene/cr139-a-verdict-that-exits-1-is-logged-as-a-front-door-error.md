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

Three more facts come from
[CR127](cr127-runtime-diagnose-counts-its-own-exit-as-a-front-door-error.md), which found
the same loop on 2026-10-12 and is now folded into this CR:

- The loop outlives its cause. Once a home has any finding, `front_door_errors` stays on
  until 24 hours after the last `diagnose`, even after the original finding is fixed.
- A `runtime` line does not name its subcommand. A diagnosis is logged as
  `runtime ts exit=1`, the same as a failed `runtime status` or `runtime update`. `build`
  records `leaf=load`, but `runtime` records nothing, so even reading the log by hand
  cannot tell a verdict from a failure.
- A mistyped command counts too. `mirror --version`, which is not a command, is logged as
  `(none) usage exit=1 usage=top-level`. The recommendation then sends the person looking
  for routing, schema-guard, and backup failures that never happened.

## Expected Behavior

- A command that answered with a verdict is not logged as an error. Which exit codes are
  verdicts, and whether the log gains a level or a field for them, is the plan's
  decision.
- `diagnose`'s `front_door_errors` counts failures: a crash, a refused write, a guard
  that fired, a backup that failed. Not verdicts, not a person's typo (CR127), and not its
  own previous findings.
- CR026's purpose holds: a real failure in the last 24 hours is still a finding.
- After the real findings are repaired, the next `runtime diagnose` exits 0 (CR127).

## Impact

Low. The finding is advisory, and the recommendation it prints sends the person to the
log, where the lines say `runtime` and nothing more. But it is a false alarm that a
healthy install can raise on itself, and CR138's false `attention needed` from outside
a checkout fed it on this machine: of the `vinicius-dev` home's 36 `ERROR` lines in the
24 hours before 2026-10-15 19:20Z, 17 were `runtime` commands, most of them verdicts.
CR138 removes those false verdicts; the true ones, and the loop, remain.

CR127 named the deeper cost. The check exists so that backup and guard failures do not go
unnoticed (CR026). A finding that is usually noise gets dismissed, so a real failure
hidden among self-inflicted lines is the one that gets missed. The 2026-10-22 evidence
below is that case: one real line in five.

## Plan Or Decision

Captured, unassigned, 2026-10-15, at CR138's selection, which found it. Current Focus
unchanged (CR138).

2026-10-22: by the Navigator's decision, this CR carries CR127's work, and CR127 is closed
as its duplicate. CR127's options come with it. They are not exclusive:

- Log a findings-only diagnosis exit as `INFO` with a detail
  (`leaf=diagnose findings=N`), or as its own level. The exit code stays 1 for scripts.
- Have `frontDoorErrorFindings` skip `route=usage` lines and the diagnose leaf. That
  needs the `runtime` route to record its leaf, as `build` does.
- Split the count in the finding's detail (failures vs. usage errors), so the
  recommendation matches what was counted.

Still captured and unassigned. Current Focus unchanged.

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

**2026-10-22, the production home (v0.36.2), as the last check of a new user's install
guide.** The guide wires the package and an extension into Claude Code Desktop and ends
with `runtime diagnose`. The install was healthy (the extension answered from Claude Code
Desktop, the session was logged, `hooks.log` did not exist). `diagnose` answered:

```text
[attention] front_door_errors: 5 front-door error(s) in the last 24h (.../front-door.log)
Status: attention needed
```

The five lines it counted, from `front-door.log`, with what each one was:

```text
2026-10-21T09:32:05.922Z  ERROR  extensions  ts     exit=1  leaf=install     a real failure; the same install succeeded at 13:36:54Z
2026-10-21T13:37:03.120Z  ERROR  runtime     ts     exit=1                   9 s after that install; the line does not say which subcommand
2026-10-21T22:15:45.007Z  ERROR  (none)      usage  exit=1  usage=top-level  a mistyped command
2026-10-22T09:23:24.384Z  ERROR  runtime     ts     exit=1                   by their timing, earlier diagnose runs of the same check
2026-10-22T09:25:48.105Z  ERROR  runtime     ts     exit=1
```

That run then appended `2026-10-22T09:27:56.988Z ERROR runtime ts exit=1`, which the
next run counts. One line in five was a failure, and it had already been repaired. Three
of the other four were `runtime` exits that the line cannot name, and one was a typo. The
guide now has to tell the new user that this finding is a known bug and which lines to
read anyway. That is the opposite of what CR026 built the check for.

Overlap: CR127 (captured 2026-10-12) reports the same loop for `diagnose` and for usage
errors, with plan options. This CR extends it to every verdict that exits 1. The same day,
CR127 was folded into this CR (see Plan Or Decision). Its evidence, from the production home
on 2026-10-12, stays in
[CR127](cr127-runtime-diagnose-counts-its-own-exit-as-a-front-door-error.md#evidence): a
diagnosis counting an earlier `runtime` exit, an argument refusal, and `mirror --version`.

On `main` on 2026-10-22, `diagnose` exits 1 at `ts/src/frontDoor/runtimeRoute.ts:355`
(CR127 cited line 277):

```text
return findings.length === 0 ? 0 : 1;
```

## Outcome

Pending.
