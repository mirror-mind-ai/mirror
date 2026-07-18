[< CV17](../index.md)

# CV17.DS4 — Fruit In Maturation

**Status:** ✅ Done

**Placement:** CV17 first Soul Mode state story

**User-visible outcome:** During an active rite, Mirror maintains one provisional fruit that can be refined across turns and rendered as Fruit In Maturation without writing to the journal.

---

## Why This Exists

Harvesting is the most delicate part of Soul Mode. The exploration rejected harvest as a final summary or a set of independent takeaways. The correct metaphor is **maturing one fruit**. Each turn may thicken, rewrite, or condense the same living harvest.

The surface is:

```text
Soul Mode
╭────────────────────────────────────────╮
│   ❦  FRUIT IN MATURATION               │
│                                        │
│   [current partial harvest]            │
│                                        │
│   continue if you want to mature more  │
│   or say you wish to harvest           │
╰────────────────────────────────────────╯
```

---

## Scope

- Add a session-scoped fruit state for the active Soul Mode experience.
- Store the current partial harvest without creating journal records.
- Let Mirror update the fruit when new user turns reveal more accurate material.
- Render Fruit In Maturation at appropriate moments inside the rite.
- Keep only the best current formulation, not a transcript of intermediate states.
- Support user language that indicates they want to mature more or harvest.

---

## Non-goals

- No journal persistence.
- No multiple fruits per session.
- No complex edit UI for fruit correction.
- No durable archive of every fruit revision.
- No requirement that every user turn updates the fruit.

---

## Acceptance Behavior

Given a rite is active and the user responds with meaningful material, Mirror can render a Fruit In Maturation surface with a provisional fruit.

Given the user continues, Mirror refines the same fruit rather than accumulating multiple unrelated harvests.

Given the user says they want to mature more, Mirror continues the rite and keeps the fruit provisional.

Given the user says they wish to harvest, Mirror moves to the harvest behavior owned by DS5.

Given the session has a fruit in maturation, no journal entry exists yet.

---

## References

- [CV17 Soul Mode](../index.md)
- Product Design Proposal
