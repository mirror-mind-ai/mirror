[< CV19](../index.md)

# CV19.DS1 — Closing Rite

**Status:** ✅ Done

**Placement:** First story in `v0.26.0 — Soul Mode Integration`

**User-visible outcome:** A user can close the Soul Mode session opened by the day-entry question and see a ritual closing surface that gathers what was harvested, what still echoes, what remains open, and what may want integration.

---

## Why This Exists

Soul Mode can now open, listen, voice, mature, and harvest. But it does not yet have a clean ritual closing.

Without a Closing Rite, the user can leave with insight but no threshold. The rite needs a final surface that honors what appeared without immediately turning it into identity mutation, advice, or tasks.

Closing is not integration yet. It is the threshold before integration. It also is not necessarily an immediate exit from Soul Mode. After the Closing Rite, Mirror asks whether another theme filled the day or whether to end for today.

---

## Scope

- Add a Closing Rite surface for Soul Mode.
- Allow callers to pass situated closing material:
  - what was harvested;
  - what still echoes;
  - what remains open;
  - what may want integration.
- Add CLI rendering support for the closing rite.
- Update the Pi Soul Mode skill so natural-language requests like “let's close”, “encerrar”, or “fechar o rito” render the Closing Rite.
- Ensure closing does not save a journal entry, mutate identity, or apply integration.
- After a successful journal save, route immediately into Closing Rite and ask whether the user wants to review what may want to remain.
- If the user chooses to end after closing, exit Soul Mode back to Mirror Mode with a short farewell.

---

## Non-goals

- No integration review classification yet.
- No psyche enrichment proposal yet.
- No identity mutation.
- No automatic journal save.
- No web UI.
- No new voice behavior.

---

## Acceptance Behavior

Given the user asks to close the Soul Mode session, Mirror renders a Closing Rite surface.

Given the Closing Rite renders, it includes what was harvested when available and can also include what still echoes, what remains open, and what may want integration.

Given the Closing Rite renders, no identity entry, journal entry, journey state, or project file is mutated automatically.

Given a journal harvest is saved, Mirror immediately renders Closing Rite and asks: `There is living material that may want to remain as part of your Mirror identity. Do you want to integrate it now?`

Given the user indicates they are done after closing, Mirror exits Soul Mode and returns to Mirror Mode with a short farewell.

Given the user asks whether something should remain in identity, Mirror can name that this belongs to a future Integration Review or proposal step, not to Closing Rite itself.

---

## References

- [CV19 — Soul Mode Integration](../index.md)
- [CV18 — Soul Mode More Voices](../../cv18-soul-mode-more-voices/index.md)
