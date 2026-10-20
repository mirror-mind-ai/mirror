[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR149 — `bind` accepts a persona or journey that does not exist, and reports `bound`

## Problem

`mirror ext hello bind backend --persona engine` answered
`bound hello/backend -> persona/engine`. There is no persona `engine`; the Navigator
had dropped two letters from `engineer`. `runBind` (`ts/src/extensions/bindings.ts`)
inserts the `_ext_bindings` row with the target as typed and looks nothing up — a
faithful port of Python's `_cmd_bind`, which did the same.

The binding then does nothing, silently: a load for `engineer` finds no binding, a
load for `engine` never happens, and `ext hello bindings` lists the row as if it
were live. The person learns of the typo when the context they expected never
appears, which is the slowest possible feedback for a one-word mistake.

## Expected Behavior

`bind` checks that the target exists before writing the row — a persona in the
personas table, a journey by slug — and refuses with one line naming the target
when it does not: `no persona 'engine'`. `--global` has nothing to check. `unbind`
stays as it is: removing a row that points at nothing is the repair, not the
mistake. `bindings` could flag a row whose target has since disappeared, but that
is a second step and may be its own CR.

## Impact

Low severity, real friction: the mistake is easy, the symptom is far from the
cause, and the fix is one query at the write. Deliberate divergence from the Python
oracle; the oracle is retired and the golden for `bind` pins the success line, not
the absence of a check.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CR145's validation (the second run, step 11),
at the Navigator's direction. Current Focus unchanged.

## Evidence

The Navigator's transcript, 2026-10-20, against the checkout: the `bound` line above
for a persona that does not exist, followed by a `mirror load --persona engineer`
that rendered no section and no diagnostic. `runBind`, `ts/src/extensions/bindings.ts:57–65`.

## Outcome

Open.
