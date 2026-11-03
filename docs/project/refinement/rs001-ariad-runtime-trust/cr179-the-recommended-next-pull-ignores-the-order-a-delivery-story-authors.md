[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR179 — The recommended next pull ranks a user story above a technical story, ignoring the order a Delivery Story authors

## Problem

`recommend()` (`ts/src/builder/pullCandidates.ts`, the port of Python's `_recommend`)
chooses the "recommended next pull" by status first and level second. Among Planned
candidates, a user story beats a technical story, and the scan order breaks the
remaining ties. The order a Delivery Story's candidate table gives its children is
never consulted. That order is authored, and it often carries a dependency.

Seen on 2026-10-26. When CV9.DS9.TS1 closed, the `PROJECT_POSITION` card recommended
CV9.DS9.US3, "The extraction pin moves, or stays, on the evidence". But DS9's table
orders TS2 before US3: "the Navigator's own conversations second; the decision last".
US3 decides on TS2's evidence, which does not exist yet. On the same screen, the Done
checkpoint's own next recommendation, the Driver's, named TS2. The two surfaces
disagreed.

## Expected Behavior

- Among the children of the active item's Delivery Story, the recommended pull is the
  first row of its candidate table that is not Done.
- The level and status preferences rank only candidates that no authored order ranks.
- A recommendation never contradicts the Delivery Story it sits in.

## Impact

Low to medium. A Navigator who trusts the card pulls a story whose inputs do not exist
yet, unless the Driver notices and overrides it. That is the same trust gap CR002
closed for the journey, here inside one Delivery Story.

## Plan Or Decision

Captured, unassigned, 2026-10-26, from CV9.DS9.TS1's close, at the Navigator's
direction.

CR002 scoped the recommendation to the active Capability Value; it left the ranking
inside a Delivery Story as it was. The ranking is the oracle's: the docstring keeps
Python's rule ("status is the OUTER loop and level the inner one"), and the fallback
to scan order.

**Revisit:** the next change to pull candidates or to the position and orientation
surfaces.

## Evidence

- The `PROJECT_POSITION` surface printed by `build done-item` for CV9.DS9.TS1 on
  2026-10-26: "What looks next? 🟦[CV9.DS9.US3] … recommended next pull".
- `recommend()` in `ts/src/builder/pullCandidates.ts`: the outer loop is over
  `["Planned", "Candidate", "Active", "Blocked"]`, and the inner loop over
  `["user_story", "technical_story", "delivery_story"]`.
- CV9.DS9's `index.md`, *Candidate Stories*: TS1, TS2, US3, in that order, and why.

## Outcome

Pending: captured, not planned.
