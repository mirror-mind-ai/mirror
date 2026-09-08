[< RS010](index.md)

# CR070 — Render or remove the inert `--listening-for` argument

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`soul rite` accepts `--listening-for`, and nothing consumes it.
`render_active_rite` (`src/memory/surfaces/soul.py`) takes the parameter and
never reads it; `ACTIVE_RITE_DEFAULTS[voice]["listening_for"]` is likewise dead.
The rendered card shows the title, `the voice says`, and the utterance — the
situated listening focus the flag names appears nowhere.

The skill documents the flag, so a user can pass a considered value and watch it
change nothing.

## Expected Behavior

One of two, and the choice is a product decision rather than a technical one:
either the card renders the situated listening focus, which is what the flag and
the defaults table imply was intended, or the flag and the dead defaults are
removed so the surface stops promising something it does not do.

## Impact

Low mechanically, higher ritually. Soul Mode's value depends on the user
trusting that what they say to it lands somewhere. An argument that is accepted
and discarded is a small breach of exactly that.

## Plan Or Decision

Decide render-or-remove, then apply it to both cores and to the three `mm-soul`
skill copies in the same change.

The TypeScript port reproduces the inertness faithfully and pins it with a
scenario named `rite_listening_for_is_inert`, so whichever way this is decided,
the corpus will show the change rather than hide it.

## Evidence

`ts/test/goldens/soul-surface.golden.json`, scenario
`rite_listening_for_is_inert`: the rendered card is byte-identical with and
without the argument.

## Outcome

_Pending._

## Provenance

Found while porting the Soul surfaces in CV22.DS7.US6 plateau 1 and captured at
that story's Debt Review on 2026-09-08.
