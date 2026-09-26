[< RS004](index.md) · [Canonical status](../index.md#change-requests)

# CR104 — Journey slugs are not validated, and command hints print them raw

## Problem

A journey slug is an identity key, and nothing constrains it.
`identity set journey 'x;touch PWNED'` creates a journey, and `journey set-path`,
`build adopt`, `build sync-cursor`, and `build pull-candidates` all accept it. This
was reproduced in an isolated home during CR002's handoff review on 2026-09-26.

The front door prints the slug unquoted inside commands it tells the reader to run:

- `ts/src/builder/methodInspection.ts:188`: `mirror build adopt --journey <slug> --method ariad`
- `ts/src/builder/commands.ts:256`: `Run: mirror build adopt --journey <slug> --method ariad`
- `ts/src/builder/commands.ts:570`: `Run: mirror build sync-cursor --journey <slug> --method ariad`
- `ts/src/builder/load.ts:304`: `Run: mirror journey set-path <slug> /path/to/project`

A reader or agent that follows one of these hints runs whatever the slug smuggles
in. CR002's `pull explicitly:` command had the same hole. It has quoted the slug
since CR002's handoff review; these four predate it.

## Expected Behavior

A journey slug is validated where it is created, against one grammar that a shell
carries as a plain word, such as lowercase letters, digits, and hyphens. Existing
journeys outside that grammar are reported, not silently rewritten. Independently of
validation, every command hint quotes the slug it interpolates, through one shared
helper. The helper exists today but is private to `ts/src/builder/scopePhrases.ts`.

## Impact

The slug travels from a database key into a shell. Agents run the commands that
create journeys, so the path from injected text to a command on the Navigator's
machine can be two steps long: a crafted slug, then a hint that prints it.

## Plan Or Decision

Pending. Captured on the Navigator's decision during CR002's handoff review. Decide
the grammar, and what happens to existing slugs outside it: report them, rename
them, or refuse to operate on them.

## Evidence

In an isolated home on 2026-09-26, `identity set journey 'x;touch PWNED'` printed
`✓ journey/x;touch PWNED created`, and `journey set-path`, `build adopt`, and
`build sync-cursor` succeeded. Before CR002 quoted it, the `pull explicitly:` line
read `--journey x;touch PWNED --method ariad …`. The four hint sites above were
found by searching `ts/src` for a `PROGRAM` command that interpolates a journey or
slug.

## Outcome

Pending.
