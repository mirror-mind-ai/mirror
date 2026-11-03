[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR195 — The test suite writes four lines into the developer's real `front-door.log` on every run, three of them `ERROR`

## Problem

Every run of the suite on the maintainer's machine leaves four lines in
`~/.mirror-minds/vinicius-dev/front-door.log`, the real home's log:

```text
2026-11-03T15:18:11.662Z	ERROR	init	ts	exit=2
2026-11-03T15:18:15.991Z	ERROR	(none)	usage	exit=1	usage=top-level
2026-11-03T15:18:16.497Z	ERROR	week	usage	exit=2	usage=family
2026-11-03T15:18:16.982Z	INFO	build	usage	exit=0	usage=family
```

The stamps are the suite's (`bash scripts/test_leaves_nothing.sh`, 2026-11-03), and the
same four appear on 2026-10-31 and 2026-11-02, one set per run. Four tests spawn the
front door in a way that lets it resolve the real home: the tree's `.env` names
`MIRROR_USER=vinicius-dev`, and a spawn that clears `MIRROR_USER` from the environment
but not the tree's `.env` reading, or that reaches the usage path before any home is
chosen, still logs to the home the tree selects. The exact four are to be found by
running each candidate file alone and reading the log: `initCli.test.ts` or
`createHome.test.ts` (`init` exit 2), `homeNotConfigured.test.ts` (the bare front door,
`usage=top-level`), `weekViewCli.test.ts` (`week` family usage), `buildRouting.test.ts`
(`build` family usage).

Three of the four are `ERROR` lines, so `runtime diagnose` on the real home reports
`front_door_errors: 3 front-door error(s) in the last 24h` after every test run: a
finding about the developer's own suite, not about the install. It is the same class as
CR182 (the consult replay test wrote a row into the real home) and CR163 (the suite left
its temp homes behind): the suite reaching outside its scratch.

## Expected Behavior

- No test writes into a home it did not create. A front-door spawn in a test names its
  home (`MIRROR_HOME` to a scratch directory, or `--db-path`), or runs where the tree's
  `.env` cannot be found, or the front door's usage path logs to no home.
- A guard, in the spirit of CR163's `checkTestTempHomes` and CR182's test: the suite
  fails when the real home's `front-door.log` grew during the run, naming the lines.
  Measured under the developer's real configuration, which is where it bites; on CI
  there is no real home and the guard passes trivially.
- `runtime diagnose` on the maintainer's home reports no `front_door_errors` from the
  suite.

## Impact

Low in product terms, real in signal: the finding that CR139 just stopped feeding itself
is fed by the suite instead, three lines per run. Every developer with a configured home
sees it, and a `front-door.log` that fills with test noise is one no one reads when a
real routing or backup failure lands in it.

## Plan Or Decision

Captured, unassigned, 2026-11-03, at the Navigator's direction, from the DevOps lens of
PR #50's review, which read the real log to confirm the PR's claim and found these.

## Evidence

- `~/.mirror-minds/vinicius-dev/front-door.log`, 2026-11-03T15:18:11–16Z: the four lines
  above; the same four on 2026-10-31 and 2026-11-02 at the suite's run times.
- `grep -c $'\tERROR\tinit\t'` on that log: one per suite run; `(none) usage` and `week
  usage` likewise.
- `ts/test/helpers/frontDoor.ts`: `spawnFrontDoor` passes `{ ...process.env, ...env }`;
  a test that sets `MIRROR_USER: ""` leaves the tree's `.env` to name the home.
- CR182 (2026-10-26) and CR163 (2026-10-18): the two earlier findings of the suite
  reaching outside its scratch, and the guards they added.

## Outcome

Pending: captured, not planned.
