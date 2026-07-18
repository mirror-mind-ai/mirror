[< CV17](../index.md)

# CV17.DS5 — Harvest And Journal Record

**Status:** ✅ Done

**Placement:** CV17 persistence boundary story

**User-visible outcome:** The user can close the fruit, see a Harvested Fruit surface, and explicitly choose whether to save one journal entry.

---

## Why This Exists

Soul Mode must preserve the journal as a meaningful record, not a conversation log. The journal should receive the fruit only after the user decides to harvest and confirms saving.

The final surface is:

```text
Soul Mode
╭────────────────────────────────────────╮
│   ❦  HARVESTED FRUIT                   │
│                                        │
│   [final fruit]                        │
│                                        │
│   save to journal?                     │
╰────────────────────────────────────────╯
```

---

## Scope

- Recognize natural-language harvest intent.
- Close the current fruit into a final harvested fruit.
- Render the Harvested Fruit surface.
- Ask whether the user wants to save it to the journal.
- Persist exactly one journal entry when the user confirms.
- Include enough metadata to know the entry came from Soul Mode, without overbuilding the schema.
- Clear or close session fruit state after save or explicit decline.

---

## Non-goals

- No journaling at each fruit thickening.
- No multiple journal entries for one Soul Mode experience.
- No full journal editing workflow.
- No rich tagging or analytics unless already supported cheaply.
- No automatic saving without confirmation.

---

## Acceptance Behavior

Given a fruit is in maturation, when the user says they wish to harvest, Mirror renders Harvested Fruit with the final formulation.

Given Harvested Fruit is shown, Mirror asks whether to save to journal.

Given the user confirms saving, one and only one journal entry is created.

Given the user declines saving, no journal entry is created and the session fruit is closed or cleared.

Given the user never harvests, no journal entry is created from Soul Mode by default.

---

## References

- [CV17 Soul Mode](../index.md)
- Product Design Proposal
