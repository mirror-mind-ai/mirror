[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR107 — An escaped pipe in a candidate-table title is read as a cell border

## Problem

Expand reads a Delivery Story's `## Candidate Stories` table by splitting every row on
`|` (`parseCandidateStories`, `ts/src/builder/expand.ts`). It does not honor the
Markdown escape `\|`, which is how an author writes a literal pipe inside a cell. A
title that contains one is cut at the pipe. The authored cell ``Read `a \| b` input``
becomes ``Read `a \``, and that fragment is what Expand recommends, what the child
package's heading says, and what every line of the child scaffold repeats.

Two neighbours share the shape. Both were found by reading the code; neither has been
run:

- The roadmap index reader (`rowCells`, `ts/src/builder/pullCandidates.ts`) and the
  Delivery Story closure's status-table reader (`ts/src/builder/deliveryStoryRoadmapClosure.ts`)
  split rows the same way.
- The Delivery Story scaffold Expand writes when no authored package exists
  (`renderDeliveryStoryIndex`, `ts/src/builder/artifacts/storyIndex.ts`) puts a title
  into a table cell without escaping a pipe in it, so the table it writes would not read
  back as written.

## Expected Behavior

A `\|` inside a cell is part of the cell's text, in every roadmap table Ariad reads. A
title Ariad writes into a table cell has its pipes escaped, so the row reads back
exactly as written.

## Impact

Rare, and the same class as CR018: a character inside a title is treated as a delimiter.
A title that names a shell pipeline, a union type, or an either/or written with a pipe
reaches the Navigator as a fragment, and the scaffold carries the fragment into the
repository.

## Plan Or Decision

Pending. Outside the Ariad trust floor, by the Navigator's decision of 2026-09-27.

## Evidence

Found while characterizing
[CR018](cr018-story-titles-with-slashes-truncated-in-surfaces-and-scaffolds.md) on
2026-09-27, at `4169c2ad`, on a scratch project with an isolated `MIRROR_HOME`. A
Delivery Story whose candidate table held the row
``| CV1.DS1.US1 | Read `a \| b` input | User Story | 🟡 Planned |`` was pulled. Expand's
recommendation read ``🟩[US1] Read `a \``, and the child it wrote was headed
``# CV1.DS1.US1 — Read `a \``.

## Outcome

Pending.
