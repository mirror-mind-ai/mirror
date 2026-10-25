[< RS009](index.md) · [Canonical status](../index.md#change-requests)

# CR171 — A prompt equal to a `mirror doorman` flag is read as the flag

## Problem

`runMirrorDoormanRoute` (`ts/src/frontDoor/mirrorModeRoute.ts`) reads its options with
`optionValue` and `hasOption`, which take a flag's first occurrence anywhere in argv
and cannot tell a flag from a value. Every runtime's caller puts the person's prompt in
argv as the value of `--prompt`:

- a prompt that is exactly `--forget` makes `hasOption` true: the route forgets the
  session's delivery and returns — that turn gets nothing, and the next ordinary turn
  is a full folder;
- a prompt that is exactly `--session-id`, from a caller that passes `--prompt` first
  (Claude's inject hook, the Pi extension), names a session called `--session-id`, and
  the turn gets nothing. Antigravity's hook passes `--session-id` first since TS6.

## Expected Behavior

A prompt is a value whatever it says: the route reads `--prompt`'s value as the
prompt, and no prompt can select a branch or name a session.

## Impact

Low: the prompt must be exactly a flag. The effect is one turn without context, or one
extra full folder.

## Plan Or Decision

Captured, unassigned, 2026-10-25, from CV9.DS8.TS6's Debt Review, at the Navigator's
direction. Filed in RS009 beside the other routes that swallow their own arguments
(CR089, CR096, CR109). **Revisit:** the next change to the doorman route's parsing.

## Evidence

By reading the route and `ts/src/frontDoor/args.ts`. TS6's `agy.test.ts` drives a
`--forget` prompt through agy's hook and asserts only that the turn does not fail; its
`--session-id` case is mutation-checked: with `--prompt` first, the test fails.
