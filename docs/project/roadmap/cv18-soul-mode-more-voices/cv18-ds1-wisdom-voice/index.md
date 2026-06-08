[< CV18](../index.md)

# CV18.DS1 — Wisdom Voice

**Status:** 🟢 Implemented · awaiting Pi validation

**Placement:** First new voice in `v0.25.0 — Soul Mode More Voices`

**User-visible outcome:** A user can ask to hear Wisdom Voice during Soul Mode and receive a coherent ritual listening card.

---

## Why This Exists

The first Soul Mode release names a larger constellation than it can yet render. Wisdom is one of the voices the user can intuitively expect to hear, but it is not yet active.

Wisdom Voice is not a generic advisor. It lets the user's material be crossed by a situated idea from a thinker, philosopher, sacred text, ancient tradition, proverb, contemplative teaching, or other relevant wisdom text. It should cite the author, tradition, and work when reliable, and it should deepen the user's situation rather than return a short aphorism.

---

## Scope

- Add Wisdom Voice as an active Soul Mode listening lens.
- Include Wisdom Voice in Possible Listenings when living matter is sufficient.
- Render Wisdom Voice with the same ritual grammar as Self and Shadow.
- Add the prompt and command/service behavior needed for the user to hear the voice.
- Guide Wisdom Voice to cite a source when reliable and to avoid fabricated bibliographic precision.
- Preserve the rule that voice content appears inside the card under `the voice says`.
- Keep Mirror's bridge outside the voice card.
- Ensure Wisdom Voice does not mutate identity, journal, journey state, or project files.

---

## Non-goals

- No Wisdom fragment library.
- No Passagem curation.
- No advice engine.
- No closing integration rite.
- No psyche-layer enrichment.
- No identity mutation.
- No rich UI.

---

## Acceptance Behavior

Given Soul Mode has enough living matter, Possible Listenings includes Wisdom Voice as an available listening.

Given the user asks to hear Wisdom Voice, Mirror renders a Wisdom Voice listening card with what the voice says and what it is listening for.

Given Wisdom Voice responds, it names a relevant thinker, text, tradition, proverb, or teaching when reliable, explains why it crosses the user's material, and deepens discernment rather than prescribing next steps.

Given Wisdom Voice runs, no journal entry, identity entry, or project-state mutation is created automatically.

---

## References

- [CV18 — Soul Mode More Voices](../index.md)
- [CV17.DS3 — Active listening lenses and minimal voices](../../cv17-soul-mode/cv17-ds3-active-rite-minimal-voices/index.md)
