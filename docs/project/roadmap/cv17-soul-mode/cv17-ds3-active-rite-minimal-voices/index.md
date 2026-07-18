[< CV17](../index.md)

# CV17.DS3 — Active Rite And Minimal Voices

**Status:** ✅ Done

**Placement:** CV17 first rite behavior story

**User-visible outcome:** When the user chooses Self Voice or Shadow Voice from Possible Listenings, Mirror renders the corresponding listening surface with what the voice says, then bridges that utterance back into the conversation.

---

## Why This Exists

The exploration decided that choosing a listening already opens the rite. There should be no heavy pre-rite phase. The listening is the subjective doorway; the rite is the guided form of that listening.

The first release should validate the smallest meaningful voice set: Self Voice and Shadow Voice. Wisdom Voice, Beauty Voice, Passagem, and Return To Center remain part of the architecture, but they do not need full behavior before the core grammar is proven.

---

## Scope

- Recognize natural-language choices for Self Voice and Shadow Voice.
- Render the active rite surface immediately after the choice.
- Conduct Self Voice around principles, non-negotiable values, and internal constitution.
- Conduct Shadow Voice around listening to the rejected part without punishment or governance.
- Keep the conversation alive rather than turning the rite into a form.
- Prepare handoff to DS4 by identifying candidate fruit material during the rite.

---

## Non-goals

- No full Wisdom Voice.
- No full Beauty Voice.
- No full Passagem fragment curation.
- No Return To Center implementation unless needed as a small exit behavior.
- No journal persistence.
- No multi-rite orchestration beyond one active rite.

---

## Acceptance Behavior

Given Possible Listenings are visible, when the user chooses Self Voice, Mirror renders the Self Voice listening surface with a short symbolic utterance oriented toward principle or value.

Given Possible Listenings are visible, when the user chooses Shadow Voice, Mirror renders the Shadow Voice listening surface with a short symbolic utterance revealing what the rejected part protects.

Given a voice has been heard, Mirror makes an interpretive bridge from the utterance back to the conversation rather than roleplaying the voice as a separate interlocutor.

Given the user responds inside the rite, Mirror can deepen once or twice without forcing all internal rite fields onto the user.

---

## References

- [CV17 Soul Mode](../index.md)
- Product Design Proposal
