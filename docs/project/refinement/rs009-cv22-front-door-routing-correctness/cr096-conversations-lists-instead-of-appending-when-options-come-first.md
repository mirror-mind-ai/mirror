[< Refinement Workbench](../index.md) · [RS009](index.md)

# CR096 — `conversations <options> append` renders the listing, exit 0, and drops the payload on stdin

**Refinement Story:** RS009 — CV22 Front-Door Routing Correctness
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

`conversations append` is the published write contract for third-party shells
(`conversations append --mirror-home PATH --format json < payload.json`). The
route claims it only when `append` is the FIRST token after `conversations`.
With an option in front, the TypeScript front door answers the plain listing,
exits 0, and never reads stdin:

```text
$ node ts/src/frontDoor/cli.ts conversations --mirror-home H append --format json < payload.json
No conversations found.
$ echo $?
0
```

The messages are silently discarded. The oracle does not accept this shape
either -- `uv run python -m memory conversations --mirror-home H append …`
exits 2 with argparse's `unrecognized arguments` -- so this is not a parity gap
TS5 had to close. It is a TypeScript leniency: the listing handler ignores
positionals it does not understand, where the oracle's parser refused them.
It is the CR055 shape (a write answered as a read, exit 0), reached through
option order instead of subcommand inheritance.

Found 2026-09-24 by CV22.DS10.TS5 plateau 2 while measuring flag-first
invocations on both engines (inventory F5). Deliberately not folded into F5's
fix: F5 made the front door answer flag-first forms the ORACLE accepts, and
this is a form the oracle rejects.

## Expected Behavior

`conversations` with an `append` token anywhere is either the append write --
payload read, validated, appended -- or a refusal, never the listing. Two
candidate shapes, a Navigator choice:

1. **Accept it** -- treat `append` past leading options as the append route,
   as `argvShape.ts` already does for seven families. The caller's intent is
   unambiguous and the write lands.
2. **Refuse it** -- the listing refuses a positional it does not understand,
   exit 2, the way the oracle's parser did. Nothing is read, nothing is lost,
   and the caller learns the documented order.

Either way the listing stops answering a write, and a test pins it.

## Impact

Low frequency, high consequence. No shipped skill or hook uses this order --
the documented contract puts `append` first -- but an integrator who writes
the options first loses every message with a success code, which is the one
failure mode this refinement story exists to close.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged.

## Evidence

- `ts/src/frontDoor/routing.ts` -- the `conversations` branch tests `argv[1]
  === "append"`; every other shape reaches the listing.
- `ts/src/frontDoor/cli.ts` `runConversationsRead` -- reads `--limit`,
  `--journey`, `--persona`, and ignores anything else.
- Measured 2026-09-24 on a generated demo home: TypeScript exit 0 with the
  listing; Python exit 2, `unrecognized arguments`.
- [CV22.DS10.TS5 inventory, F5](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/inventory.md#f5--valid-flag-first-invocations-reach-python-through-the-fallthroughs).

## Outcome

Open.
