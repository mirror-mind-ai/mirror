[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR124 — `init` ignores `MIRROR_HOME` and leaves a home under `~/.mirror-minds` when a scratch home was asked for

## Problem

`mirror init <user>` creates the home at `~/.mirror-minds/<user>` unconditionally
(`defaultUserHome`, CV22.DS10.US3 D14). It accepts no `--mirror-home`, and it reads
`MIRROR_HOME` from the environment for one purpose only: to decide whether to print
"this machine already selects a user" instead of writing `MIRROR_USER` to the config
file (`runInit`, `ts/src/frontDoor/cli.ts`).

So a shell that has set `MIRROR_HOME=/tmp/<scratch>/<user>` — the project's own practice
for keeping validation routes away from personal data — gets a home created somewhere
else, under the real homes root, with no word that the variable was ignored. The
printed next step then says `run with MIRROR_USER=<user>`, which, taken together with
the `MIRROR_HOME` the shell already carries, makes the next command refuse:
`MIRROR_HOME (/tmp/…/u) conflicts with MIRROR_USER (…)` when the basenames differ, or
resolves to the scratch path, where `init` put nothing.

## Expected Behavior

Either `init` honors `MIRROR_HOME` (and a `--mirror-home` flag, as every other command
takes) and creates the home there, or it refuses when `MIRROR_HOME` is set to a path
other than the one it would create, saying so. In neither case does a scratch-home shell
end up with a stray `~/.mirror-minds/<user>`. The next-steps text names a configuration
that works with what the shell already has.

## Impact

Low for a first install, which has nothing set. Real for every validation route: the
collaboration protocol requires scratch homes, and the route for CR121 left
`~/.mirror-minds/u` behind twice on 2026-10-11 (once in the Driver's check, once in the
Navigator's), each deleted by hand. The same shape will meet anyone running a second
mirror on one machine.

## Plan Or Decision

Pending. The decision to take first: honor or refuse. Honoring is the smaller surprise —
`MIRROR_HOME` is the documented way to point a mirror anywhere, and `init` is the one
command that does not listen. If honored, `init` writes nothing to the config file when
`MIRROR_HOME` chose the path, since the variable, not the file, is selecting the home.
Captured without selecting; Current Focus unchanged.

## Evidence

- 2026-10-11, Driver's check for CR121: `MIRROR_HOME=/tmp/cr121-review/homes/u mirror
  init u` created `~/.mirror-minds/u/identity` (22 files) and printed "Identity root
  already exists and is not empty" about it; deleted by hand.
- 2026-10-11, Navigator's route for CR121: `export MIRROR_HOME=/tmp/cr121/u; mirror init u`
  printed `Created user home: /Users/vinicius/.mirror-minds/u` and
  `run with MIRROR_USER=u`; the next command, `mirror list journeys`, refused with
  `MIRROR_HOME (/tmp/cr121/u) conflicts with MIRROR_USER (vinicius-ts)`. Setting
  `MIRROR_USER=u` as well made the scratch path resolve, with the database born there and
  the identity elsewhere; both deleted by hand.
- Code: `ts/src/init/init.ts` `defaultUserHome`; `ts/src/frontDoor/cli.ts` `runInit`
  (`configured = Boolean(env.MIRROR_USER || env.MIRROR_HOME)`).

## Outcome

Pending.
