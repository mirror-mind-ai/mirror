[< CV19](../index.md)

# CV19.DS2 — Integration Proposal

**Status:** ✅ Done

**Placement:** Second story in `v0.26.0 — Soul Mode Integration`

**User-visible outcome:** After a Closing Rite, the user can see a multi-layer integration proposal and decide whether to register it as-is, adjust it, or leave it unapplied.

---

## Why This Exists

Closing Rite gathers the living material of the Soul Mode session. Integration Proposal turns that material into proposed integration text for the relevant identity layers.

This is a proposal, but not mutation. It is the visible surface between ritual closure and identity editing.

---

## Scope

- Add an Integration Proposal surface for Soul Mode.
- Support proposal sections:
  - origin;
  - self;
  - shadow;
  - ego behavior;
  - persona;
  - leave open.
- Add CLI rendering support for proposal.
- Update the Pi Soul Mode skill so the post-closing invitation can lead to the proposal.
- Ensure the surface states that nothing changed yet.

---

## Non-goals

- No journey identity / journey pattern category.
- No separate second proposal card is required before confirmation.
- No identity mutation.
- No journal save.
- No automatic integration after Closing Rite.
- No web UI.

---

## Acceptance Behavior

Given the user asks to see what may want to remain after Closing Rite, Mirror renders an Integration Proposal surface.

Given the proposal renders, it may include origin, self, shadow, ego behavior, persona, and leave open sections, omitting empty categories.

Given the proposal renders, it clearly says `proposal only — nothing changed`.

Given the proposal renders, no identity entry, journal entry, journey state, or project file is mutated.

Given material might belong to journey identity, Mirror leaves it out for now because journey identity is not mature enough for this integration release.

---

## References

- [CV19 — Soul Mode Integration](../index.md)
- [CV19.DS1 — Closing Rite](../cv19-ds1-closing-rite/index.md)
