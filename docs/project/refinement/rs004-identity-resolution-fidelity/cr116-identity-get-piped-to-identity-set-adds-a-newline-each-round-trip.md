[< RS004](index.md) · [Canonical status](../index.md#change-requests)

# CR116 — `identity get` piped to `identity set` adds a newline each round trip

## Problem

`identity get <layer> <key>` prints the stored document and then a newline
(`renderIdentityGet`, `ts/src/frontDoor/render/identity.ts:58`). `identity set
<layer> <key>` with no `--content` stores what it reads from stdin, byte for byte
(`readStdinContent`, `ts/src/frontDoor/cli.ts:820`). So the natural way to edit an
identity document from a script, read it, change a line, write it back, is not the
identity function: every cycle stores one more trailing newline than it read.

Reproduced 2026-09-30 in a scratch home, on a document stored as `# J\n\nBody.\n\n\n`:

| Route | Stored after one cycle |
|---|---|
| `identity get journey j \| identity set journey j` | one trailing newline more than it read |
| `identity set journey j --content "$(identity get journey j)"` | every trailing newline gone |

The second row is the shell's command substitution, not Mirror. But it drifts the
other way, so a caller who switches between the two routes to avoid one drift meets
the other.

## Expected Behavior

Reading an identity document and writing back what was read stores the same bytes.
Either `get` prints the stored document exactly, or `set` removes the one newline
`get` adds, and the rule is stated where both are documented. The Plan decides which.
It also decides whether `journey update <slug> -` and the journey path's reader have
the same asymmetry, which this capture did not check.

## Impact

Low, and silent. Trailing whitespace accumulates in identity documents a runtime
loads into every session, and a byte-level comparison of a document before and after
an edit reports a change nobody made. It was found by exactly such a comparison.

## Plan Or Decision

Pending. Captured 2026-09-30 by the Navigator's decision; outside the Ariad trust floor.

## Evidence

Found 2026-09-30 while closing
[CR112](../rs001-ariad-runtime-trust/cr112-a-scaffold-cannot-be-told-from-authored-content-and-approve-plan-never-reads-the-plan.md),
at `825950af`, updating the `mirror-ts-core` journey's Stage line. The Driver read the
identity with `identity get` (3,773 bytes), edited two lines, and wrote it back
through `identity set` from stdin. Read again, it was one byte longer than the file
sent: the trailing newline `get` had added was now stored. The Driver removed it by
writing the content with one trailing newline fewer, and confirmed that the stored
document then differed from the original only in the two edited lines.

## Outcome

Pending.
