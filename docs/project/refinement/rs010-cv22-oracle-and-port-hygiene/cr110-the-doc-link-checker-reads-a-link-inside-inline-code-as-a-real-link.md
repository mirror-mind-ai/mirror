[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR110 — The doc-link checker reads a link inside inline code as a real link

## Problem

`checkFile` (`ts/src/docs/docsLint.ts`) blanks fenced code blocks before it
scans for links (`stripFencedCode`), but it leaves inline code spans in place.
Link syntax quoted inside backticks is therefore checked as a link. When the
target does not exist, the docs gate fails for a link nobody wrote.

This journey's path records that it hit three times during CR018, and each time
the prose was reworded to get past the checker. It was not captured until the
Workbench inspection that followed the Ariad trust floor.

## Expected Behavior

Text inside an inline code span is code, not a link, and the checker skips it
as it skips fenced blocks. A real link outside code is still checked, with the
same line number it has today.

## Impact

Low. Documentation cannot quote link syntax in backticks, and the workaround is
to reword the prose. The docs gate guards every link in the repository, so the
fix needs a regression case of its own beside the existing ones in
`ts/test/scripts/docsLint.test.ts`, and a case showing that a real link next to
a code span is still caught.

## Plan Or Decision

Not planned. Captured without selecting; Current Focus unchanged. Captured on
2026-09-27 by the Navigator's decision after the Workbench inspection that
followed the Ariad trust floor, outside the floor.

This document shows its example in a fenced block below, because quoting it in
backticks would fail the very check it describes.

## Evidence

Reproduced on 2026-09-27 against a scratch file whose only prose line was:

```text
Quote the syntax in code: `[label](missing-file.md)`.
```

`checkFile` reported one broken link, at line 3 of the scratch file:
`missing-file.md`, `target file does not exist`. In `ts/src/docs/docsLint.ts`,
`LINK_RE` scans the output of `stripFencedCode`, which blanks only fenced
blocks.

## Outcome

Open.
