[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR130 — Double-encoded em dashes in the configuration reference, and nothing that catches them

## Problem

`docs/reference/configuration.md` holds 21 em dashes, on 17 lines, whose three UTF-8
bytes (`E2 80 94`) were re-encoded one by one as Latin-1. Each reads as `â` followed by
two invisible C1 control characters (`C3 A2 C2 80 C2 94`). They came in with
`83a93477` (2026-09-24, "Record plateau 4: the python-core cutoff…"). One more sits
in CR107's document, from `3359da61` (2026-10-05).

A reader sees stray characters, a search for the text misses, and no check notices:
the doc-link checker reads links and headings, not encoding.

## Expected Behavior

- Every occurrence reads `—` again, in both files.
- A check fails on the double-encoded sequence (`C3 A2 C2 80 C2 94`, and the same shape
  for other characters if found) anywhere in the docs, so the next one is caught when
  it is written.

## Impact

Low. Readability and search in a reference page people consult for configuration.

## Plan Or Decision

Captured, unassigned, at CV21.DS2's Debt Review (2026-10-13, deferred as a Change
Request). Current Focus unchanged.

## Evidence

Counted on 2026-10-13 with a byte search over every Markdown file in the repository:
21 occurrences on 17 lines in `docs/reference/configuration.md`, 1 in
`docs/project/refinement/rs001-ariad-runtime-trust/cr107-an-escaped-pipe-in-a-candidate-table-title-is-read-as-a-cell-border.md`,
and none elsewhere. `git log -S` on the sequence names `83a93477` and `3359da61`.

CV21.DS2.US6 rewrote two paragraphs of `configuration.md` and removed two of them in
passing. Its Debt Review first said 23 and attributed them to `ccf8b1cc`, the last commit
to touch the file. Both corrected here: 23 was a count of lines containing `â` before
that edit, and `ccf8b1cc` added none.

## Outcome

Pending.
