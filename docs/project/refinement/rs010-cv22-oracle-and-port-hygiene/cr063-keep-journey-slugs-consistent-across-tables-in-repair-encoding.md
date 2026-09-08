[< RS010](index.md)

# CR063 — Keep journey slugs consistent across tables in repair-encoding

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`repair-encoding` scans `memories.journey`, `conversations.journey`, and
`tasks.journey` as user text and repairs mojibake in them cell by cell. Those
columns are join keys to `identity.key` on the `journey` layer, which the
command does not scan (only `identity.content`). A journey slug stored as
mojibake on one side and repaired on the other stops joining: the memory or
conversation silently leaves its journey. The scan also does not consider
`memories.layer` / `tasks.status` as enumerations, though it lists them as
targets. CV22.DS7.TS1 reproduced the target list exactly
(`ts/src/repair/encodingRepair.ts`, `TEXT_TARGETS`) and pinned it in the
golden, including a repaired `memories.journey` cell.

## Expected Behavior

Either the slug columns are excluded from cell-wise repair and handled as a
coordinated rename (repair the identity key and every referencing column in
one transaction, or none), or the dry run reports slug hits separately with
the cross-table consequence stated, so `--apply` cannot break a join by
accident. The golden gains a fixture with a mojibake slug present on both
sides of the join.

## Impact

Low frequency (the mojibake population is small and shrinking; the
Navigator's live database has zero hits), but the failure is silent data
detachment on the command whose purpose is data repair.

## Plan Or Decision

Decide the behavior first (coordinated rename versus report-only); then TS
first, Python second, golden and oracle baseline in the same commit. Not
urgent; revisit before DS10 deletes the Python side so the decision is made
while both cores can still be compared.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Database-architect finding in CV22.DS7.TS1's plan review; captured at that
story's Debt Review on 2026-09-08.
