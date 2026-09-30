[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR113 — The Pull card claims Prepare did not run, names every level a Delivery Story, and skips the parent

## Problem

`build pull-item` renders `DELIVERY_STORY_IDENTIFIED` (`renderPullReport`,
`ts/src/builder/pull.ts`) with four things that are not so.

**Its boundary line is false.** The card ends with `Prepare was not executed
automatically.` (`pull.ts:179`, a fixed string). The same command then runs Prepare and
prints `PREPARE_FIELD_READING` directly beneath it (`runPullItem`,
`ts/src/builder/commands.ts`), and the Builder skill documents that Pull runs Prepare.
Both cards arrive in one stdout, the first denying what the second shows. The goldens
record exactly this pair.

**Its title names the wrong level.** Every pull, of a Delivery Story, a User Story, or a
Technical Story, is headed `🟪■  DELIVERY STORY ACTIVATED` (`pull.ts:156`). The code
says so: "Every level renders the DELIVERY STORY ACTIVATED card, including a User Story.
Reproduced: the grammar is Python's, and changing it is a product decision." The
Python grammar is gone with its engine; the decision is now the Navigator's to take.

**Its placement tree skips the parent.** The tree prints the CV and the leaf:

```text
🟪[CV22] TypeScript Core Port (Database-Seam Strangler)
  └─ 🟦[US3] npm distribution
```

`CV22.DS10.US3` sits under DS10, which the tree does not show; the leaf's label is taken
from the last code segment into a variable named `dsCode` (`pull.ts:149`).
[CR018](cr018-story-titles-with-slashes-truncated-in-surfaces-and-scaffolds.md) named
the label and the one-segment rows as conscious exclusions; no Change Request carried
them.

**The ribbon marks a stage that never ran.** Every Delivery surface for an implementable
item shows `✓ Expand` once the cursor is past Prepare (`renderLifecycleRibbon`,
`ts/src/builder/lifecycleRibbon.ts`, which marks every stage before the current one as
done). A User Story or Technical Story never expands; the ribbon says it did.

## Expected Behavior

The Pull card states what happened: that Prepare ran, when it did, and what was not
executed. Its title names the level pulled — `USER STORY ACTIVATED`,
`TECHNICAL STORY ACTIVATED`, `DELIVERY STORY ACTIVATED` — with the level's own marker,
the way the roadmap tree already colors them. Its placement shows the item's lineage,
CV → Delivery Story → story, each with its code and title, so the reader sees where the
item lives. The ribbon shows Expand as not applicable for an implementable item, rather
than as done; a stage the item's level never reaches is drawn distinctly from one that
completed.

## Impact

Wrong at the decision point, and at the first one: the Pull card is what the Navigator
reads to confirm the right item was pulled before any plan exists. A boundary line that
denies what the next card shows, a level label that is wrong two times in three, and a
tree with the parent missing each cost the reader a second look; together they make the
card something the Navigator learns to skip, and a card nobody reads cannot stop a wrong
pull.

## Plan Or Decision

On the Ariad trust floor by the Navigator's decision of 2026-09-30
([Decisions](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)).
Goldens that record the card change by hand, each with its reason, as
`ts/test/goldens/README.md` requires.

## Evidence

Observed 2026-09-30 at `9dca47a0`, pulling `CV22.DS10.US3` (level `user_story`) in this
repository. The stdout held `DELIVERY_STORY_IDENTIFIED` ending in `Prepare was not
executed automatically.` followed by `PREPARE_FIELD_READING` with the ribbon at
`✓ Pull → ◉ Prepare`; the tree above is the one rendered. `build show` afterwards showed
`✓ Pull → ✓ Prepare → ✓ Expand → ◉ Plan`. The seven `DELIVERY_STORY_IDENTIFIED` entries
in `ts/test/goldens/builder-lifecycle.golden.json` and the two in
`builder-command.golden.json` carry the same line and label for every level.

## Outcome

Pending.
