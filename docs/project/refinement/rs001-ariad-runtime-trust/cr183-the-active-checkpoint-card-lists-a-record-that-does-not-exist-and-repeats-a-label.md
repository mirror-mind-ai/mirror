[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR183 — The active checkpoint card lists a record that does not exist, and repeats a label

## Problem

Two defects on `build show`'s `ACTIVE_CHECKPOINT` card, seen on 2026-10-28 during
CV9.DS9.US3, right after `plan-item`:

1. The records block showed `✓ review.md` while the package held only `index.md`,
   `plan.md`, and `test-guide.md`; `validation.md`, `coherence.md`, and `done.md` were
   correctly `○`. The next `build show`, after Validation, showed `✓ validation.md` and
   `○ review.md`, as the files were. So the check for `review.md` answered yes for a
   file that did not exist, once, with the same package path.
2. The `cadence profile` label printed twice, one row above the other, in one render,
   and once in the others.

## Expected Behavior

The records block reports each closure record present or missing from the file
system, every time; each label prints once.

## Impact

Low. The card is read-only and the cursor was right, but the records block is the
one place the skill tells the Driver to read for "which closure records exist", and a
`✓` for a missing file sends the Driver to read a record that is not there.

## Plan Or Decision

Captured, unassigned, 2026-10-28, from CV9.DS9.US3's Debt Review. First step when
pulled: reproduce from the `builder-command` fixture with a package at the Plan stage
and inspect how the records block is computed; the duplicated label suggests a row
emitted twice under one condition.

## Evidence

- The two `build show` renders in CV9.DS9.US3's session, 2026-10-28 (the first after
  `plan-item`, the second after `validate-item`).
- `ls` of the package between them: `index.md plan.md test-guide.md`.

## Outcome

Pending: captured, not planned.
