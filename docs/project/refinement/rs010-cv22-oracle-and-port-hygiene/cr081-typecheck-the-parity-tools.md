[< RS010](index.md)

# CR081 — Typecheck the parity tools

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`ts/tsconfig.json` includes `src/**/*.ts` and `test/**/*.ts`. It does not
include `parity/`, so `npm run typecheck` never sees
`ts/parity/live_long_tail_smoke.ts`, `ts/parity/route_matrix.ts`,
`ts/parity/real_db_copy_verify.ts`, or any other Navigator-run tool there.
Node executes them anyway through type stripping, so a type error in a parity
tool surfaces only if it happens to be a runtime error too.

One already exists. Typechecking the two files CV22.DS8.TS2 edited, by hand
with a throwaway tsconfig, found a pre-existing `TS2353` in
`route_matrix.ts`: the "retired gate is inert" check passes
`MIRROR_TS_EXTERNAL_ROUTES` in an object literal typed as `RouteEnvironment`,
which no longer declares that key (US3 retired the gate and removed it from
the type in the same story). The check still runs — the literal is an excess
property at compile time, nothing at runtime — so CI is green and the tool
works, and the type system's opinion is simply unread.

These are the tools that decide whether a live cutover passed. They deserve
the same compiler the code under test gets.

## Expected Behavior

`npm run typecheck` covers `ts/parity/**/*.ts`, and CI fails on a type error
in a parity tool the way it fails on one in `src/`. The known `TS2353` is
fixed as part of enabling the check — most likely by typing that one check's
environment as `Record<string, string | undefined>`, since testing a retired
key's inertness is exactly a case where the narrow type is wrong.

## Impact

Low today, real over time: every DS8 story has added to the smoke, and DS9
and DS10 will add tools of their own. The cost of the gap is paid the first
time a refactor in `src/` silently breaks a parity tool's import or shape and
a Navigator finds out at validation, on a database copy, with money on the
line.

The unknown is what else the include line reveals. `real_db_copy_verify.ts`
and the older tools predate several `src/` refactors; enabling the check may
surface more than one error, which is why this is a CR and not a line in
TS2's closure.

## Plan Or Decision

Not planned. First step is the measurement: add `parity/**/*.ts` to the
include list locally and count. If it is the one known error, fix it and ship
the include in one commit. If it is a dozen, decide whether to fix them or to
exclude specific legacy tools by name with a dated reason.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Found 2026-09-13 while validating CV22.DS8.TS2's edits to the live smoke
(`prompt_tokens` floor) and the route matrix, recorded in that story's
[Debt Review](../../roadmap/cv22-typescript-core-port/cv22-ds8-live-provider-cutover/cv22-ds8-ts2-port-the-cultivation-prompt-templates/review.md)
and deferred with this CR as the revisit trigger — the next story that edits
anything under `ts/parity/`.
