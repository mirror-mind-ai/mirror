[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR150 — `install` prints `suggested_personas` this home does not have, as if it did

## Problem

A manifest's `mirror_context_providers[].suggested_personas` is a hint the
[binding model](../../../product/extensions/binding-model.md) shows at `install`
"to make binding obvious". It is shown as written — `treasurer, cfo, founder` —
whether or not this home has a `treasurer`. Since
[CR149](cr149-bind-accepts-a-persona-or-journey-that-does-not-exist.md), the
`bind` the person then types refuses with `no persona 'treasurer'`; the hint that
sent them there could have said so one step earlier.

## Expected Behavior

The install report marks each suggested persona the home does not have —
`suggested personas: treasurer (not in this home), cfo, founder` — reading the same
`identity` rows `bind` checks. A home with all of them sees the line as today.

## Impact

Small: one lookup per suggested persona at install, and a hint that stops
suggesting what cannot be bound. A natural step after CR149; separate because
`install`'s report is its own golden.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CR149's review (product lens), at the
Navigator's direction. Current Focus unchanged.

## Evidence

`docs/product/extensions/binding-model.md`, *Capabilities*: "`suggested_personas`
is a hint, never a binding … shown to the user during install". The install
report's rendering in `ts/src/extensions/catalogWrites.ts`.

## Outcome

Open.
