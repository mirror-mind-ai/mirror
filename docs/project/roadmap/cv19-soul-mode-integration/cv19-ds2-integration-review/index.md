[< CV19](../index.md)

# CV19.DS2 — Integration Review

**Status:** ✅ Done

**Placement:** Second story in `v0.26.0 — Soul Mode Integration`

**User-visible outcome:** After a Closing Rite, the user can review what may want to remain without Mirror mutating identity.

---

## Why This Exists

Closing Rite gathers the living material of the Soul Mode session. Integration Review asks what kind of material appeared and where it may belong.

This is not yet a proposal and not yet mutation. It is a visible discernment surface between ritual closure and identity editing.

---

## Scope

- Add an Integration Review surface for Soul Mode.
- Support review categories:
  - journal;
  - self;
  - shadow;
  - ego behavior;
  - persona;
  - leave open.
- Add CLI rendering support for review.
- Update the Pi Soul Mode skill so the post-closing invitation can lead to review.
- Ensure the surface states that no identity was changed.

---

## Non-goals

- No journey identity / journey pattern category.
- No identity diff proposal.
- No identity mutation.
- No journal save.
- No automatic integration after Closing Rite.
- No web UI.

---

## Acceptance Behavior

Given the user asks to see what may want to remain after Closing Rite, Mirror renders an Integration Review surface.

Given the review renders, it may include journal, self, shadow, ego behavior, persona, and leave open sections, omitting empty categories.

Given the review renders, it clearly says `review only — no identity changed`.

Given the review renders, no identity entry, journal entry, journey state, or project file is mutated.

Given material might belong to journey identity, Mirror leaves it out for now because journey identity is not mature enough for this integration release.

---

## References

- [CV19 — Soul Mode Integration](../index.md)
- [CV19.DS1 — Closing Rite](../cv19-ds1-closing-rite/index.md)
